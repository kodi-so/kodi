# Kodi OpenClaw Bridge Implementation Spec

This document translates [architecture-plan.md](./architecture-plan.md) into a build plan.

## Purpose

When this work is complete, every org's OpenClaw instance runs a single `kodi-bridge` plugin that provides:

- per-user agent provisioning and deprovisioning inside the instance
- always-on Composio tool access, scoped to the acting user
- a typed, versioned, bidirectional protocol between Kodi and the plugin
- per-agent autonomy policy enforcement with approval routing back to Kodi
- pull-based self-update with rollback
- a documented module slot that the Org Memory team will fill in

Kodi gains a reliable, governed runtime bridge it can ingest events from, push commands to, update, and extend without redeploying plugins.

## Implementation Decisions

The following decisions are locked for this plan:

- **One plugin**, named `kodi-bridge`, installed inside every OpenClaw instance. The memory plugin proposed in [docs/memory/implementation-spec.md](../memory/implementation-spec.md) is absorbed as a module named `memory` inside `kodi-bridge`, preserving the exact contract the memory team specified.
- **Multi-agent per instance**: one OpenClaw agent per (org, user) pair. Composio sessions are created per agent, not per instance, so identity and connections are correctly attributed.
- **Injected, not published**: the plugin lives in `packages/openclaw-bridge` in the Kodi monorepo, is bundled by CI into a single-file artifact, uploaded to Kodi's S3 bucket, and pulled onto instances during cloud-init. Never published to ClawHub or npm.
- **Bundle distribution via S3 signed URLs** minted by a Kodi API endpoint, authenticated with the per-instance gateway token.
- **Pull-based self-update** via a Kodi bundle endpoint, with atomic symlink swaps and automatic rollback.
- **Composio tools are registered via `api.registerTool(...)` from inside the plugin** (see [`spike/m0-mcp.md`](./spike/m0-mcp.md)). Each action exposed by the user's Composio session becomes one registered tool; the `execute` closure holds a reference to the per-user Composio SDK session. `openclaw mcp set` is **not** used — it targets CLI-backend subprocess injection, not the embedded Pi agent that serves `/v1/chat/completions`. Memory tools also use `api.registerTool(...)` calling Kodi over HTTP; a Kodi-hosted memory MCP is deferred.
- **Autonomy levels** are `strict`, `normal` (default), `lenient`, `yolo`, with optional per-toolkit or per-action overrides. Policies are stored in Kodi and fetched by the plugin.
- **Protocol** is `kodi-bridge.v1`: typed event kinds, idempotency keys, HMAC-signed in both directions.
- **Approvals** reuse the existing `approvals` schema and UI surface; the plugin does not introduce a parallel approval model.
- **Existing `tool-access-runtime.ts`** chat flow continues to function unchanged. Convergence of the synchronous and autonomous paths is out of scope.
- **Greenfield**: no existing instance migration is needed; there are no production instances to backfill.

## System Overview

The implementation has five parts:

1. Kodi-side infrastructure: schema, S3 bucket, bundle API, event API, HMAC utilities
2. The `kodi-bridge` plugin: one package, eight modules
3. Provisioning flow updates: cloud-init and agent lifecycle wiring
4. Observability and recovery: heartbeats, circuit breakers, rollback, runbook
5. Memory module slot: a documented integration point ready for the memory team

## 1. Kodi-Side Infrastructure

### 1.1 Schema Additions

The following schema additions land in `packages/db` before anything else is built.

#### `instances` (existing table, add columns)

- `plugin_version_installed` text, nullable. The version the plugin last reported running.
- `plugin_hmac_secret_encrypted` text, nullable. Per-instance shared secret for signing in both directions, distinct from the gateway token so the two concerns are separable.
- `last_plugin_heartbeat_at` timestamptz, nullable. Updated on every `heartbeat` event.
- `bundle_version_target` text, nullable. If set, the plugin installs this specific version; if null, it follows "latest".

#### `openclaw_agents` (new table)

Tracks the N agents inside each org's instance, one per (org, user).

- `id` uuid primary key
- `instance_id` uuid, foreign key to `instances`
- `org_id` uuid, foreign key to orgs
- `user_id` uuid, foreign key to users
- `openclaw_agent_id` text — stable agent ID inside the gateway, assigned at provision time
- `composio_user_id` text — passed to `composio.create(user_id=...)`
- `composio_session_enc` jsonb encrypted — `{ mcp_url, headers }` returned by `composio.create()`
- `composio_status` enum(`active`, `failed`, `disconnected`)
- `status` enum(`provisioning`, `active`, `suspended`, `deprovisioned`, `failed`)
- `created_at`, `updated_at`
- Unique `(instance_id, user_id)`
- Unique `(instance_id, openclaw_agent_id)`

#### `agent_autonomy_policies` (new table)

One row per agent. Missing rows are treated as `normal`.

- `agent_id` uuid primary key, foreign key to `openclaw_agents`
- `autonomy_level` enum(`strict`, `normal`, `lenient`, `yolo`), default `normal`
- `overrides` jsonb, nullable — per-toolkit or per-action action-class overrides, e.g. `{"slack.send_message": "ask", "github.merge_pr": "deny"}`
- `updated_by_user_id` uuid, foreign key to users
- `updated_at`

#### `plugin_event_subscriptions` (new table)

Per-instance configuration that tells the plugin what to emit.

- `instance_id` uuid primary key
- `protocol_version` text
- `subscriptions` jsonb — a map of event kind to `{ enabled: bool, verbosity: 'summary' | 'full' }`
- `updated_at`

#### `plugin_versions` (new table)

Registry of published plugin bundle versions.

- `version` text primary key — scheme is `YYYY-MM-DD-<shortsha>`
- `bundle_s3_key` text — S3 key for the bundle artifact
- `sha256` text — hex digest of the bundle archive
- `released_at` timestamptz
- `notes` text, nullable — release notes or change summary

#### `plugin_event_log` (new table)

Append-only audit log of events received from plugins. Retention policy is defined in M8.

- `id` uuid primary key
- `instance_id` uuid, foreign key to `instances`
- `agent_id` uuid, nullable, foreign key to `openclaw_agents`
- `event_kind` text
- `protocol_version` text
- `payload_json` jsonb
- `idempotency_key` text
- `received_at` timestamptz
- Unique `(instance_id, idempotency_key)` to enforce dedupe

### 1.2 S3 Bucket For Plugin Bundles

A new S3 bucket, configured via Terraform or manual provisioning, stores plugin bundle archives.

- Object naming: `bundles/<version>/kodi-bridge.tgz`
- Access: bucket is private; objects are served to instances via time-limited signed URLs generated by the Kodi API.
- Retention: no auto-expiry; versions are kept for rollback.
- CORS: not required (plugin fetches server-side).

Env var additions:

- `PLUGIN_BUNDLE_S3_BUCKET`
- `PLUGIN_BUNDLE_S3_REGION`
- `PLUGIN_BUNDLE_URL_TTL_SECONDS` — default 600

### 1.3 Kodi API Surface

All new endpoints live under `apps/api/src/routers`. Authentication is via the instance's gateway token unless stated otherwise.

#### Bundle and version endpoints

- `GET /api/plugin-bundle/latest?current_version=<string>` — instance-authenticated. Returns `{ version, bundle_url, sha256, released_at }` or 304 if already on the latest. `bundle_url` is a signed S3 URL expiring in `PLUGIN_BUNDLE_URL_TTL_SECONDS`.
- `GET /api/plugin-bundle/:version` — instance-authenticated. Same shape, specific version. Used when `instances.bundle_version_target` is set.
- `POST /api/internal/plugin-versions/publish` — admin-only. Accepts a bundle archive, computes sha256, uploads to S3, inserts `plugin_versions` row.

#### Plugin event ingress

- `POST /api/openclaw/events` — instance-authenticated. Verifies HMAC, dedupes on idempotency key, inserts into `plugin_event_log`, dispatches to per-kind handlers.

#### Subscription management

- `GET /api/openclaw/subscriptions?instance_id=<id>` — returns current subscription config.
- `PUT /api/openclaw/subscriptions` — updates subscription config; Kodi then POSTs `/config/subscriptions` to the plugin to push the change immediately (plugin also re-fetches on its own cadence as a fallback).

#### Agent lifecycle (Kodi → instance control)

These endpoints are invoked by Kodi's own membership flow; they call the plugin's inbound routes under the hood.

- `POST /api/openclaw/agents` — body `{ org_id, user_id }`. Kodi creates a Composio session, inserts an `openclaw_agents` row with `status='provisioning'`, calls the plugin's `/agents/provision`, updates status on response.
- `DELETE /api/openclaw/agents/:id` — reverse.
- `PUT /api/openclaw/agents/:id/autonomy` — updates policy; Kodi persists and POSTs `/agents/update-policy` to the plugin.

#### Memory service auth (stub in this plan, real in memory project)

- `POST /api/openclaw/memory/:tool` — authenticates as `{ service_token, agent_id }` derived from the HMAC envelope, returns 501 until the memory team implements it. The plugin calls this endpoint from its `memory` module.

#### Approvals

- `POST /api/openclaw/approvals/:id/resolve` — plugin-facing callback. The approval record itself uses the existing `approvals` schema.

### 1.4 HMAC Signing Contract

Both directions use HMAC-SHA256 with the instance's `plugin_hmac_secret` (separate from `gateway_token`). Signing covers:

- The raw request body
- Canonical timestamp header `x-kb-timestamp` (unix ms)
- Canonical nonce header `x-kb-nonce` (uuid)

Header `x-kb-signature: <hex>` carries the signature. Receivers must reject messages with a timestamp older than 5 minutes and must dedupe by nonce within the acceptance window.

A shared utility lives in `packages/shared/hmac.ts` so Kodi and plugin use byte-identical signing.

## 2. The `kodi-bridge` Plugin

### 2.1 Package Layout

```
packages/openclaw-bridge/
  openclaw.plugin.json
  package.json
  tsconfig.json
  esbuild.config.mjs
  src/
    index.ts                       # definePluginEntry — wires modules
    modules/
      bridge-core/
        config.ts
        kodi-client.ts             # authenticated HTTP client to Kodi
        identity.ts                # plugin/instance identity
        health.ts                  # /health route
      agent-manager/
        provision.ts
        deprovision.ts
        reconcile.ts
        registry.ts                # in-memory agent registry
      composio/
        register-tools.ts          # api.registerTool per Composio action, per user
        session.ts                 # per-user Composio SDK session cache
        rotate.ts                  # refresh session + re-register tools on credential change
      event-bus/
        subscriptions.ts
        emitter.ts                 # signed POST with retry + disk buffer
        hook-bindings.ts           # OpenClaw hook → emitter
        outbox.ts                  # disk-backed retry buffer
      inbound-api/
        router.ts                  # registers HTTP routes with OpenClaw
        verify.ts                  # HMAC middleware
      autonomy/
        policy.ts
        interceptor.ts             # pre-tool-invoke enforcement
        approvals.ts               # approval request + wait
      updater/
        check.ts
        download.ts
        swap.ts
        rollback.ts
      memory/
        slot.ts                    # registration API for memory tools
        stub.ts                    # memory.ping
    types/
      protocol.ts                  # event envelope, kinds, payloads
      config.ts
  dist/
    index.js                       # esbuild output, single file
  MEMORY_CONTRACT.md               # integration contract for memory team
  README.md
```

### 2.2 Manifest And Entry

`openclaw.plugin.json` declares:

- `id: "kodi-bridge"`
- `configSchema` — JSON Schema for the per-instance config block; strict, `additionalProperties: false`
- `openclaw.compat` — version range supported

`package.json` declares `openclaw.extensions: ["./dist/index.js"]`. The plugin runs in OpenClaw's in-process `jiti` loader, so we ship a single esbuild-bundled file. Dependencies are bundled; no `node_modules` to ship.

The entry calls `definePluginEntry({ register })`. `register(api)` calls each module's `register(api, context)` function in sequence, where `context` holds the loaded config, a `KodiClient`, and the HMAC secret accessor.

### 2.3 Config Schema

Loaded from `plugins.entries["kodi-bridge"].config` at gateway startup:

```jsonc
{
  "instance_id": "uuid",
  "org_id": "uuid",
  "kodi_api_base_url": "https://api.kodi.so",
  "plugin_hmac_secret_ref": { "source": "env", "id": "KODI_BRIDGE_HMAC_SECRET" },
  "gateway_token_ref":      { "source": "env", "id": "OPENCLAW_GATEWAY_TOKEN" },
  "bundle_check_interval_seconds": 3600,
  "heartbeat_interval_seconds": 60,
  "outbox_path": "/opt/kodi-bridge/outbox",
  "log_level": "info"
}
```

### 2.4 Module Specs

#### 2.4.1 `bridge-core`

Loads and validates config. Exposes:

- `getIdentity()` — instance and org IDs for event envelopes
- `kodiClient` — HTTP client that signs every outbound request with HMAC and attaches the gateway token as `Authorization: Bearer`
- `GET /plugins/kodi-bridge/health` — returns `{ version, uptime_s, agent_count, last_heartbeat_sent_at }` for debug

Every other module depends on `bridge-core`.

#### 2.4.2 `agent-manager`

Manages OpenClaw agents for the users of this org.

- On `register(api)`, reconciles by calling `GET /api/openclaw/agents?instance_id=<id>` for the authoritative list, then creates missing local agents and marks orphans for deprovision.
- Provisioning: calls `api.runtime.agent.*` (or Gateway RPC equivalent, pending M0-T3) to create an agent workspace directory, writes `IDENTITY.md` and `HEARTBEAT.md`, records the agent locally, returns the `openclaw_agent_id` to Kodi.
- Deprovisioning: disables the agent, drops its per-user Composio SDK session and unregisters its Composio tools, purges its workspace directory.
- Keeps an in-memory registry keyed by both `user_id` and `openclaw_agent_id` for fast lookups during tool interception.

#### 2.4.3 `composio`

Registers Composio actions as plugin tools, scoped per agent.

- Kodi creates the Composio SDK session for the user and sends `{ session_id, toolkit_allowlist, user_id }` (opaque to the plugin) in the `/agents/provision` body.
- Plugin caches the Composio session handle keyed by `openclaw_agent_id`. It reflects on the session to list available actions in the user's allowlist.
- For each action, the plugin calls `api.registerTool({ name: "composio__<toolkit>__<action>", parameters, execute })`. The `execute` closure captures the agent id, resolves the cached Composio session, and dispatches via `composioClient.tools.execute(action, params, { user_id })`. Tool names are stable and deterministic so the model can discover them reliably.
- Scoping: if an agent's allowlist changes, the plugin calls `api.unregisterTool` for removed actions and `api.registerTool` for added ones. No subprocess churn, no config file rewrite.
- On session rotation (Kodi detects a stale session and issues a rotate): `composio/rotate.ts` replaces the cached session handle; no re-registration needed if the action set is unchanged.
- On Composio failure (session creation fails, Composio API refuses): agent provisioning proceeds without Composio; `composio_status` marked `failed`; `composio.session_failed` event emitted.
- Autonomy (`before_tool_call` hook) sees these as normal plugin-registered tools — no special case needed in the autonomy module.

#### 2.4.4 `event-bus`

Owns outbound event delivery.

- Subscribes to OpenClaw hooks (`message:received`, `message:sent`, `session:compact:after`, `command:new`, `command:stop`, `agent:bootstrap`) and translates each into the bridge's own typed events.
- Reads subscriptions config at startup and on `/config/subscriptions` calls.
- For each hook firing, checks subscription (enabled? verbosity?) and either skips, emits summary, or emits full payload.
- Attaches an `idempotency_key` (uuid v4) to every event.
- `emitter` signs with HMAC, POSTs to Kodi `/api/openclaw/events`, retries with exponential backoff up to 5 attempts, falls back to disk outbox.
- `outbox` flush loop: drains buffered events on every successful call or every 30 seconds, whichever comes first.

#### 2.4.5 `inbound-api`

Registers the HTTP routes Kodi calls into. Each route is wrapped with HMAC verification middleware from `verify.ts`.

- `POST /plugins/kodi-bridge/agents/provision` — `{ org_id, user_id, composio_session?: {...} }` — returns `{ openclaw_agent_id }`
- `POST /plugins/kodi-bridge/agents/deprovision` — `{ user_id }`
- `POST /plugins/kodi-bridge/agents/update-policy` — `{ user_id, autonomy_level, overrides }`
- `POST /plugins/kodi-bridge/agents/:agentId/inject` — `{ message, session_key? }`
- `POST /plugins/kodi-bridge/agents/:agentId/push-event` — `{ kind, payload }`
- `POST /plugins/kodi-bridge/approvals/:id/resolve` — `{ approved, reason? }`
- `POST /plugins/kodi-bridge/config/subscriptions` — `{ subscriptions }`
- `POST /plugins/kodi-bridge/admin/update` — `{ version? }`
- `POST /plugins/kodi-bridge/admin/reload`

Every route is idempotent (dedupe on HMAC nonce) and returns `{ ok: true, ... }` or a structured error with a machine-readable `code`.

#### 2.4.6 `autonomy`

Enforces per-agent policy at tool-invocation time.

- On `register`, subscribes to the pre-tool-invoke hook (confirmed in M0-T2). If the hook does not exist, the fallback is to re-register Composio and memory tools under wrapped names whose `execute()` delegates to the real invocation, with the interceptor running inside `execute()`.
- For each intercepted call, classifies as read/draft/write/admin using the shared verb lists lifted from `apps/api/src/lib/tool-access-runtime.ts`.
- Evaluates against the agent's autonomy level and any overrides.
- Outcomes:
  - `allow` — no-op; invocation proceeds
  - `deny` — returns an error tool result with a clear reason; emits `tool.denied`
  - `require_approval` — blocks via an async promise; emits `tool.approval_requested`; polls until Kodi POSTs `/approvals/:id/resolve`; proceeds or denies based on response. Timeout configurable per level (default 10 minutes for `strict`, 2 minutes for `normal`).
- Always emits `tool.invoke.before` and `tool.invoke.after` for audit.

#### 2.4.7 `updater`

Pull-based self-update.

- On `register`, runs a check immediately, then starts a cron at `bundle_check_interval_seconds`.
- `check.ts` calls `GET /api/plugin-bundle/latest?current_version=<v>`. Receives 200 with newer version or 304.
- `download.ts` fetches the signed S3 URL, verifies sha256, extracts to `/opt/kodi-bridge/<new-version>/`.
- `swap.ts` runs a pre-swap health probe (loads the new bundle in a subprocess, checks it exports the expected entry), then atomically flips `/opt/kodi-bridge/current` via `ln -sfn`.
- Calls `openclaw gateway restart` (or the SDK equivalent), waits for the new plugin's `plugin.started` event at Kodi; if the event does not arrive within 60 seconds, `rollback.ts` flips the symlink back.
- Retains the last 2 versions on disk.
- Emits `plugin.update_check`, `plugin.update_attempted`, `plugin.update_succeeded`, `plugin.update_failed`, `plugin.update_rolled_back`.

#### 2.4.8 `memory`

A named slot for the memory team. Ships as a stub only in this initiative.

- Exposes a `registerMemoryTool(spec)` API internal to the plugin; the memory team adds its real tools via a follow-on code change inside this module.
- Ships one real tool, `memory.ping`, that POSTs to `POST /api/openclaw/memory/ping` and returns `{ pong: true }`. This exercises the full request path (identity capture, HMAC, routing) so the memory team inherits a working channel.
- Captures trusted agent identity from the pre-tool-invoke hook per the contract in [docs/memory/implementation-spec.md § 8](../memory/implementation-spec.md) — `agentId`, `sessionKey`, `toolCallId` — before the tool's `execute()` runs. Sends that identity in the Kodi call; fails closed if identity is missing.
- `MEMORY_CONTRACT.md` in the package documents the registration API and the trusted-identity lifecycle for the memory team.

### 2.5 Build And Bundle

CI builds `packages/openclaw-bridge` on merges to `main`:

1. `pnpm install`
2. `pnpm --filter openclaw-bridge build` → runs esbuild to produce `dist/index.js`
3. Archive: `tar -czf kodi-bridge.tgz dist/ openclaw.plugin.json package.json`
4. Compute sha256 of archive
5. Upload to S3 at `bundles/<version>/kodi-bridge.tgz`
6. POST to `/api/internal/plugin-versions/publish` with `{ version, bundle_s3_key, sha256, notes }`

Version scheme: `YYYY-MM-DD-<short-git-sha>`.

## 3. Provisioning Flow Updates

### 3.1 Cloud-Init

`apps/api/src/routers/instance/cloud-init.ts` is extended to:

1. Generate and persist `plugin_hmac_secret` for the new instance (encrypted at rest).
2. Fetch the latest bundle URL via the admin-only internal API (at provision time we trust ourselves).
3. Write the plugin to `/opt/kodi-bridge/<version>/` and symlink `current`.
4. Write `openclaw.json` with:
   - `plugins.load.paths: ["/opt/kodi-bridge/current"]`
   - `plugins.allow: ["kodi-bridge"]`
   - `plugins.entries["kodi-bridge"]: { enabled: true, config: { ... } }`
5. Export `KODI_BRIDGE_HMAC_SECRET` in the system environment so the plugin's SecretRef resolves.
6. Start the gateway.

### 3.2 Agent Lifecycle Wiring

- When a user is added to an org (existing `addOrgMember` flow), Kodi calls `POST /api/openclaw/agents` which provisions the agent and the Composio session, then pushes them into the plugin.
- When a user is removed, the inverse.
- On org creation, an "org agent" is provisioned immediately (used for org-level autonomous work). Per the memory plan's org/member split, the org agent exists even if no user has logged in yet.

### 3.3 Composio Session Lifecycle

- Session creation happens on the Kodi side in `composio.create(user_id=<kodi_user_id>)`. The user_id is the Kodi user's UUID (string form).
- The returned `mcp.url` and `mcp.headers` are encrypted at rest in `openclaw_agents.composio_session_enc`.
- When connected accounts change for a user, the existing Composio integration detects the change and calls `/agents/update-policy` on the instance to re-mount.

## 4. Event Envelope

All plugin → Kodi events use this envelope:

```jsonc
{
  "protocol": "kodi-bridge.v1",
  "plugin_version": "2026-04-21-abc1234",
  "instance": { "instance_id": "uuid", "org_id": "uuid" },
  "agent":    { "agent_id": "uuid", "openclaw_agent_id": "str", "user_id": "uuid" },
  "event": {
    "kind": "tool.invoke.after",
    "verbosity": "full",
    "occurred_at": "2026-04-21T10:23:41.123Z",
    "idempotency_key": "uuid-v4",
    "payload": { /* kind-specific */ }
  }
}
```

Signing: HMAC-SHA256 over the raw JSON body, with headers `x-kb-timestamp`, `x-kb-nonce`, `x-kb-signature`.

### 4.1 Event Kind Catalog (v1)

**Plugin lifecycle**
- `plugin.started` — on `register(api)`
- `plugin.degraded` — circuit breaker opens
- `plugin.recovered` — circuit breaker closes
- `plugin.update_check`, `plugin.update_attempted`, `plugin.update_succeeded`, `plugin.update_failed`, `plugin.update_rolled_back`
- `heartbeat` — periodic

**Agent lifecycle**
- `agent.provisioned`, `agent.deprovisioned`, `agent.failed`
- `agent.bootstrap` — on first message of a session

**Session and message**
- `message.received`, `message.sent`
- `session.compact.after`
- `session.ended`

**Tool**
- `tool.invoke.before`, `tool.invoke.after`
- `tool.denied`, `tool.approval_requested`, `tool.approval_resolved`

**Composio specific**
- `composio.session_failed`, `composio.session_rotated`

Each kind has a payload schema defined in `packages/openclaw-bridge/src/types/protocol.ts` and mirrored in `packages/shared/events.ts` for Kodi-side handlers.

### 4.2 Subscription Shape

```jsonc
{
  "protocol_version": "kodi-bridge.v1",
  "subscriptions": {
    "plugin.*": { "enabled": true, "verbosity": "summary" },
    "heartbeat": { "enabled": true, "verbosity": "summary" },
    "agent.*":  { "enabled": true, "verbosity": "full" },
    "message.*": { "enabled": true, "verbosity": "summary" },
    "tool.invoke.after": { "enabled": true, "verbosity": "full" },
    "tool.approval_requested": { "enabled": true, "verbosity": "full" },
    "tool.denied": { "enabled": true, "verbosity": "full" },
    "session.*": { "enabled": true, "verbosity": "summary" },
    "composio.*": { "enabled": true, "verbosity": "full" }
  }
}
```

Glob patterns match event kinds. The plugin picks the most specific match.

## 5. Autonomy Enforcement

### 5.1 Classification

Reuses verb lists from `apps/api/src/lib/tool-access-runtime.ts`:

- `READ_VERBS` → `read`
- `DRAFT_VERBS` → `draft`
- `WRITE_VERBS` → `write`
- Matches against `ADMIN_KEYWORDS` → `admin` (higher priority than write)

Tools whose names do not match any verb fall back to `write` as a conservative default.

### 5.2 Level Semantics

| Level | read | draft | write | admin |
|---|---|---|---|---|
| `strict` | ask | ask | ask | ask |
| `normal` | allow | allow | ask | ask |
| `lenient` | allow | allow | allow | ask |
| `yolo` | allow | allow | allow | allow |

### 5.3 Overrides

`overrides` is a map from a glob (e.g. `"github.merge_*"`) to an action (`allow`, `ask`, `deny`). The most specific override wins, then autonomy level.

### 5.4 Approval Flow

1. Plugin emits `tool.approval_requested` with a `request_id` and the full tool call.
2. Kodi writes an `approvals` row, surfaces it in the approvals UI.
3. User approves or rejects in Kodi UI.
4. Kodi POSTs `/plugins/kodi-bridge/approvals/:request_id/resolve` with `{ approved: bool, reason? }`.
5. Plugin unblocks the waiting invocation; returns the real tool result or a denial.
6. Emits `tool.approval_resolved` and then `tool.invoke.after`.

Timeouts per level (configurable): `strict` 10 min, `normal` 2 min, `lenient` 30 sec. On timeout, the plugin treats the call as denied.

## 6. Self-Update Details

### 6.1 Directory Layout On Instance

```
/opt/kodi-bridge/
  current -> 2026-04-21-abc1234
  2026-04-21-abc1234/          (active)
  2026-04-20-xyz9876/          (previous, kept for rollback)
  outbox/                      (disk buffer for undelivered events)
  state/                       (plugin runtime state: last-update-check, etc.)
```

### 6.2 Update Steps

1. `GET /api/plugin-bundle/latest` with current version → 304 or `{ version, bundle_url, sha256 }`.
2. Download to `/tmp/kb-<version>.tgz`. Verify sha256.
3. Extract to `/opt/kodi-bridge/<version>/`.
4. Pre-swap health probe: spawn a short-lived child process that imports `/opt/kodi-bridge/<version>/dist/index.js` and calls a `healthCheck()` export; fails if the import errors or health check returns false.
5. `ln -sfn /opt/kodi-bridge/<version> /opt/kodi-bridge/current`.
6. `openclaw gateway restart`.
7. Wait up to 60s for the new plugin to emit `plugin.started` at Kodi.
8. On success: emit `plugin.update_succeeded`, prune versions older than last 2.
9. On failure: flip symlink back; emit `plugin.update_rolled_back`.

### 6.3 Fleet-Wide Control

- `instances.bundle_version_target` pins a specific version for an instance; the plugin installs that version instead of "latest".
- For canary rollout: publish a new version, set one instance's `bundle_version_target` to it, observe, then null it out on other instances so they pick up "latest".

## 7. Recovery And Resilience

- **Kodi unreachable**: plugin buffers events to `/opt/kodi-bridge/outbox/` and retries every 30s. Circuit breaker opens after 5 consecutive failures in 2 minutes; plugin emits `plugin.degraded` when it closes and `plugin.recovered` when service resumes.
- **Plugin unreachable from Kodi**: Kodi retries with exponential backoff up to 5 attempts, then enqueues into the existing job system for async retry. Heartbeat gap >2× interval triggers an ops alert.
- **Failed agent provisioning**: `openclaw_agents.status = 'failed'`; Kodi surfaces a "retry" UI action that re-invokes `POST /api/openclaw/agents`.
- **Failed Composio session**: agent still provisions; `composio_status = 'failed'`; user gets a UI to reconnect toolkits.
- **Failed self-update**: stays on current version; retries on next cron. Kodi surfaces a "stuck on old version" alert if plugin heartbeat reports a different version than `bundle_version_target` for >1h.
- **Clock skew**: HMAC signing tolerates ±5 min; if skew exceeds this, sync system time via NTP on boot as part of cloud-init.

## 8. Security

- **HMAC secrets** are per-instance, 32 bytes of random, encrypted at rest with the same KMS that protects `gateway_token`.
- **Rotation**: `POST /api/internal/instances/:id/rotate-hmac-secret` issues a new secret, pushes it to the plugin via `/admin/reload`, accepts the old secret for a 10-minute grace window.
- **No plaintext secrets in config** — the plugin reads secrets through `SecretRef` pointers to environment variables set by cloud-init.
- **Rate limiting** on Kodi's `/api/openclaw/events` endpoint: per-instance, 1000 events/minute sustained, burst to 5000. Above this, Kodi drops with a 429 and the plugin backs off.
- **Input validation**: every inbound payload is validated against a zod schema; unknown fields rejected.
- **Authentication boundary**: the plugin trusts only HMAC-signed requests from Kodi. Kodi trusts only HMAC-signed requests from known instances. The gateway token remains the auth for Kodi → OpenClaw `/v1/chat/completions` calls and is separate from the HMAC secret.

## 9. Testing Strategy

### 9.1 Unit Tests (plugin side)

- Config parsing and validation
- HMAC signing and verification roundtrip (signing must match the Kodi-side utility byte-for-byte)
- Event envelope serialization
- Subscription matching (glob + verbosity resolution)
- Autonomy classification (verb to action class)
- Policy evaluation (level × override → outcome)
- Outbox buffer persistence

### 9.2 Unit Tests (Kodi side)

- Bundle version registry queries
- Event log dedupe by nonce
- Subscription put/get
- Agent lifecycle state transitions

### 9.3 Integration Tests

- In-process OpenClaw gateway (Dockerized, pinned version) with the plugin loaded
- End-to-end agent provisioning from Kodi → plugin → gateway
- End-to-end tool-call interception and approval round trip
- End-to-end self-update including rollback on forced failure
- Memory `memory.ping` call path

### 9.4 Smoke Tests Post-Provision

- Provision a test instance; assert `plugin.started` within 60s
- Provision a test user's agent; assert Composio tools registered via `api.registerTool`; call a trivial Composio tool through the agent
- Send a test inbound `/agents/:id/inject`; assert message appears in the session

## 10. Codebase Areas Touched

### Database

- `packages/db/src/schema/` — new tables
- `packages/db/src/schema/instances.ts` — new columns

### API

- `apps/api/src/routers/` — new routers for plugin bundle, events, agents, subscriptions, memory stub
- `apps/api/src/routers/instance/cloud-init.ts` — new plugin install steps
- `apps/api/src/routers/instance/provisioning.ts` — new HMAC secret generation
- `apps/api/src/lib/openclaw/client.ts` — new HTTPS client for plugin inbound routes (separate from the `/v1/chat/completions` client)
- `apps/api/src/env.ts` — new env vars

### Plugin

- `packages/openclaw-bridge/` — new package, the plugin

### Shared

- `packages/shared/hmac.ts` — HMAC utility used by both sides
- `packages/shared/events.ts` — event kind catalog and payload schemas

### Infra

- Terraform module (or manual, documented) for the S3 bucket
- CI workflow: `.github/workflows/publish-plugin.yml`

## 11. Build Plan

This work is built in nine milestones. See [linear-project-plan.md](./linear-project-plan.md) for ticket-level detail.

### Milestone 0 — Feasibility Spike

Validate OpenClaw's plugin-tool surface for the embedded Pi agent, pre-tool-invoke hook availability, and programmatic agent management. No production code; output is a memo per spike. (M0-T1 and M0-T2 complete — see [`spike/m0-mcp.md`](./spike/m0-mcp.md) and [`spike/m0-pre-tool-hook.md`](./spike/m0-pre-tool-hook.md). M0-T3 pending.)

### Milestone 1 — Data Model And Kodi API Foundations

All schema, S3 bucket, HMAC utility, bundle endpoint, event endpoint. Nothing integrated to OpenClaw yet.

### Milestone 2 — Plugin Skeleton And Bundling Pipeline

Minimal plugin loads on a provisioned instance and emits `plugin.started`. CI bundles and publishes.

### Milestone 3 — Dual Communication Protocol

Typed events, subscriptions, inbound routes, heartbeat, circuit breaker. Kodi can change what the plugin emits without a redeploy.

### Milestone 4 — Multi-Agent Management And Composio Per User

Per-user agents provisioned by Kodi, per-agent Composio sessions mounted as MCP, org membership changes flow through.

### Milestone 5 — Autonomy And Policy Enforcement

Per-agent autonomy levels, approval routing that reuses the existing approvals schema, overrides, full audit.

### Milestone 6 — Self-Update

Pull-based update loop, atomic swap, rollback, canary support via `bundle_version_target`.

### Milestone 7 — Memory Module Foundation

Slot + `memory.ping` + `MEMORY_CONTRACT.md`. Ready for the memory team to attach their tools.

### Milestone 8 — Observability And Hardening

Metrics, logging, admin endpoints for health, secret rotation, integration test harness, runbook.

## 12. Summary

The `kodi-bridge` plugin is a single in-monorepo package that, once installed on every OpenClaw instance, makes OpenClaw a first-class, governed, multi-agent runtime from Kodi's perspective. The plan lands in nine incremental milestones, none of which block on the Org Memory project, and it consolidates the previously proposed `kodi-memory` plugin into a module inside this one plugin to satisfy the requirement that Kodi ships one plugin, not multiple.
