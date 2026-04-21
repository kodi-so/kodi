# Kodi OpenClaw Bridge Linear Upload Plan

This document is the team-review and upload-ready version of the Kodi OpenClaw Bridge plan.

Reference docs:

1. [architecture-plan.md](./architecture-plan.md)
2. [implementation-spec.md](./implementation-spec.md)

## Project

### Project Title

Kodi-OpenClaw Bridge Plugin

### Project Team

Kodi

### Project Summary

Build a single extensible `kodi-bridge` OpenClaw plugin installed into every org's OpenClaw instance that provides per-user agents, always-on Composio access, typed bidirectional communication between Kodi and the instance, per-agent autonomy policies, and pull-based self-update.

### Project Description

Today, Kodi only reaches its OpenClaw instances via synchronous `POST /v1/chat/completions`. When OpenClaw operates autonomously, it has no tools and no memory, and Kodi has no way to observe or direct it. This project delivers the plugin and the Kodi-side surfaces required to close that gap. When complete, every OpenClaw instance will run multiple per-user agents, each with its own Composio session, under a governed autonomy policy, emitting typed events back to Kodi and accepting commands from Kodi over HMAC-signed HTTP.

This project supersedes the previously proposed `kodi-memory` plugin from [docs/memory/](../memory/). That plugin is absorbed as a memory module inside `kodi-bridge`, preserving the contract the memory team specified (trusted identity from runtime hooks, service-authenticated Memory API, proactive recall). The memory team will attach real memory tools to the module slot in a follow-on code change.

### Project Success Criteria

- Every org's OpenClaw instance runs `kodi-bridge` as a persistent plugin
- Every user in an org has their own OpenClaw agent with its own Composio session and identity
- Kodi can change what any instance emits at runtime without redeploying the plugin
- Kodi can inject messages, push events, and update policies on any instance over HMAC-signed HTTP
- Every agent has a per-agent autonomy policy ranging from `strict` to `yolo`, with approval requests flowing back to Kodi for user review
- Instances self-update from a Kodi-published S3 bundle with atomic swap and automatic rollback
- The memory team can attach memory tools to the `memory` module without shipping a second plugin

## Milestones

### Milestone 0

Title: Feasibility Spike

Description:

Validate the three OpenClaw primitives the rest of the project relies on, before writing any production code: persistent MCP server consumption, pre-tool-invoke hook availability, and programmatic agent lifecycle management.

Outcome:

A written memo confirming that all three primitives work as documented, or documenting the fallback path for any that do not. No production code lands until this memo is signed off.

### Milestone 1

Title: Data Model And Kodi API Foundations

Description:

Land all schema additions, the S3 bucket for plugin bundles, the HMAC signing utility, and the Kodi API surface that the plugin will call.

Outcome:

Kodi has every persistence, signing, and API primitive ready for the plugin to connect. Nothing touches OpenClaw yet.

### Milestone 2

Title: Plugin Skeleton And Bundling Pipeline

Description:

Stand up the `packages/openclaw-bridge` workspace, the esbuild bundling pipeline, the CI publish flow, and the minimal plugin that loads on a real instance and emits a `plugin.started` event.

Outcome:

A provisioned OpenClaw instance loads the plugin at startup. Kodi sees the plugin started event. No features yet beyond identity and health.

### Milestone 3

Title: Dual Communication Protocol

Description:

Ship the typed, versioned, HMAC-signed event protocol in both directions, plus subscriptions that let Kodi change what the plugin emits without a redeploy.

Outcome:

Kodi can observe every major agent lifecycle and message-related event from every instance, can tune verbosity per kind, and can push inbound commands that the plugin verifies and routes.

### Milestone 4

Title: Multi-Agent Management And Composio Per User

Description:

Provision and deprovision OpenClaw agents one per (org, user), create a persistent Composio session per agent, mount Composio as an MCP server scoped to each agent, and wire org membership changes into this flow.

Outcome:

Every user in an org has their own agent with their own Composio identity. Agents are created when a user joins the org and torn down when they leave. Agent state is reconciled on plugin startup.

### Milestone 5

Title: Autonomy And Policy Enforcement

Description:

Ship the per-agent autonomy model (`strict` / `normal` / `lenient` / `yolo`) with per-toolkit overrides. Enforce policy at tool-invocation time. Route approval requests back to Kodi using the existing approvals schema. Audit every tool call regardless of level.

Outcome:

Kodi can set an agent to `strict` and see every tool call gated behind an approval prompt. Kodi can set the agent to `yolo` and see every tool call execute without a prompt, still auditable after the fact.

### Milestone 6

Title: Self-Update

Description:

Pull-based self-update from Kodi's bundle endpoint. Atomic symlink swap. Health check before flipping. Automatic rollback on failure. Canary support via `bundle_version_target`.

Outcome:

Publishing a new plugin version causes every live instance to update within its check interval. A deliberately broken version is automatically rolled back on every instance that attempts it.

### Milestone 7

Title: Memory Module Foundation

Description:

Ship the `memory` module as a slot ready for the memory team to attach real tools. Includes a working `memory.ping` tool that exercises the full trusted-identity and service-authenticated call path.

Outcome:

The memory team can add memory tools by adding code inside the `memory` module, without touching the rest of the plugin or shipping a second plugin.

### Milestone 8

Title: Observability And Hardening

Description:

Metrics, structured logs, admin health endpoints, secret rotation, circuit breaker polish, integration test harness, runbook.

Outcome:

Operational maturity. A broken instance is diagnosable in minutes. A compromised secret can be rotated without downtime. End-to-end flows are covered by CI integration tests.

## Issues

Each issue below uses the full ticket format described in the project methodology.

---

# Milestone 0 Issues

## Issue M0-T1

**Title:** Verify OpenClaw main runtime consumes `mcp.servers` from config

**Type:** Chore

**Priority:** Urgent

**Depends on:** None

**Context & Why:**

The entire Composio integration plan rests on the assumption that OpenClaw's main agent runtime consumes persistent MCP server entries registered via `openclaw mcp set`. OpenClaw docs are ambiguous about which runtime adapters actually pick up these entries. If this assumption is wrong, Composio cannot be mounted as MCP and we must fall back to plugin-registered tools only. Discovering this after coding starts would waste weeks.

**Detailed Requirements:**

- Provision a local OpenClaw instance (via `openclaw onboard` or the Railway image) at the pinned production version
- Register a trivial MCP server (for example, a public echo MCP) using `openclaw mcp set echo '{"url":"...","headers":{...}}'`
- Start the gateway
- Send a chat turn via `POST /v1/chat/completions` with a prompt that asks the agent to use the echo tool
- Observe whether the agent has the echo tool in its loadout
- Capture logs showing whether the MCP server was loaded at runtime and whether the tool was invoked
- Write a memo in `docs/openclaw-bridge/spike/m0-mcp.md` documenting findings: working, partially working, not working. If not working, document the exact error and the proposed fallback.

**Edge Cases & Error Handling:**

- If the gateway refuses the MCP config, capture the exact config error message
- If the gateway loads the MCP entry but the agent does not see the tool, capture runtime logs that show the adapter's loadout construction
- If the MCP server requires auth, test both with and without auth

**Technical Notes:**

- Use a public hosted MCP server for the echo test so we are not testing Composio's auth at the same time
- OpenClaw CLI reference: `openclaw mcp set <name> <json>` and `openclaw mcp list`
- The main runtime code path is in OpenClaw's core repo; no read-only code access here, so this is a black-box test

**Acceptance Criteria:**

- [ ] Memo exists at `docs/openclaw-bridge/spike/m0-mcp.md` with findings
- [ ] Memo answers: does the main runtime consume `mcp.servers`? yes / no / partial with conditions
- [ ] If "partial" or "no", memo documents the fallback architecture and the estimated cost delta
- [ ] Memo is reviewed and signed off by the project lead before any downstream work starts

**Out of Scope:**

- Building any plugin code
- Configuring Composio
- Changes to Kodi's API

---

## Issue M0-T2

**Title:** Verify OpenClaw plugin API supports a pre-tool-invoke hook

**Type:** Chore

**Priority:** Urgent

**Depends on:** None

**Context & Why:**

The autonomy module needs to intercept tool calls before they execute, so it can enforce per-agent policy, request approvals, or deny outright. The OpenClaw plugin SDK documents hooks such as `message:received` and `session:compact:after`, but it is not obvious whether a pre-tool-invoke hook is exposed. If no such hook exists, we cannot enforce policy on MCP-backed tools and must fall back to a tool-wrapping pattern. This outcome shapes Milestone 5.

**Detailed Requirements:**

- Review OpenClaw plugin SDK documentation and source (where available) for any hook that fires before a tool is invoked
- Candidate hooks to investigate: `tool:before-invoke`, `tool:pre-execute`, `message:preprocessed`, `command:new`, generic `invoke:*` families, and any interception points in `api.registerTool`
- Write a minimal plugin that registers two tools and attempts to intercept one of them via every candidate hook
- Confirm whether the hook receives the tool call arguments and can block or mutate the invocation
- Specifically test interception of MCP-backed tools, not just plugin-registered tools, because the Composio path depends on it
- Write a memo in `docs/openclaw-bridge/spike/m0-pre-tool-hook.md` documenting findings

**Edge Cases & Error Handling:**

- If a hook exists but only for plugin-registered tools and not MCP tools, the memo must call this out clearly and include the wrapping-pattern fallback
- If no synchronous hook exists, document whether an asynchronous hook could achieve the same effect
- If the hook requires a specific return shape (promise, object, throw), document the contract

**Technical Notes:**

- Start from `docs.openclaw.ai/automation/hooks.md` and work through every hook named
- The wrapping fallback: the plugin re-registers each Composio tool under a wrapped name like `kb.composio.<toolkit>.<action>`; the plugin's own `execute()` is the interception point

**Acceptance Criteria:**

- [ ] Memo exists at `docs/openclaw-bridge/spike/m0-pre-tool-hook.md`
- [ ] Memo lists every candidate hook tested and the behavior observed
- [ ] Memo answers: can the plugin intercept tool invocations before execution? yes / no / conditional
- [ ] If conditional, memo specifies which conditions and the fallback for the other cases
- [ ] Memo is signed off before Milestone 5 starts

**Out of Scope:**

- Designing the full autonomy policy model
- Any production plugin code

---

## Issue M0-T3

**Title:** Verify programmatic agent lifecycle from inside a plugin

**Type:** Chore

**Priority:** Urgent

**Depends on:** None

**Context & Why:**

The `agent-manager` module creates and destroys OpenClaw agents based on Kodi's org membership changes. We need to confirm the plugin API exposes everything required to manage agents fully programmatically, without shelling out to the CLI. If only the CLI works, the plugin must spawn subprocesses, which is uglier and harder to test.

**Detailed Requirements:**

- Identify all plugin SDK APIs relevant to agent management: `api.runtime.agent.*`, any gateway RPC methods, filesystem primitives for workspace directories
- Write a minimal plugin that, on load, creates a new agent, writes its `IDENTITY.md`, binds it to a channel, and later destroys it
- Capture whether every step works without invoking the CLI
- Document the equivalent CLI commands for any step that cannot be done programmatically
- Write a memo in `docs/openclaw-bridge/spike/m0-agent-lifecycle.md`

**Edge Cases & Error Handling:**

- If agent creation requires a running Gateway restart, document the cost
- If cleanup leaves residual workspace files, document the cleanup strategy

**Technical Notes:**

- Docs of interest: `docs.openclaw.ai/concepts/agent.md`, `cli/agents.md`, `plugins/sdk-runtime.md`

**Acceptance Criteria:**

- [ ] Memo exists at `docs/openclaw-bridge/spike/m0-agent-lifecycle.md`
- [ ] Memo confirms that create + destroy + identity-write can be done programmatically
- [ ] Memo lists any gap and the CLI-subprocess workaround
- [ ] Memo signed off before Milestone 4 starts

**Out of Scope:**

- Building the full `agent-manager` module
- Composio integration

---

# Milestone 1 Issues

## Issue M1-T1

**Title:** Add plugin columns to `instances` table

**Type:** Feature

**Priority:** High

**Depends on:** None

**Context & Why:**

The plugin needs to track its installed version, its signing secret, its last heartbeat, and any pinned target version for canary rollouts. These live on the `instances` table, which already holds per-org OpenClaw deployment metadata.

**Detailed Requirements:**

- Add columns to `instances`:
  - `plugin_version_installed` text, nullable
  - `plugin_hmac_secret_encrypted` text, nullable
  - `last_plugin_heartbeat_at` timestamptz, nullable
  - `bundle_version_target` text, nullable
- Write migration in `packages/db` using the existing migration system
- Update generated types and Drizzle schema
- Add an index on `last_plugin_heartbeat_at` if needed for "stale instance" queries (skip for now if no query planned)

**Edge Cases & Error Handling:**

- Existing rows: all four columns are null; no backfill required
- Encryption at rest: reuse the same KMS pattern used for `gateway_token`; see `apps/api/src/routers/instance/provisioning.ts` for the pattern

**Technical Notes:**

- Migration file naming follows the existing convention in `packages/db/drizzle/`
- Types: `packages/db/src/schema/instances.ts`

**Acceptance Criteria:**

- [ ] Migration applies cleanly on a fresh DB
- [ ] Migration applies cleanly on an existing DB with data (existing rows get nulls)
- [ ] Drizzle schema reflects the new columns
- [ ] Types are regenerated and exported from `@kodi/db`

**Out of Scope:**

- Logic that reads or writes these columns (lands in later tickets)

---

## Issue M1-T2

**Title:** Create `openclaw_agents` table

**Type:** Feature

**Priority:** High

**Depends on:** M1-T1

**Context & Why:**

We need a durable record of every agent created inside every instance, with its user mapping, Composio session state, and lifecycle status. This table is the source of truth for reconciliation between Kodi and each instance's plugin.

**Detailed Requirements:**

- Create table `openclaw_agents` with columns:
  - `id` uuid primary key, default `gen_random_uuid()`
  - `instance_id` uuid, foreign key to `instances(id)` on delete cascade
  - `org_id` uuid, foreign key to orgs, not null
  - `user_id` uuid, foreign key to users, nullable (null for "org agent" rows)
  - `openclaw_agent_id` text, not null
  - `composio_user_id` text, nullable
  - `composio_session_enc` jsonb, nullable, encrypted
  - `composio_status` text, not null, default `'pending'` — values: `pending`, `active`, `failed`, `disconnected`
  - `status` text, not null, default `'provisioning'` — values: `provisioning`, `active`, `suspended`, `deprovisioned`, `failed`
  - `created_at` timestamptz not null default now
  - `updated_at` timestamptz not null default now
- Unique constraints:
  - `(instance_id, user_id)` where user_id is not null
  - `(instance_id, openclaw_agent_id)`
- Indexes:
  - `(org_id, status)` for listing active agents per org
  - `(instance_id)` for per-instance scans
- Add Drizzle schema + types

**Edge Cases & Error Handling:**

- The "org agent" is represented by a row with `user_id = null` and an identifying `openclaw_agent_id` (e.g., the literal string `org-agent`). Unique constraint uses a partial index so multiple null `user_id` rows do not collide if we ever need more than one
- Foreign key cascade: deleting an instance cascades deletion of its agents

**Technical Notes:**

- Use enums at the app layer (zod), not Postgres enums, for status fields — simpler to migrate
- Encryption of `composio_session_enc`: use the same utility pattern as `gateway_token`

**Acceptance Criteria:**

- [ ] Migration applies cleanly
- [ ] All unique constraints enforced
- [ ] All indexes present
- [ ] Cascade behavior verified with a test delete

**Out of Scope:**

- Agent lifecycle logic (Milestone 4)

---

## Issue M1-T3

**Title:** Create `agent_autonomy_policies` table and default-policy helper

**Type:** Feature

**Priority:** High

**Depends on:** M1-T2

**Context & Why:**

Every agent has an autonomy level that determines how tool calls are gated. Missing rows default to `normal`. We want the default in application code, not triggers, so missing policies are explicit and easy to change.

**Detailed Requirements:**

- Create table `agent_autonomy_policies` with columns:
  - `agent_id` uuid primary key, foreign key to `openclaw_agents(id)` on delete cascade
  - `autonomy_level` text not null, default `'normal'` — values: `strict`, `normal`, `lenient`, `yolo`
  - `overrides` jsonb, nullable — map of glob to action (`allow`, `ask`, `deny`)
  - `updated_by_user_id` uuid, nullable, foreign key to users
  - `updated_at` timestamptz not null default now
- Write `getEffectiveAutonomyPolicy(agentId)` helper in `apps/api/src/lib/autonomy.ts` that returns the policy row or the default `{ autonomy_level: 'normal', overrides: null }`
- Write `setAutonomyPolicy(agentId, { autonomy_level, overrides, updated_by_user_id })` helper

**Edge Cases & Error Handling:**

- Invalid `autonomy_level`: reject with a zod validation error at the helper layer
- `overrides` containing invalid globs: validate keys as glob-syntax strings, values as the allowed action enum

**Technical Notes:**

- The verb-to-class classification logic is duplicated from `apps/api/src/lib/tool-access-runtime.ts` → extract into `packages/shared/action-class.ts` to keep both sides in sync (done in M5)

**Acceptance Criteria:**

- [ ] Migration applies cleanly
- [ ] `getEffectiveAutonomyPolicy` returns default for agents without rows
- [ ] `setAutonomyPolicy` persists and upserts correctly
- [ ] Invalid inputs rejected with clear errors

**Out of Scope:**

- Enforcement logic in the plugin (Milestone 5)
- Approval flow (Milestone 5)

---

## Issue M1-T4

**Title:** Create `plugin_event_subscriptions`, `plugin_event_log`, `plugin_versions` tables

**Type:** Feature

**Priority:** High

**Depends on:** M1-T1

**Context & Why:**

These three tables back the dual-communication protocol (subscriptions + log) and the self-update system (versions registry). They are structurally independent and land in one migration for convenience.

**Detailed Requirements:**

- `plugin_event_subscriptions`:
  - `instance_id` uuid primary key, foreign key to `instances(id)` on delete cascade
  - `protocol_version` text not null
  - `subscriptions` jsonb not null
  - `updated_at` timestamptz not null default now
- `plugin_event_log`:
  - `id` uuid primary key default `gen_random_uuid()`
  - `instance_id` uuid foreign key to `instances(id)` on delete cascade, indexed
  - `agent_id` uuid foreign key to `openclaw_agents(id)` on delete set null, nullable, indexed
  - `event_kind` text, indexed
  - `protocol_version` text
  - `payload_json` jsonb
  - `idempotency_key` text not null
  - `received_at` timestamptz not null default now, indexed
  - Unique `(instance_id, idempotency_key)`
- `plugin_versions`:
  - `version` text primary key — scheme `YYYY-MM-DD-<sha>`
  - `bundle_s3_key` text not null
  - `sha256` text not null
  - `released_at` timestamptz not null default now
  - `notes` text, nullable

**Edge Cases & Error Handling:**

- `plugin_event_log` growth: add a ticket in M8 for retention / archival; out of scope here
- Concurrent publishes with the same version string: unique primary key prevents dupes

**Technical Notes:**

- `payload_json` stores the event envelope's `payload` field only, not the whole envelope (envelope metadata is captured separately in columns)

**Acceptance Criteria:**

- [ ] Three tables present with correct columns and constraints
- [ ] Dedupe unique constraint on `plugin_event_log`
- [ ] Indexes on the logged query patterns exist

**Out of Scope:**

- Data retention policy (Milestone 8)

---

## Issue M1-T5

**Title:** Provision S3 bucket for plugin bundles

**Type:** Chore

**Priority:** High

**Depends on:** None

**Context & Why:**

Plugin bundles are distributed via Kodi-owned S3. The bucket is private; bundles are served to instances only through short-lived signed URLs generated by the Kodi API.

**Detailed Requirements:**

- Create S3 bucket `kodi-plugin-bundles-<env>` in the existing AWS account, per environment (dev, staging, prod)
- Block all public access
- Enable versioning
- Attach an IAM policy that grants the Kodi API service account `s3:PutObject`, `s3:GetObject`, `s3:HeadObject` on `bundles/*`
- Document the bucket ARN in `docs/openclaw-bridge/infra.md`
- Add the bucket to Terraform in `infra/` if we Terraform-manage storage; otherwise document the manual config steps

**Edge Cases & Error Handling:**

- Multi-region: not required. Bundles are small (< 10 MB); latency is acceptable from any region.
- Encryption at rest: enable SSE-S3

**Technical Notes:**

- Object key convention: `bundles/<version>/kodi-bridge.tgz`
- Signed URL TTL: short, configurable (M1-T7 default is 600 seconds)

**Acceptance Criteria:**

- [ ] Bucket exists in dev, staging, prod
- [ ] Public access blocked
- [ ] Versioning on
- [ ] IAM policy attached to service account
- [ ] Infra documented

**Out of Scope:**

- Uploading actual bundles (Milestone 2)

---

## Issue M1-T6

**Title:** Add `POST /api/internal/plugin-versions/publish` admin endpoint

**Type:** Feature

**Priority:** High

**Depends on:** M1-T4, M1-T5

**Context & Why:**

CI uploads a built plugin bundle to S3 and then needs to register the version in Kodi so instances can discover and install it. This endpoint is the registration path.

**Detailed Requirements:**

- New router at `apps/api/src/routers/plugin-versions/index.ts`
- Endpoint: `POST /api/internal/plugin-versions/publish`
- Auth: requires the `X-Admin-Token` header matching `PLUGIN_PUBLISH_ADMIN_TOKEN` env var; reject with 401 otherwise
- Request body:
  ```json
  {
    "version": "2026-04-21-abc1234",
    "bundle_s3_key": "bundles/2026-04-21-abc1234/kodi-bridge.tgz",
    "sha256": "hex",
    "notes": "optional"
  }
  ```
- Validation:
  - `version` matches regex `^\d{4}-\d{2}-\d{2}-[a-f0-9]{7,40}$`
  - `bundle_s3_key` matches regex `^bundles/\d{4}-\d{2}-\d{2}-[a-f0-9]{7,40}/kodi-bridge\.tgz$`
  - `sha256` is 64 hex chars
- Before insert: verify the object exists in S3 via `s3.headObject`
- Insert into `plugin_versions`; on duplicate key return 409
- Response: `{ version, bundle_s3_key, sha256, released_at }` with status 201

**Edge Cases & Error Handling:**

- Missing admin token: 401
- Invalid body: 400 with zod errors
- S3 object not found: 404 with a clear message
- Duplicate version: 409
- S3 error: 502

**Technical Notes:**

- Follow the existing router pattern in `apps/api/src/routers`
- Use `@aws-sdk/client-s3` for `HeadObjectCommand`

**Acceptance Criteria:**

- [ ] Endpoint accepts valid payloads and inserts rows
- [ ] Endpoint rejects invalid versions
- [ ] Endpoint rejects duplicate versions with 409
- [ ] Endpoint verifies S3 object existence before inserting
- [ ] Test coverage: unit tests for validation, integration test for happy path

**Out of Scope:**

- CI workflow (Milestone 2)

---

## Issue M1-T7

**Title:** Add `GET /api/plugin-bundle/latest` and `GET /api/plugin-bundle/:version` endpoints

**Type:** Feature

**Priority:** High

**Depends on:** M1-T4, M1-T5, M1-T6

**Context & Why:**

The plugin's self-update module queries these endpoints to discover which version to install. Authentication is via the instance's gateway token so the plugin can authenticate with a secret it already has.

**Detailed Requirements:**

- New endpoints in the plugin-bundle router:
  - `GET /api/plugin-bundle/latest?current_version=<string>`
  - `GET /api/plugin-bundle/:version`
- Auth: `Authorization: Bearer <gateway_token>` — reject if no matching `instances` row
- `latest` behavior:
  - Resolve the instance row from the bearer token
  - If `instances.bundle_version_target` is set, return that version (even if newer versions exist)
  - Else, return the most recently released `plugin_versions` row
  - If `current_version` equals the selected version, return 304 with no body
- `:version` behavior: return that version; 404 if not found
- Response shape (200):
  ```json
  {
    "version": "...",
    "bundle_url": "https://s3.amazonaws.com/...signed...",
    "sha256": "...",
    "released_at": "..."
  }
  ```
- `bundle_url` is a signed S3 URL valid for `PLUGIN_BUNDLE_URL_TTL_SECONDS` (default 600)

**Edge Cases & Error Handling:**

- No versions published yet: 404 with a clear message
- Gateway token does not match any instance: 401
- Gateway token matches but instance status is not `running`: 403
- S3 signer error: 502

**Technical Notes:**

- Use `@aws-sdk/s3-request-presigner` for signed URLs
- Gateway token auth pattern: follow `apps/api/src/lib/openclaw/client.ts` for how existing tokens are validated

**Acceptance Criteria:**

- [ ] Endpoints return correctly signed URLs
- [ ] 304 is returned when `current_version` matches the latest
- [ ] `bundle_version_target` overrides "latest" correctly
- [ ] Auth works with the existing gateway token format
- [ ] Integration test: publish a version, fetch via `latest`, download via the signed URL, verify sha256

**Out of Scope:**

- Plugin-side download logic (Milestone 6)

---

## Issue M1-T8

**Title:** Add env vars for plugin bundle system

**Type:** Chore

**Priority:** Medium

**Depends on:** M1-T5

**Context & Why:**

New env vars are needed for the S3 bucket, signing TTL, and admin auth. All vars must be declared in `apps/api/src/env.ts` so startup validation catches misconfiguration.

**Detailed Requirements:**

- Add to `apps/api/src/env.ts`:
  - `PLUGIN_BUNDLE_S3_BUCKET` string required
  - `PLUGIN_BUNDLE_S3_REGION` string required
  - `PLUGIN_BUNDLE_URL_TTL_SECONDS` number default 600
  - `PLUGIN_PUBLISH_ADMIN_TOKEN` string required in production, optional in dev
- Add to `.env.example` with documented defaults
- Document in `docs/openclaw-bridge/infra.md`

**Edge Cases & Error Handling:**

- Missing in prod: startup error with clear message
- Missing in dev: warn only

**Technical Notes:**

- Follow existing pattern in `apps/api/src/env.ts` which uses zod

**Acceptance Criteria:**

- [ ] All four vars present in `env.ts`
- [ ] `.env.example` updated
- [ ] Docs updated

**Out of Scope:**

- Any code that reads these vars

---

## Issue M1-T9

**Title:** Build shared HMAC signing utility

**Type:** Feature

**Priority:** High

**Depends on:** None

**Context & Why:**

The dual-communication protocol is authenticated in both directions via HMAC-SHA256 over the request body plus a timestamp and nonce. Both sides must compute byte-identical signatures. A shared utility, consumed by both Kodi and the plugin, ensures this.

**Detailed Requirements:**

- New file `packages/shared/src/hmac.ts` (create the `packages/shared` workspace if it does not exist)
- Exports:
  - `signRequest({ body: string, secret: string, timestamp: number, nonce: string }): string` — returns hex signature
  - `verifyRequest({ body: string, secret: string, timestamp: number, nonce: string, signature: string, maxSkewMs: number }): { ok: true } | { ok: false, code: string }`
- Algorithm: HMAC-SHA256 over `timestamp + "." + nonce + "." + body`
- `verifyRequest` rejects with:
  - `SKEW` when `|now - timestamp| > maxSkewMs`
  - `SIGNATURE` when signatures do not match
- Default `maxSkewMs` is 5 minutes
- Expose the package from `package.json` with proper TypeScript types
- Unit tests: sign+verify roundtrip, wrong secret, skew rejection, tampered body

**Edge Cases & Error Handling:**

- Timestamps in the future: allowed within skew window
- Unicode bodies: ensure the utility operates on the byte representation, not on a string representation that could re-encode

**Technical Notes:**

- Use Node's built-in `crypto.createHmac`
- Both Kodi and plugin consume this utility; plugin bundles it in the esbuild output

**Acceptance Criteria:**

- [ ] Utility exists and exports both functions
- [ ] Roundtrip test passes
- [ ] Tampered-body test fails verification
- [ ] Wrong-secret test fails verification
- [ ] Skew test fails when out of window
- [ ] Package is consumable from `apps/api` and from `packages/openclaw-bridge`

**Out of Scope:**

- Routes that use this utility (later tickets)

---

# Milestone 2 Issues

## Issue M2-T1

**Title:** Create `packages/openclaw-bridge` workspace with manifest and entry skeleton

**Type:** Feature

**Priority:** High

**Depends on:** M1-T9

**Context & Why:**

The plugin needs a home. This ticket creates the package, its OpenClaw manifest, its TypeScript entry, and the scaffolding for modules.

**Detailed Requirements:**

- Create `packages/openclaw-bridge/`:
  - `package.json` with name `@kodi/openclaw-bridge`, private, `openclaw.extensions: ["./dist/index.js"]`, `openclaw.compat` field pinned to the production OpenClaw version
  - `openclaw.plugin.json` with `id: "kodi-bridge"`, full `configSchema` matching the shape in the implementation spec (strict, `additionalProperties: false`)
  - `tsconfig.json` extending the repo's base
  - `src/index.ts` calling `definePluginEntry({ register })` and importing each module's `register` function
  - `src/modules/` directory with subdirectories for each module (`bridge-core`, `agent-manager`, `composio`, `event-bus`, `inbound-api`, `autonomy`, `updater`, `memory`)
  - Each module has an `index.ts` that exports a `register(api, context)` stub
  - `src/types/config.ts` with the TypeScript type mirroring the JSON Schema

**Edge Cases & Error Handling:**

- Config validation failure: plugin throws during `register(api)` with a clear error
- Missing SecretRef env var: plugin throws during `register(api)`

**Technical Notes:**

- OpenClaw plugin SDK entry pattern: see `docs.openclaw.ai/plugins/sdk-entrypoints.md`
- Use TypeBox for runtime schema where OpenClaw expects it; zod elsewhere in the plugin

**Acceptance Criteria:**

- [ ] Package present with all listed files
- [ ] `pnpm --filter openclaw-bridge build` produces `dist/index.js`
- [ ] Plugin's `register(api)` runs each module's register in order
- [ ] Config parsing validates against schema and fails loudly on mismatch

**Out of Scope:**

- Any real module behavior (later tickets in this milestone)

---

## Issue M2-T2

**Title:** Configure esbuild single-file bundling

**Type:** Chore

**Priority:** High

**Depends on:** M2-T1

**Context & Why:**

Plugins loaded via custom paths do not get auto-repair of dependencies. We ship a single bundled JS file with all deps inlined to avoid shipping `node_modules` or requiring runtime install.

**Detailed Requirements:**

- Create `packages/openclaw-bridge/esbuild.config.mjs`:
  - Entry: `src/index.ts`
  - Output: `dist/index.js`
  - Format: `esm`
  - Platform: `node`
  - Target: Node version matching OpenClaw's runtime (confirmed by `openclaw.compat`)
  - Bundle: true
  - Minify: false (easier debugging, size still tiny)
  - External: `openclaw/plugin-sdk` and any other packages the OpenClaw runtime provides (check SDK docs)
  - SourceMap: true
- Add `build` script in `package.json`
- Add watch script for local dev: `build:watch`
- Ensure `@kodi/shared` (HMAC utility) is bundled inline, not marked external

**Edge Cases & Error Handling:**

- Build failure: exits non-zero; CI catches it
- Missing SDK: if `openclaw/plugin-sdk` is not available at build time, error clearly

**Technical Notes:**

- esbuild externals list should match whatever OpenClaw's `jiti` loader provides in-process

**Acceptance Criteria:**

- [ ] `pnpm --filter openclaw-bridge build` succeeds
- [ ] Output is a single file at `dist/index.js`
- [ ] SourceMap generated
- [ ] Inlines `@kodi/shared` but not `openclaw/plugin-sdk`

**Out of Scope:**

- Publishing

---

## Issue M2-T3

**Title:** CI workflow: build, bundle, upload to S3, register version

**Type:** Feature

**Priority:** High

**Depends on:** M2-T2, M1-T6

**Context & Why:**

Every merge to `main` should produce a new published plugin version. Without this CI path, distribution is manual and error-prone.

**Detailed Requirements:**

- Add `.github/workflows/publish-plugin.yml`:
  - Trigger: push to `main` when files under `packages/openclaw-bridge/` change; plus a manual `workflow_dispatch`
  - Steps:
    1. Checkout
    2. Setup pnpm + Node
    3. Install deps
    4. Build plugin
    5. Archive: `tar -czf kodi-bridge.tgz -C packages/openclaw-bridge dist/ openclaw.plugin.json package.json`
    6. Compute sha256 of archive
    7. Compute version: `date +%Y-%m-%d`-`$(git rev-parse --short=10 HEAD)`
    8. Upload to S3 at `bundles/<version>/kodi-bridge.tgz`
    9. POST to `/api/internal/plugin-versions/publish`
  - Secrets: AWS credentials, `PLUGIN_PUBLISH_ADMIN_TOKEN`, `KODI_API_BASE_URL`
- Add a dry-run mode (no upload, no publish) used by PR CI to verify the build works

**Edge Cases & Error Handling:**

- AWS upload fails: workflow fails
- API publish fails: workflow fails with the API response
- Concurrent pushes: version strings include the SHA, so no collision

**Technical Notes:**

- Reuse existing CI patterns in `.github/workflows/`

**Acceptance Criteria:**

- [ ] Workflow runs on push to main
- [ ] Dry-run runs on PRs
- [ ] Successful run produces a new `plugin_versions` row and an uploaded S3 object
- [ ] Workflow secrets documented in `docs/openclaw-bridge/infra.md`

**Out of Scope:**

- Rollout control (Milestone 6)

---

## Issue M2-T4

**Title:** Implement `bridge-core` module: config, KodiClient, identity

**Type:** Feature

**Priority:** High

**Depends on:** M2-T1, M1-T9

**Context & Why:**

`bridge-core` is the shared foundation every other module depends on. It loads config, builds the HTTP client used to call Kodi, and exposes the identity (instance_id, org_id) every event envelope carries.

**Detailed Requirements:**

- `src/modules/bridge-core/config.ts`:
  - Export `loadConfig(rawConfig, secretResolver)`: validates the raw config against the schema, resolves SecretRef pointers into values, returns a typed config object
  - Throws clear errors on missing secrets or invalid config
- `src/modules/bridge-core/kodi-client.ts`:
  - Exports `createKodiClient({ baseUrl, gatewayToken, hmacSecret })` returning `{ signedFetch(path, init) }`
  - `signedFetch` attaches `Authorization: Bearer <gatewayToken>`, signs the body with the HMAC utility using a fresh nonce and timestamp, sets `x-kb-*` headers, returns the raw response
  - Retries on 5xx with exponential backoff up to 3 attempts
  - Returns structured errors for 4xx (no retry)
- `src/modules/bridge-core/identity.ts`:
  - Exports `getIdentity(): { instance_id, org_id, plugin_version }` — `plugin_version` is baked in at build time via esbuild define

**Edge Cases & Error Handling:**

- Kodi returns 401 (bad token): do not retry; emit `plugin.auth_failed` and let the outer handler decide whether to crash
- Kodi returns 404: do not retry; return the error
- Network errors: retry up to 3 times

**Technical Notes:**

- Use `undici` or Node's built-in `fetch` (Node 20+); bundle the chosen one
- Bake `plugin_version` via `esbuild.define({ 'process.env.PLUGIN_VERSION': JSON.stringify(version) })` in the build workflow

**Acceptance Criteria:**

- [ ] Config loading validates and resolves secrets
- [ ] `signedFetch` produces the expected HMAC headers
- [ ] Retry policy implemented
- [ ] `plugin_version` is accurate at runtime

**Out of Scope:**

- Routes, hooks, tools

---

## Issue M2-T5

**Title:** Register `GET /plugins/kodi-bridge/health` route

**Type:** Feature

**Priority:** Medium

**Depends on:** M2-T4

**Context & Why:**

A simple health endpoint is invaluable for debugging. It returns plugin version, uptime, and agent count. In M6 the updater uses a similar shape internally.

**Detailed Requirements:**

- In `bridge-core`, register `GET /plugins/kodi-bridge/health` via `api.registerHttpRoute`
- Response: `{ plugin_version, uptime_s, agent_count, last_heartbeat_sent_at, status: 'ok' | 'degraded' }`
- `status` derives from the circuit breaker state (wired up in M8; in this ticket, always `ok`)
- No auth required for the health endpoint
- Rate limit: 60 requests per minute (OpenClaw plugin HTTP routes expose a rate-limit option; use it)

**Edge Cases & Error Handling:**

- Agent registry not yet initialized: return `agent_count: 0`, `status: 'ok'`

**Technical Notes:**

- `api.registerHttpRoute` signature per OpenClaw plugin SDK docs

**Acceptance Criteria:**

- [ ] Route responds 200 on a healthy instance
- [ ] Route fields populated correctly
- [ ] Rate limit in place

**Out of Scope:**

- Circuit breaker state (Milestone 8)

---

## Issue M2-T6

**Title:** Emit `plugin.started` event on register

**Type:** Feature

**Priority:** High

**Depends on:** M2-T4, M1-T9

**Context & Why:**

The simplest end-to-end test of the entire Kodi <-> plugin path: the plugin emits one event on startup, Kodi receives it and logs it. Once this works, every subsequent feature is incremental.

**Detailed Requirements:**

- In `bridge-core`, after config loads, call `kodiClient.signedFetch('/api/openclaw/events', { body: envelope })` with a `plugin.started` event:
  ```jsonc
  {
    "protocol": "kodi-bridge.v1",
    "plugin_version": "...",
    "instance": { "instance_id": "...", "org_id": "..." },
    "agent": null,
    "event": {
      "kind": "plugin.started",
      "verbosity": "summary",
      "occurred_at": "...",
      "idempotency_key": "uuid",
      "payload": { "pid": 12345, "started_at": "..." }
    }
  }
  ```
- Retry if delivery fails (use `kodiClient`'s built-in retry)
- Log success/failure to stdout

**Edge Cases & Error Handling:**

- Kodi unreachable at startup: log and continue; the event-bus outbox (M3) will catch up later
- Config missing: plugin fails to load, `plugin.started` never sent (expected)

**Technical Notes:**

- This is a minimum-viable outbound path; the full event-bus replaces it in M3
- In this ticket, write the envelope inline; refactor into `event-bus` in M3

**Acceptance Criteria:**

- [ ] Provision a test instance; Kodi logs the `plugin.started` event
- [ ] Restarting the gateway triggers a new `plugin.started` event
- [ ] Idempotency key changes per event

**Out of Scope:**

- Full event bus (Milestone 3)

---

## Issue M2-T7

**Title:** Update cloud-init to install plugin bundle

**Type:** Feature

**Priority:** High

**Depends on:** M1-T1, M1-T7, M2-T3

**Context & Why:**

Provisioning an instance must now also install the plugin, write its config into `openclaw.json`, and set the environment so the plugin's SecretRefs resolve.

**Detailed Requirements:**

- Update `apps/api/src/routers/instance/cloud-init.ts`:
  1. Generate a new 32-byte random HMAC secret; encrypt with KMS; persist to `instances.plugin_hmac_secret_encrypted`
  2. Fetch the latest bundle version by calling `plugin_versions` directly (admin-side) rather than the signed-URL endpoint
  3. Emit a cloud-init command sequence that:
     - Creates `/opt/kodi-bridge/`
     - Downloads the bundle via a cloud-init-scoped signed URL
     - Extracts to `/opt/kodi-bridge/<version>/`
     - Verifies sha256
     - Creates symlink `/opt/kodi-bridge/current`
     - Exports `KODI_BRIDGE_HMAC_SECRET=<secret>` in a systemd drop-in for the OpenClaw service
     - Writes `/root/.openclaw/openclaw.json` with `plugins.load.paths: ["/opt/kodi-bridge/current"]`, `plugins.allow: ["kodi-bridge"]`, and `plugins.entries["kodi-bridge"]` config
     - Starts the gateway
- Update the existing cloud-init tests

**Edge Cases & Error Handling:**

- Bundle fetch fails: cloud-init retries via the package manager layer; if it keeps failing, provisioning is marked failed and alerted
- HMAC secret generation: use `crypto.randomBytes(32)`

**Technical Notes:**

- Reuse the encryption utility in `apps/api/src/lib/encryption.ts` or wherever `gateway_token` is currently encrypted
- Cloud-init sha256 check: `echo "<expected>  kodi-bridge.tgz" | sha256sum --check`

**Acceptance Criteria:**

- [ ] Provisioning a fresh instance installs the plugin
- [ ] `systemctl status openclaw` shows the plugin loaded (via its logs)
- [ ] `curl http://<instance>/plugins/kodi-bridge/health` returns 200

**Out of Scope:**

- Agent provisioning (Milestone 4)

---

## Issue M2-T8

**Title:** Implement Kodi `POST /api/openclaw/events` endpoint (basic)

**Type:** Feature

**Priority:** High

**Depends on:** M1-T4, M1-T9

**Context & Why:**

Kodi needs to receive events from the plugin. A basic version lands here to support the `plugin.started` smoke test; the full event-bus and dispatcher land in M3.

**Detailed Requirements:**

- New router `apps/api/src/routers/openclaw-events/index.ts`
- Endpoint: `POST /api/openclaw/events`
- Auth:
  - Require `Authorization: Bearer <gateway_token>` matching an `instances` row
  - Verify HMAC via `x-kb-signature` using that instance's `plugin_hmac_secret`
- Body validation: zod schema matching the event envelope
- Dedupe: insert into `plugin_event_log` with unique `(instance_id, idempotency_key)`; on duplicate, return 200 with `{ ok: true, deduped: true }`
- Response: `{ ok: true }` status 202
- In this ticket, the dispatcher just logs events; full handlers are M3

**Edge Cases & Error Handling:**

- Bad HMAC: 401
- Bad envelope shape: 400 with zod errors
- Unknown instance: 401 (no info leak)
- Database error on insert: 500, retryable

**Technical Notes:**

- Reuse the HMAC utility from M1-T9

**Acceptance Criteria:**

- [ ] Endpoint accepts signed `plugin.started` events
- [ ] Rejects unsigned or bad-signed events
- [ ] Dedupes replays
- [ ] Events land in `plugin_event_log`

**Out of Scope:**

- Full event dispatcher (Milestone 3)

---

## Issue M2-T9

**Title:** End-to-end smoke test: provision, see `plugin.started`

**Type:** Chore

**Priority:** High

**Depends on:** M2-T5, M2-T6, M2-T7, M2-T8

**Context & Why:**

First time the full loop is exercised. This is the milestone's definition of done.

**Detailed Requirements:**

- Written runbook `docs/openclaw-bridge/runbook.md` with a section "Smoke test: plugin bootstrap"
- Provision a fresh instance in dev
- Observe:
  - `instances.plugin_version_installed` updates (actually this field is updated by heartbeats in M3, so expect `null` still; just observe the event log)
  - `plugin_event_log` contains a `plugin.started` row with the correct version
  - `GET /plugins/kodi-bridge/health` returns 200
- Record timings and any issues
- File follow-up tickets for anything surprising

**Edge Cases & Error Handling:**

- N/A — this is a test, not a feature

**Technical Notes:**

- Run this manually; no automation in this ticket

**Acceptance Criteria:**

- [ ] Smoke test documented in runbook
- [ ] Smoke test passes end-to-end on dev
- [ ] Any issues tracked as follow-ups

**Out of Scope:**

- CI automation of the smoke test (Milestone 8)

---

# Milestone 3 Issues

## Issue M3-T1

**Title:** Define event envelope schema in `packages/shared`

**Type:** Feature

**Priority:** High

**Depends on:** M1-T9

**Context & Why:**

Both the plugin and Kodi must agree on the exact shape of every event. A single source of truth in `packages/shared` prevents drift.

**Detailed Requirements:**

- Create `packages/shared/src/events.ts`
- Export:
  - `EventEnvelopeSchema` zod schema matching the envelope in implementation-spec section 4
  - `EventKind` union type of every v1 kind
  - `PayloadByKind` map from kind to that kind's payload schema
  - `parseEnvelope(json)`: returns a validated envelope or throws
- Unit tests: every kind has a payload schema; parsing accepts valid envelopes; parsing rejects invalid

**Edge Cases & Error Handling:**

- Unknown `kind`: parsing rejects with a clear error
- Missing required fields: parsing rejects

**Technical Notes:**

- Use zod discriminated unions for `kind` -> `payload`

**Acceptance Criteria:**

- [ ] Schema covers every kind in the catalog
- [ ] Roundtrip parse tests pass
- [ ] Shared package consumed by both `apps/api` and `packages/openclaw-bridge`

**Out of Scope:**

- Event handlers

---

## Issue M3-T2

**Title:** Define event kind catalog with payload schemas

**Type:** Feature

**Priority:** High

**Depends on:** M3-T1

**Context & Why:**

Every event kind's payload must be explicit. Agents that pick up a ticket must not guess at payload shape.

**Detailed Requirements:**

- In `packages/shared/src/events.ts`, add payload schemas for every kind:
  - `plugin.started` → `{ pid, started_at }`
  - `plugin.degraded` → `{ reason, since }`
  - `plugin.recovered` → `{ since }`
  - `plugin.update_check` → `{ current_version, latest_version }`
  - `plugin.update_attempted` → `{ from_version, to_version }`
  - `plugin.update_succeeded` → `{ from_version, to_version }`
  - `plugin.update_failed` → `{ from_version, to_version, error }`
  - `plugin.update_rolled_back` → `{ from_version, to_version, error }`
  - `heartbeat` → `{ uptime_s, agent_count }`
  - `agent.provisioned` → `{ user_id, openclaw_agent_id, composio_status }`
  - `agent.deprovisioned` → `{ user_id, openclaw_agent_id }`
  - `agent.failed` → `{ user_id, error }`
  - `agent.bootstrap` → `{ session_key }`
  - `message.received` → `{ session_key, content_summary, content?, speaker }`  — `content` only if `verbosity: full`
  - `message.sent` → same shape
  - `session.compact.after` → `{ session_key, before_tokens, after_tokens }`
  - `session.ended` → `{ session_key, duration_s }`
  - `tool.invoke.before` → `{ tool_name, args_summary, args?, session_key }`
  - `tool.invoke.after` → `{ tool_name, duration_ms, outcome: 'ok' | 'error', error? }`
  - `tool.denied` → `{ tool_name, reason, policy_level }`
  - `tool.approval_requested` → `{ request_id, tool_name, args, session_key, policy_level }`
  - `tool.approval_resolved` → `{ request_id, approved, reason? }`
  - `composio.session_failed` → `{ user_id, error }`
  - `composio.session_rotated` → `{ user_id }`
- Add a `verbosity` discriminator on each where applicable

**Edge Cases & Error Handling:**

- `content?` fields omitted when summary verbosity; required when full — zod `z.union` or refine

**Technical Notes:**

- Keep payloads small in `summary` verbosity

**Acceptance Criteria:**

- [ ] All listed kinds have schemas
- [ ] Verbosity discriminates content inclusion
- [ ] Unit tests parse both summary and full variants

**Out of Scope:**

- Emitting these kinds (follow-ups)

---

## Issue M3-T3

**Title:** Implement `event-bus` module: hook bindings and emitter

**Type:** Feature

**Priority:** High

**Depends on:** M2-T4, M3-T1, M3-T2

**Context & Why:**

The event bus is how the plugin talks to Kodi. It subscribes to OpenClaw hooks, translates them into typed events, and POSTs them signed.

**Detailed Requirements:**

- `src/modules/event-bus/emitter.ts`:
  - Exports `createEmitter({ kodiClient, subscriptions, outbox })`
  - `emitter.emit(kind, payload)`: checks subscription, constructs envelope, signs, POSTs; on failure, pushes to outbox
  - Uses retry/backoff in `kodiClient`
- `src/modules/event-bus/hook-bindings.ts`:
  - Subscribes to OpenClaw hooks: `message:received`, `message:sent`, `session:compact:after`, `command:new`, `agent:bootstrap`
  - Each hook handler constructs the appropriate event payload at the appropriate verbosity and calls `emitter.emit`
- `src/modules/event-bus/index.ts`:
  - `register(api, context)` wires both files together
- Replace the inline `plugin.started` call from M2-T6 with `emitter.emit('plugin.started', ...)`

**Edge Cases & Error Handling:**

- Hook fires before subscriptions loaded: default to all-summary until config arrives
- Emit fails with 401: do not retry, log a `plugin.auth_failed` event to stdout

**Technical Notes:**

- The outbox fallback is a separate ticket (M3-T4) but the emitter interface accepts an outbox instance

**Acceptance Criteria:**

- [ ] All five hooks wired
- [ ] Events match schemas from M3-T2
- [ ] Kodi receives `message.received` / `message.sent` during a test chat turn

**Out of Scope:**

- Disk outbox (next ticket)
- Subscription config loading (M3-T5)

---

## Issue M3-T4

**Title:** Implement `event-bus` disk outbox

**Type:** Feature

**Priority:** High

**Depends on:** M3-T3

**Context & Why:**

Network partitions and transient Kodi outages should not lose events. The plugin buffers undeliverable events to disk and flushes them when service recovers.

**Detailed Requirements:**

- `src/modules/event-bus/outbox.ts`:
  - Writes failed events as JSON lines to `<outbox_path>/pending.jsonl`
  - `outbox.push(envelope)` appends
  - `outbox.flush(kodiClient)` reads pending, re-attempts each, on success removes the line, on failure leaves it
  - Flush trigger: on every successful emit, and on a 30-second timer
- Rotate the file at 10 MB to prevent unbounded growth
- On plugin startup, flush the outbox

**Edge Cases & Error Handling:**

- Disk full: log, stop writing, emit `plugin.degraded`
- Corrupt JSON lines: skip and log

**Technical Notes:**

- Use `fs.promises.appendFile` with exclusive locks if concurrent flushes are possible (single-flush lock)

**Acceptance Criteria:**

- [ ] Induced Kodi downtime: events buffer to disk
- [ ] Restore Kodi: outbox flushes
- [ ] Rotate at 10 MB works

**Out of Scope:**

- Circuit breaker (Milestone 8)

---

## Issue M3-T5

**Title:** Subscription config loader and `/config/subscriptions` inbound route

**Type:** Feature

**Priority:** High

**Depends on:** M3-T3, M2-T4

**Context & Why:**

Kodi must be able to change what the plugin emits at runtime. A subscription config lives in Postgres, is fetched by the plugin on startup, and is pushed to the plugin when updated.

**Detailed Requirements:**

- Kodi side:
  - `GET /api/openclaw/subscriptions?instance_id=<id>` — returns the row or a default if none
  - `PUT /api/openclaw/subscriptions` — upserts, then POSTs to `/plugins/kodi-bridge/config/subscriptions` on the instance
  - Default on first read: every kind enabled at `summary` verbosity, except `tool.invoke.after` and `tool.approval_requested` which are `full`
- Plugin side:
  - On register, plugin calls `GET /api/openclaw/subscriptions` and caches the result
  - Inbound route `POST /plugins/kodi-bridge/config/subscriptions` updates the cache
  - Periodic re-fetch every 10 minutes as a fallback
- Emitter checks the cache on every emit to decide enabled + verbosity

**Edge Cases & Error Handling:**

- Subscription fetch fails at startup: use the default
- Glob matching: most-specific wins; tie-break on declaration order

**Technical Notes:**

- Glob library: `minimatch` (bundle inline in the plugin)

**Acceptance Criteria:**

- [ ] Changing subscriptions in Postgres + pushing via PUT takes effect within seconds on the instance
- [ ] Periodic re-fetch works
- [ ] Default subscription applied when none persisted

**Out of Scope:**

- Admin UI for editing subscriptions

---

## Issue M3-T6

**Title:** Implement `inbound-api` module with HMAC verify middleware

**Type:** Feature

**Priority:** High

**Depends on:** M2-T4, M1-T9

**Context & Why:**

Kodi drives the plugin through a family of HTTP routes. The verify middleware guarantees every inbound call is HMAC-signed by Kodi, timestamped, and not a replay.

**Detailed Requirements:**

- `src/modules/inbound-api/verify.ts`:
  - Middleware that reads `x-kb-timestamp`, `x-kb-nonce`, `x-kb-signature` headers
  - Verifies via `packages/shared/hmac.ts`
  - Rejects on SKEW, SIGNATURE, or missing headers
  - Dedupes on `(nonce)` within a 10-minute in-memory window
- `src/modules/inbound-api/router.ts`:
  - Registers every inbound route listed in implementation-spec § 2.4.5 under `POST /plugins/kodi-bridge/*`
  - Each handler is a stub that returns 501 Not Implemented for now; real handlers land in later tickets in this milestone and M4/M5
- `POST /plugins/kodi-bridge/admin/reload` is real: re-reads subscriptions and any other cached config

**Edge Cases & Error Handling:**

- Body parsing failure: 400
- HMAC rejection: 401
- Replay (known nonce): 409

**Technical Notes:**

- LRU cache for nonces: bound size at 10k

**Acceptance Criteria:**

- [ ] Kodi can call `/admin/reload` signed and it succeeds
- [ ] Unsigned or bad-signed call rejected with 401
- [ ] Replay rejected with 409
- [ ] All other routes present but return 501

**Out of Scope:**

- Real agent, policy, inject handlers

---

## Issue M3-T7

**Title:** Kodi-side event dispatcher

**Type:** Feature

**Priority:** High

**Depends on:** M2-T8, M3-T2

**Context & Why:**

The `/api/openclaw/events` endpoint currently only logs. We need to route events to the right handlers: update `last_plugin_heartbeat_at` on heartbeat, update `plugin_version_installed` on `plugin.started`, etc.

**Detailed Requirements:**

- Refactor `/api/openclaw/events` to dispatch by `event.kind`:
  - `plugin.started`: update `instances.plugin_version_installed`
  - `heartbeat`: update `instances.last_plugin_heartbeat_at`
  - `plugin.update_*`: update a new column or separate log (use `plugin_event_log` for now)
  - `agent.*`: forward to agent-lifecycle handler (implemented in M4)
  - `tool.*`: forward to tool-audit handler (implemented in M5)
  - `message.*`, `session.*`, `composio.*`: persisted in `plugin_event_log`; no other handler in this milestone
- Handler map lives in `apps/api/src/lib/openclaw-events/dispatcher.ts`
- Unknown kinds: 400 with clear error (not silent-drop)

**Edge Cases & Error Handling:**

- Handler throws: log, return 500, plugin will retry
- Concurrent heartbeats for the same instance: last-write-wins on the timestamp column

**Technical Notes:**

- Use a simple `Record<kind, handler>` map

**Acceptance Criteria:**

- [ ] `plugin_version_installed` updated on `plugin.started`
- [ ] `last_plugin_heartbeat_at` updated on `heartbeat`
- [ ] Unknown kind rejected
- [ ] Event log has rows for every event regardless of handler

**Out of Scope:**

- Agent handlers (Milestone 4)
- Tool audit (Milestone 5)

---

## Issue M3-T8

**Title:** Plugin heartbeat emitter

**Type:** Feature

**Priority:** Medium

**Depends on:** M3-T3

**Context & Why:**

Kodi needs to know a plugin is alive. A periodic heartbeat supplies the signal, and its absence supplies the ops alert.

**Detailed Requirements:**

- In `event-bus`, start a heartbeat timer at interval `heartbeat_interval_seconds` from config (default 60s)
- Each tick emits `heartbeat` with `{ uptime_s, agent_count }`
- Heartbeat respects subscription (if disabled, skip)

**Edge Cases & Error Handling:**

- Heartbeat fails to emit: outbox catches it; next tick still fires

**Technical Notes:**

- Use `setInterval`; cancel in a shutdown hook

**Acceptance Criteria:**

- [ ] `instances.last_plugin_heartbeat_at` updates regularly
- [ ] Disabling heartbeat subscription stops emissions within one tick

**Out of Scope:**

- Ops alerting (Milestone 8)

---

## Issue M3-T9

**Title:** Kodi sends `admin/reload` after subscription update

**Type:** Feature

**Priority:** Medium

**Depends on:** M3-T5, M3-T6

**Context & Why:**

When Kodi updates subscriptions, the plugin should pick them up immediately, not on the next 10-minute timer. Kodi pushes the change via `/admin/reload`.

**Detailed Requirements:**

- After `PUT /api/openclaw/subscriptions`, Kodi signs and POSTs to `/plugins/kodi-bridge/admin/reload` on the instance
- On failure, Kodi logs but does not fail the PUT — the plugin still re-fetches on its own timer

**Edge Cases & Error Handling:**

- Instance unreachable: log; fall back to periodic refetch
- Instance returns 401: log as misconfiguration alert

**Technical Notes:**

- Use the new `apps/api/src/lib/openclaw/plugin-client.ts` built in M2 if not already; otherwise add it here

**Acceptance Criteria:**

- [ ] Subscriptions updated in Kodi take effect on the instance within 2 seconds
- [ ] Failure during push does not block the PUT

**Out of Scope:**

- Bulk subscription updates

---

# Milestone 4 Issues

## Issue M4-T1

**Title:** Implement `agent-manager` module core

**Type:** Feature

**Priority:** High

**Depends on:** M2-T4, M0-T3

**Context & Why:**

This module is the plugin-side authority for the agents inside this instance. It creates agents on command, destroys them on command, and reconciles against Kodi at startup.

**Detailed Requirements:**

- `src/modules/agent-manager/registry.ts`:
  - In-memory map keyed by both `user_id` and `openclaw_agent_id`
  - Methods: `add`, `remove`, `getByUser`, `getByAgentId`, `list`
- `src/modules/agent-manager/provision.ts`:
  - `provisionAgent({ user_id, composio_session })`:
    - Generates an `openclaw_agent_id` (format `agent_<shortuuid>`)
    - Creates agent workspace via plugin SDK primitives confirmed in M0-T3
    - Writes `IDENTITY.md` with `{ user_id, created_at, org_id }` frontmatter
    - Calls `composio/mount.ts` to mount MCP (M4-T3)
    - Adds to registry
    - Emits `agent.provisioned`
- `src/modules/agent-manager/deprovision.ts`:
  - Unmounts MCP, destroys workspace, removes from registry, emits `agent.deprovisioned`
- Register `register(api)`: no routes here (routes land in M4-T2), just initialization + reconcile on startup

**Edge Cases & Error Handling:**

- Duplicate provision for same user: idempotent; return existing `openclaw_agent_id`
- Deprovision of unknown user: no-op, return success

**Technical Notes:**

- If M0-T3 identified a CLI-only path for any step, use `execFile` to spawn `openclaw`

**Acceptance Criteria:**

- [ ] Provision creates a functional agent with `IDENTITY.md`
- [ ] Deprovision fully cleans up
- [ ] Registry reflects live state

**Out of Scope:**

- Composio mounting details (M4-T3)
- Route handlers (M4-T2)

---

## Issue M4-T2

**Title:** Wire `/agents/provision` and `/agents/deprovision` routes

**Type:** Feature

**Priority:** High

**Depends on:** M4-T1, M3-T6

**Context & Why:**

Replace the 501 stubs in `inbound-api` with real handlers that call into `agent-manager`.

**Detailed Requirements:**

- `POST /plugins/kodi-bridge/agents/provision`:
  - Body: `{ user_id, composio_session?: { mcp_url, headers } }`
  - Calls `provisionAgent`
  - Response: `{ openclaw_agent_id, composio_status: 'active' | 'failed' | 'skipped' }`
- `POST /plugins/kodi-bridge/agents/deprovision`:
  - Body: `{ user_id }`
  - Calls `deprovisionAgent`
  - Response: `{ ok: true }`

**Edge Cases & Error Handling:**

- Missing user_id: 400
- Provision returns `composio_status: failed`: still 200 with the failure status; Kodi surfaces retry UI

**Technical Notes:**

- Keep business logic in agent-manager; route handlers are thin

**Acceptance Criteria:**

- [ ] Kodi can provision an agent via signed POST
- [ ] Kodi can deprovision
- [ ] Idempotency on re-provision verified

**Out of Scope:**

- Agent reconciliation at startup (M4-T8)

---

## Issue M4-T3

**Title:** Implement `composio` module: per-agent MCP mount

**Type:** Feature

**Priority:** High

**Depends on:** M4-T1, M0-T1

**Context & Why:**

Each agent has its own Composio session. The plugin mounts each session as an MCP server scoped to that agent, so the agent's tool loadout includes Composio tools attributed to the correct user.

**Detailed Requirements:**

- `src/modules/composio/mount.ts`:
  - `mountComposioForAgent({ openclaw_agent_id, mcp_url, headers })`: calls `openclaw mcp set kodi-composio:<agentId>` with the JSON config, scoped (if scoping works per M0-T1) to the agent
  - If MCP scoping to a specific agent is not supported, document the workaround (dynamic filtering at tool-invocation time; see M0-T1 memo fallback path)
- `src/modules/composio/rotate.ts`:
  - `rotateComposioForAgent({ openclaw_agent_id, mcp_url, headers })`: same as mount but replaces an existing entry
- On success, emit nothing (the agent.provisioned event includes `composio_status: active`)
- On failure, emit `composio.session_failed` and return the failure

**Edge Cases & Error Handling:**

- MCP URL unreachable: mount still succeeds locally; runtime errors surface on first tool call. Log a warning.
- Mount fails: return `{ status: 'failed', error }` to the caller

**Technical Notes:**

- Use `execFile` on the `openclaw` CLI if there is no programmatic API
- Per M0-T1, if scoping is not supported, this module tracks which agent owns which MCP entry and filters at invoke time

**Acceptance Criteria:**

- [ ] A provisioned agent can call a Composio tool via its MCP mount
- [ ] Rotating a session replaces the URL without losing other state
- [ ] Failure path emits the correct event

**Out of Scope:**

- Kodi-side Composio session creation (M4-T5)

---

## Issue M4-T4

**Title:** Kodi-side: Composio session creation on agent provisioning

**Type:** Feature

**Priority:** High

**Depends on:** M4-T3

**Context & Why:**

When Kodi provisions an agent for a user, it must create a Composio session (via the Composio SDK), encrypt the resulting MCP URL/headers, persist them, and pass them to the plugin.

**Detailed Requirements:**

- In `apps/api/src/lib/composio.ts` or a new `apps/api/src/lib/composio-sessions.ts`:
  - `createPersistentSession({ user_id, toolkit_allowlist })` calls `composio.create(user_id=<kodi_user_id_string>, toolkits=toolkit_allowlist)` and returns `{ mcp_url, mcp_headers }`
- On agent provisioning, Kodi:
  1. Picks the user's allowed toolkit allowlist from `toolkit_policies`
  2. Calls `createPersistentSession`
  3. Encrypts MCP url + headers, persists to `openclaw_agents.composio_session_enc`
  4. Passes them to the plugin's `/agents/provision`
- Handle failure: persist row with `composio_status='failed'`, agent is still provisioned, Kodi surfaces retry

**Edge Cases & Error Handling:**

- Composio API error: log and mark failed; do not block agent provisioning
- Toolkit allowlist empty: create a session with zero toolkits — agent has access to Composio's meta-tools only

**Technical Notes:**

- Use the official Composio SDK from `apps/api` — already wired per existing tool-access code

**Acceptance Criteria:**

- [ ] Provisioning a user produces a persisted `composio_session_enc`
- [ ] Failure path tested and observable via `composio_status`

**Out of Scope:**

- Refreshing sessions (M4-T7)

---

## Issue M4-T5

**Title:** Hook agent provisioning into org membership changes

**Type:** Feature

**Priority:** High

**Depends on:** M4-T4

**Context & Why:**

When a user is added to an org, they should get an agent automatically. When removed, the agent should be torn down.

**Detailed Requirements:**

- Find and update the existing org-membership mutation(s) in `apps/api/src/routers/`
- On `addOrgMember`, after the member row is committed, call into the new agent provisioning flow
- On `removeOrgMember`, call the deprovision flow
- Both flows should be idempotent and best-effort: a failed agent provision does not roll back the membership change; it logs, surfaces, and is retryable

**Edge Cases & Error Handling:**

- Org has no instance yet: skip agent provisioning; provisioning will happen when the instance provisioning completes (add this to the end of instance provisioning as a reconciliation step)
- Instance is not `running`: queue for retry via the existing job system

**Technical Notes:**

- Avoid blocking UI on agent provisioning; fire-and-forget with status polling

**Acceptance Criteria:**

- [ ] Adding a user to an org triggers agent provisioning
- [ ] Removing triggers deprovisioning
- [ ] Failed provisioning is retryable

**Out of Scope:**

- "Org agent" (user_id = null) — implement in M4-T6

---

## Issue M4-T6

**Title:** Provision "org agent" on instance creation

**Type:** Feature

**Priority:** Medium

**Depends on:** M4-T5

**Context & Why:**

Per the memory plan's org/member split, an "org agent" represents org-level autonomous work independent of any specific user. It exists even before any user logs in.

**Detailed Requirements:**

- When instance provisioning completes, immediately provision one agent with `user_id = null` and `openclaw_agent_id = 'org-agent'`
- No Composio session for the org agent in v1 (it has no user identity to attach connections to) — `composio_status = 'skipped'`
- Future tickets (out of scope) may wire an org-wide service account for Composio

**Edge Cases & Error Handling:**

- Org agent already exists: no-op
- Provision fails: retryable via same job system

**Technical Notes:**

- Uses the same `/agents/provision` route, just with `user_id: null`

**Acceptance Criteria:**

- [ ] Every org instance has an `org-agent`
- [ ] Org agent callable via the runtime

**Out of Scope:**

- Org-wide Composio integration

---

## Issue M4-T7

**Title:** Composio session rotation on credential change

**Type:** Feature

**Priority:** Medium

**Depends on:** M4-T4, M4-T3

**Context & Why:**

When a user reconnects a toolkit, Composio may issue a new session; we must rotate on the plugin so the agent's MCP reflects the new URL.

**Detailed Requirements:**

- In `apps/api/src/lib/composio.ts`, on `toolkit_connections` change (new connection, revoked connection, reauth), call `rotateAgentSession(user_id)` which:
  1. Creates a new Composio session
  2. Encrypts and persists
  3. Calls the plugin's `/agents/provision` with the updated session (provision is idempotent; it updates the MCP mount)
- Emit `composio.session_rotated` from the plugin

**Edge Cases & Error Handling:**

- Rotation fails: `composio_status = 'failed'`
- Multiple concurrent rotations: last-write-wins; rotation is idempotent

**Technical Notes:**

- Tie into whatever existing "connection changed" event the Composio wrapper already emits

**Acceptance Criteria:**

- [ ] Reconnecting a toolkit triggers a rotation
- [ ] Agent's tool loadout reflects the new connection

**Out of Scope:**

- UI for manual rotation

---

## Issue M4-T8

**Title:** Plugin startup reconciliation of agent list

**Type:** Feature

**Priority:** High

**Depends on:** M4-T2

**Context & Why:**

On every plugin startup (including after self-update), the plugin should reconcile its local agent registry against Kodi's authoritative list to handle drift.

**Detailed Requirements:**

- Kodi endpoint: `GET /api/openclaw/agents?instance_id=<id>` — returns the list of agents for this instance with their expected state
- On register, `agent-manager` calls this endpoint and:
  1. Creates any agent present in Kodi but missing locally
  2. Deprovisions any agent present locally but missing in Kodi
  3. Updates composio mounts for agents whose session has changed

**Edge Cases & Error Handling:**

- Kodi unreachable at startup: log, proceed with stale local state; retry reconciliation on an hourly cadence
- Partial reconcile failure: continue with others; emit `agent.failed` for each failure

**Technical Notes:**

- Reconciliation is idempotent

**Acceptance Criteria:**

- [ ] Restart plugin with drift: state converges
- [ ] Kodi-unreachable case does not crash the plugin

**Out of Scope:**

- Cross-instance reconciliation

---

## Issue M4-T9

**Title:** Env vars for Composio session defaults

**Type:** Chore

**Priority:** Low

**Depends on:** M4-T4

**Context & Why:**

Composio SDK needs its API key and default behavior in Kodi env.

**Detailed Requirements:**

- Confirm existing `COMPOSIO_API_KEY` and related vars are sufficient; document in `docs/openclaw-bridge/infra.md`
- Add `COMPOSIO_SESSION_DEFAULT_TOOLKITS` as a comma-separated list used when the user has no toolkit allowlist defined

**Edge Cases & Error Handling:**

- N/A

**Technical Notes:**

- Follows existing env pattern

**Acceptance Criteria:**

- [ ] Env documented
- [ ] Default toolkit list used when policy is empty

**Out of Scope:**

- Any SDK code changes

---

# Milestone 5 Issues

## Issue M5-T1

**Title:** Implement `autonomy` module: policy loader

**Type:** Feature

**Priority:** High

**Depends on:** M1-T3, M2-T4

**Context & Why:**

The plugin needs to know each agent's current policy. Policies live on the Kodi side; the plugin caches them and refreshes on push or expiry.

**Detailed Requirements:**

- `src/modules/autonomy/policy.ts`:
  - In-memory cache keyed by `agent_id` (or `user_id` resolved to `agent_id` via agent-manager)
  - `getPolicy(agentId)`: returns cached or fetches from Kodi `GET /api/openclaw/agents/:id/autonomy`
  - Cache TTL: 15 minutes
  - Invalidate on `POST /plugins/kodi-bridge/agents/update-policy`
- Default policy: `{ autonomy_level: 'normal', overrides: null }`

**Edge Cases & Error Handling:**

- Kodi unreachable: use cached or default; log
- Policy references unknown level: reject upstream (Kodi's setter validates)

**Technical Notes:**

- Cache is per-plugin-process; nothing persisted to disk

**Acceptance Criteria:**

- [ ] Policy fetch works
- [ ] Cache invalidation works
- [ ] Default used when fetch fails

**Out of Scope:**

- Enforcement (M5-T2)

---

## Issue M5-T2

**Title:** Implement pre-tool-invoke interceptor for autonomy enforcement

**Type:** Feature

**Priority:** High

**Depends on:** M5-T1, M0-T2

**Context & Why:**

The heart of autonomy: intercept tool calls, classify them, evaluate policy, and either allow / deny / request approval.

**Detailed Requirements:**

- `src/modules/autonomy/interceptor.ts`:
  - Registers a pre-tool-invoke hook (if M0-T2 confirmed one exists); otherwise implements the wrapping-pattern fallback
  - For each call:
    1. Resolve agent from session context
    2. Get policy via `getPolicy(agentId)`
    3. Classify tool via `@kodi/shared/action-class` (M5-T6)
    4. Evaluate: most-specific override wins, else level rule
    5. If `allow`: proceed; emit `tool.invoke.before`
    6. If `deny`: block with a structured error result; emit `tool.denied`
    7. If `ask`: emit `tool.approval_requested`; block via promise; timeout per level
- On hook-dispatch failure, fail closed: deny the call and emit `tool.denied`

**Edge Cases & Error Handling:**

- Unknown tool name: classify as `write` (conservative default)
- Session has no agent mapping: deny with clear error (should never happen in practice)

**Technical Notes:**

- Approval promise tracked in a map keyed by `request_id`

**Acceptance Criteria:**

- [ ] `strict` agent: every call requires approval
- [ ] `yolo` agent: every call proceeds immediately
- [ ] `normal`: reads auto, writes ask
- [ ] Override: `slack.*` set to `ask` under `lenient` prompts

**Out of Scope:**

- UI for approvals

---

## Issue M5-T3

**Title:** Approval request/resolve flow on Kodi side

**Type:** Feature

**Priority:** High

**Depends on:** M5-T2

**Context & Why:**

When the plugin emits `tool.approval_requested`, Kodi must create an approval record, surface it to the user, and accept the resolution.

**Detailed Requirements:**

- Handler for `tool.approval_requested` in the event dispatcher:
  - Create an `approvals` row (reuse existing schema in `packages/db/src/schema/approvals.ts`)
  - Link to `agent_id`, `request_id`, `tool_name`, `args`, `session_key`
  - Expose via existing approvals UI surface
- Kodi → plugin: when the user approves or denies, Kodi signs and POSTs to `/plugins/kodi-bridge/approvals/:request_id/resolve` with `{ approved, reason? }`
- Plugin: resolves the pending promise

**Edge Cases & Error Handling:**

- Approval timeout before user responds: plugin auto-denies; Kodi marks approval as `expired`
- User resolves after plugin has timed out: Kodi sends resolution anyway (plugin dedupes on `request_id` and no-ops)

**Technical Notes:**

- Extend existing `tool-access-approvals.ts` rather than creating a parallel system

**Acceptance Criteria:**

- [ ] Approvals appear in the existing UI
- [ ] Approving unblocks the tool
- [ ] Denying returns a structured error result to the agent
- [ ] Timeout works as expected per level

**Out of Scope:**

- New approval UI — reuse existing

---

## Issue M5-T4

**Title:** `PUT /api/openclaw/agents/:id/autonomy` endpoint

**Type:** Feature

**Priority:** High

**Depends on:** M1-T3

**Context & Why:**

Kodi users (admins) need a way to set autonomy levels per agent. This is the mutation endpoint.

**Detailed Requirements:**

- `PUT /api/openclaw/agents/:id/autonomy`
- Auth: requires an Kodi-session user with admin privileges on the org that owns the agent
- Body: `{ autonomy_level, overrides?: Record<string, 'allow' | 'ask' | 'deny'> }`
- Validation: level in enum; overrides keys are glob strings; override values in enum
- Persists to `agent_autonomy_policies` (upsert)
- After persist, signs and POSTs to `/plugins/kodi-bridge/agents/update-policy` on the instance to invalidate the plugin cache

**Edge Cases & Error Handling:**

- Unknown agent: 404
- Non-admin caller: 403
- Invalid body: 400

**Technical Notes:**

- Add org-admin check using existing auth patterns

**Acceptance Criteria:**

- [ ] Admin can change autonomy and change takes effect within seconds
- [ ] Non-admin rejected
- [ ] Invalid overrides rejected

**Out of Scope:**

- Bulk updates
- UI

---

## Issue M5-T5

**Title:** Audit all tool invocations in `plugin_event_log`

**Type:** Feature

**Priority:** Medium

**Depends on:** M5-T2

**Context & Why:**

Regardless of autonomy level, every tool call must be auditable. `tool.invoke.after` with outcome + duration + args-at-`full`-verbosity covers this.

**Detailed Requirements:**

- Ensure `tool.invoke.after` always fires, even on `yolo` auto-allow
- Subscription default for `tool.invoke.after`: always `full` verbosity
- Add a simple Kodi read endpoint: `GET /api/openclaw/agents/:id/tool-log?since=...` for ops/debug

**Edge Cases & Error Handling:**

- Event volume: high for busy agents; the disk outbox and rate limit (M8) handle this

**Technical Notes:**

- This ticket is a lot about discipline — do not allow any interceptor path to skip the audit event

**Acceptance Criteria:**

- [ ] Every invocation (allowed, denied, or approved) produces a row in `plugin_event_log`
- [ ] Read endpoint returns the tool log for an agent

**Out of Scope:**

- Admin UI

---

## Issue M5-T6

**Title:** Extract shared action-class utility

**Type:** Refactor

**Priority:** Medium

**Depends on:** None

**Context & Why:**

Verb-to-action-class logic lives in `apps/api/src/lib/tool-access-runtime.ts` today. Both Kodi and the plugin need it; put it in `packages/shared`.

**Detailed Requirements:**

- Create `packages/shared/src/action-class.ts`:
  - Exports `classifyToolCall(toolName: string): 'read' | 'draft' | 'write' | 'admin'`
  - Moves `READ_VERBS`, `DRAFT_VERBS`, `WRITE_VERBS`, `ADMIN_KEYWORDS` here
  - Keeps original behavior byte-for-byte
- Replace usages in `tool-access-runtime.ts`

**Edge Cases & Error Handling:**

- No behavior change

**Technical Notes:**

- Keep unit tests that pin the existing classification behavior

**Acceptance Criteria:**

- [ ] No regressions in existing chat tool-call flow
- [ ] Plugin imports from `@kodi/shared`

**Out of Scope:**

- Changing classification semantics

---

## Issue M5-T7

**Title:** Documentation: autonomy user guide

**Type:** Chore

**Priority:** Low

**Depends on:** M5-T4

**Context & Why:**

Admins will operate this. A single doc that shows levels, overrides, and the approval lifecycle reduces support load.

**Detailed Requirements:**

- `docs/openclaw-bridge/autonomy.md` with:
  - What each level means (reads, drafts, writes, admin)
  - Override syntax with examples
  - Approval UX flow
  - Timeout behavior per level
  - How to change a level via API (until UI exists)

**Acceptance Criteria:**

- [ ] Doc merged

**Out of Scope:**

- UI copy

---

# Milestone 6 Issues

## Issue M6-T1

**Title:** Implement `updater` module: check loop

**Type:** Feature

**Priority:** High

**Depends on:** M2-T4, M1-T7

**Context & Why:**

The plugin checks for updates on startup and on a cron cadence. This is the entry point of the self-update pipeline.

**Detailed Requirements:**

- `src/modules/updater/check.ts`:
  - `checkForUpdate()`: calls `GET /api/plugin-bundle/latest?current_version=<v>`; returns `{ upToDate: true }` or `{ upToDate: false, version, bundle_url, sha256 }`
- Timer: run `checkForUpdate` every `bundle_check_interval_seconds` (default 3600)
- Emit `plugin.update_check` on every check

**Edge Cases & Error Handling:**

- API 304: upToDate true
- API error: retry next tick, do not crash

**Acceptance Criteria:**

- [ ] Scheduled checks occur
- [ ] Event emitted

**Out of Scope:**

- Download/swap

---

## Issue M6-T2

**Title:** Implement `updater` download and sha256 verification

**Type:** Feature

**Priority:** High

**Depends on:** M6-T1

**Context & Why:**

Downloading the bundle and verifying sha256 prevents corrupted or tampered artifacts from ever running.

**Detailed Requirements:**

- `src/modules/updater/download.ts`:
  - `downloadBundle({ bundle_url, sha256, version })`:
    1. Download to `/tmp/kb-<version>.tgz`
    2. Compute sha256; compare; abort if mismatch
    3. Extract to `/opt/kodi-bridge/<version>/` (use tar via `execFile`)
    4. Return the extracted path
- Cleanup `/tmp/kb-*` on exit

**Edge Cases & Error Handling:**

- sha256 mismatch: emit `plugin.update_failed`, cleanup, abort
- Disk full: abort, log, emit
- Signed URL expired mid-download: re-fetch from check endpoint

**Technical Notes:**

- Use streaming download; do not load the whole archive in memory

**Acceptance Criteria:**

- [ ] Happy path downloads and extracts
- [ ] Tampered bundle aborts

**Out of Scope:**

- Swap

---

## Issue M6-T3

**Title:** Implement `updater` pre-swap health check

**Type:** Feature

**Priority:** High

**Depends on:** M6-T2

**Context & Why:**

Avoid flipping the symlink to a broken version. A short child process imports the new bundle and calls a health function before we commit.

**Detailed Requirements:**

- `src/modules/updater/health-probe.ts`:
  - Spawn `node` (the OpenClaw runtime Node version) with a small probe script that imports the new `dist/index.js` and calls its `healthCheck()` export
  - Expose `healthCheck()` from the plugin entry — a function that returns `true` if minimal smoke is okay (config schema parseable, HMAC utility works)
- 10-second timeout

**Edge Cases & Error Handling:**

- Probe times out: treat as failure
- Probe throws: failure with captured error

**Technical Notes:**

- Child process is isolated so the running plugin is unaffected

**Acceptance Criteria:**

- [ ] Broken bundle (syntax error) rejected
- [ ] Working bundle accepted

**Out of Scope:**

- Full integration probe

---

## Issue M6-T4

**Title:** Implement `updater` atomic swap + gateway restart

**Type:** Feature

**Priority:** High

**Depends on:** M6-T3

**Context & Why:**

Once health-checked, flip the symlink and restart the gateway so the new plugin is loaded.

**Detailed Requirements:**

- `src/modules/updater/swap.ts`:
  - `atomicSwap(newVersionPath)`:
    1. Record the current symlink target as `previous`
    2. `ln -sfn <newVersionPath> /opt/kodi-bridge/current`
    3. Call `openclaw gateway restart` (or equivalent)
    4. Wait up to 60 seconds for `plugin.started` to arrive at Kodi with the new version
    5. If success: emit `plugin.update_succeeded`
    6. If failure: invoke rollback (M6-T5)

**Edge Cases & Error Handling:**

- Restart command fails: roll back immediately
- `plugin.started` never arrives: roll back
- Gateway restart takes >60s: still considered failure

**Technical Notes:**

- How to wait for `plugin.started` from inside the not-yet-running plugin: the check can use Kodi as an oracle by calling `GET /api/openclaw/instances/:id/latest-event?kind=plugin.started` and comparing versions after the restart trigger. Simpler alternative: have the post-restart plugin probe a sentinel file written before swap.

**Acceptance Criteria:**

- [ ] Symlink flips atomically
- [ ] Gateway restarts
- [ ] Success emits correct event

**Out of Scope:**

- Drain (deferred)

---

## Issue M6-T5

**Title:** Implement `updater` rollback on failure

**Type:** Feature

**Priority:** High

**Depends on:** M6-T4

**Context & Why:**

When the new version fails to start, automatically revert.

**Detailed Requirements:**

- `src/modules/updater/rollback.ts`:
  - `rollback(previousPath)`:
    1. `ln -sfn <previousPath> /opt/kodi-bridge/current`
    2. `openclaw gateway restart`
    3. Emit `plugin.update_rolled_back` (from the previous plugin, since the new one failed)
- If previous plugin also fails to come up, escalate (no magical fix; Kodi shows a "stuck" alert)

**Edge Cases & Error Handling:**

- Double failure: emit `plugin.update_failed` with context and stop the update loop until manual intervention (state file `/opt/kodi-bridge/state/update-halted`)

**Technical Notes:**

- Previous version's plugin picks up the `plugin.update_rolled_back` event if it manages to boot again

**Acceptance Criteria:**

- [ ] Forced failure triggers rollback
- [ ] Double failure halts the loop

**Out of Scope:**

- Manual recovery tooling (M8)

---

## Issue M6-T6

**Title:** Retain last 2 versions; prune older

**Type:** Chore

**Priority:** Medium

**Depends on:** M6-T4

**Context & Why:**

Unbounded disk growth is a slow burn. Keep the current and one previous version only.

**Detailed Requirements:**

- After successful update, delete all versioned directories under `/opt/kodi-bridge/` except `current` target and the immediately-previous

**Acceptance Criteria:**

- [ ] Disk usage bounded

**Out of Scope:**

- None

---

## Issue M6-T7

**Title:** `bundle_version_target` override for canaries

**Type:** Feature

**Priority:** Medium

**Depends on:** M1-T7, M6-T1

**Context & Why:**

To canary a new version, set `instances.bundle_version_target` for one instance and observe before rolling fleet-wide.

**Detailed Requirements:**

- `GET /api/plugin-bundle/latest` already honors `bundle_version_target` (M1-T7)
- Kodi admin endpoint: `POST /api/internal/instances/:id/bundle-target` body `{ version?: string }`
- When set: instance installs that exact version on next check
- When cleared (null): instance follows `latest`

**Edge Cases & Error Handling:**

- Target version that does not exist: API returns 404 on lookup; plugin stays on current

**Acceptance Criteria:**

- [ ] Canary instance installs the pinned version
- [ ] Clearing target lets it catch up to latest

**Out of Scope:**

- UI for rollout management

---

## Issue M6-T8

**Title:** Admin endpoint: trigger update immediately

**Type:** Feature

**Priority:** Medium

**Depends on:** M6-T1

**Context & Why:**

For urgent fixes we do not want to wait for the next check. This endpoint fires `/plugins/kodi-bridge/admin/update`.

**Detailed Requirements:**

- `POST /api/internal/instances/:id/update` body `{ version?: string }`
- Signs and POSTs to the instance's `/admin/update`
- Plugin-side handler for `/admin/update`: runs the check-download-swap pipeline once, optionally with a pinned version

**Edge Cases & Error Handling:**

- Plugin currently mid-update: reject with 409
- Instance unreachable: 502

**Acceptance Criteria:**

- [ ] Pushing an urgent update works within a minute

**Out of Scope:**

- Bulk push

---

# Milestone 7 Issues

## Issue M7-T1

**Title:** Implement `memory` module slot with registration API

**Type:** Feature

**Priority:** Medium

**Depends on:** M2-T4

**Context & Why:**

The memory team needs a stable integration point inside the plugin. A registration API lets them add tools without touching the rest of the plugin.

**Detailed Requirements:**

- `src/modules/memory/slot.ts`:
  - Exports `registerMemoryTool({ name, description, inputSchema, execute })`
  - Tools are collected into a registry during `register(api)` and registered with OpenClaw
- `src/modules/memory/identity.ts`:
  - Implements the trusted-identity capture per [docs/memory/implementation-spec.md § 8](../memory/implementation-spec.md)
  - On pre-tool-invoke for tools with names starting `memory_*`, captures `agentId`, `sessionKey`, `toolCallId` into a bounded map keyed by `toolCallId`
  - `getTrustedIdentity(toolCallId)`: returns captured context or null
- If identity missing in `execute`: fail closed

**Edge Cases & Error Handling:**

- Map size bounded at 1k entries; LRU eviction
- Missing hook support (M0-T2 fallback): identity must still be derivable from the wrapping pattern

**Technical Notes:**

- Memory tools call Kodi via `kodiClient.signedFetch` with the captured identity in headers

**Acceptance Criteria:**

- [ ] Registration API works
- [ ] Identity capture verified in unit tests

**Out of Scope:**

- Real memory tools (memory project)

---

## Issue M7-T2

**Title:** Ship `memory.ping` tool as slot smoke test

**Type:** Feature

**Priority:** Medium

**Depends on:** M7-T1

**Context & Why:**

A real tool that exercises the entire path (register → intercept → identity capture → HMAC → Kodi) gives the memory team confidence that plumbing works.

**Detailed Requirements:**

- Register `memory.ping` with empty input schema
- `execute()` calls `kodiClient.signedFetch('/api/openclaw/memory/ping', ...)` with captured identity in headers `x-kb-agent-id`, `x-kb-session-key`, `x-kb-tool-call-id`
- Returns `{ pong: true, echoed: <Kodi response> }`

**Acceptance Criteria:**

- [ ] Agent can call `memory.ping` and gets `pong: true`

**Out of Scope:**

- Anything else memory-related

---

## Issue M7-T3

**Title:** Kodi memory ping endpoint (stub)

**Type:** Feature

**Priority:** Medium

**Depends on:** None

**Context & Why:**

Kodi needs a live endpoint for `memory.ping` to hit so the smoke test works end-to-end before the memory team's real work lands.

**Detailed Requirements:**

- `POST /api/openclaw/memory/:tool` — generic route
- Auth: HMAC via `x-kb-*` headers, then resolve agent from `x-kb-agent-id`
- If `:tool === 'ping'`: return `{ pong: true, agent_id, org_id }` 200
- Else: return 501 Not Implemented with a clear message pointing to the memory project

**Edge Cases & Error Handling:**

- Missing trusted identity: 401
- Unknown tool: 501

**Acceptance Criteria:**

- [ ] `ping` returns the echo
- [ ] Other tools return 501

**Out of Scope:**

- Actual memory logic

---

## Issue M7-T4

**Title:** Write `MEMORY_CONTRACT.md` for the memory team

**Type:** Chore

**Priority:** Medium

**Depends on:** M7-T1

**Context & Why:**

The memory team should be able to attach tools with zero ambiguity. The contract doc is the spec they program against.

**Detailed Requirements:**

- `packages/openclaw-bridge/MEMORY_CONTRACT.md` covering:
  - How to call `registerMemoryTool`
  - Required tool naming convention (`memory_*`)
  - Input schema expectations
  - Trusted identity lifecycle (where it comes from, what to do if missing)
  - Kodi-side endpoint convention (`POST /api/openclaw/memory/:tool`)
  - HMAC auth contract (headers carried)
  - Testing approach
- Link this from the memory project's implementation spec

**Acceptance Criteria:**

- [ ] Doc merged
- [ ] Memory team has reviewed

**Out of Scope:**

- Memory logic

---

# Milestone 8 Issues

## Issue M8-T1

**Title:** Structured logging for the plugin

**Type:** Feature

**Priority:** Medium

**Depends on:** M2-T1

**Context & Why:**

Debuggable systems win. Structured JSON logs with correlation IDs make post-mortems tractable.

**Detailed Requirements:**

- Add a tiny logger in `packages/openclaw-bridge/src/log.ts`:
  - Methods: `info`, `warn`, `error`
  - Fields: `{ ts, level, module, msg, ...context }`
  - Correlation IDs: every inbound request gets a `req_id`; every outbound event carries its `idempotency_key` as correlation
- Use across all modules

**Acceptance Criteria:**

- [ ] Logs are JSON lines
- [ ] Correlation IDs present

**Out of Scope:**

- Log shipping

---

## Issue M8-T2

**Title:** Plugin metrics counters

**Type:** Feature

**Priority:** Low

**Depends on:** M8-T1

**Context & Why:**

Counters on event emission, retry, update attempts help us see fleet behavior.

**Detailed Requirements:**

- Emit periodic `heartbeat` with extra fields: `events_out_count`, `events_retry_count`, `tool_invocations_count`, `update_check_count`
- No external metrics system yet; Kodi can aggregate from the heartbeat stream

**Acceptance Criteria:**

- [ ] Counters increment in tests
- [ ] Heartbeat carries them

**Out of Scope:**

- Grafana dashboards

---

## Issue M8-T3

**Title:** Kodi read endpoint: per-instance health view

**Type:** Feature

**Priority:** Medium

**Depends on:** M3-T7

**Context & Why:**

Operators need a single endpoint that shows an instance's state.

**Detailed Requirements:**

- `GET /api/openclaw/instances/:id/health` — admin auth
- Returns:
  ```json
  {
    "instance_id": "...",
    "plugin_version": "...",
    "last_heartbeat_at": "...",
    "heartbeat_age_s": 12,
    "agent_count": 5,
    "recent_errors": [ /* last 10 error events */ ],
    "status": "healthy" | "stale" | "degraded"
  }
  ```

**Acceptance Criteria:**

- [ ] Endpoint works
- [ ] `stale` detected if heartbeat older than 2 intervals

**Out of Scope:**

- UI

---

## Issue M8-T4

**Title:** Plugin circuit breaker

**Type:** Feature

**Priority:** Medium

**Depends on:** M3-T3

**Context & Why:**

If Kodi is down for an extended period, aggressive retrying wastes CPU and log space. A circuit breaker gates outbound traffic.

**Detailed Requirements:**

- In `event-bus/emitter.ts`:
  - Trip breaker after 5 consecutive failures in 2 minutes
  - In open state: stop retrying, buffer to outbox only; emit `plugin.degraded` once
  - Half-open after 1 minute: send one probe; success closes, failure re-opens
  - On close: emit `plugin.recovered`

**Acceptance Criteria:**

- [ ] Breaker trips under simulated outage
- [ ] Recovers when Kodi returns

**Out of Scope:**

- Distributed state

---

## Issue M8-T5

**Title:** HMAC secret rotation flow

**Type:** Feature

**Priority:** Medium

**Depends on:** M3-T6

**Context & Why:**

If a secret is compromised, we must rotate without downtime.

**Detailed Requirements:**

- `POST /api/internal/instances/:id/rotate-hmac-secret`:
  - Generates a new 32-byte secret
  - Persists (encrypted) as the primary
  - Retains the old secret as `plugin_hmac_secret_previous_encrypted` for 10 minutes
  - POSTs `/plugins/kodi-bridge/admin/reload` to the plugin with the new secret
  - Plugin accepts both signatures during the grace window; after 10 minutes drops the old
- Verification middleware accepts either primary or previous secret during grace

**Acceptance Criteria:**

- [ ] Rotation works with no observable disruption
- [ ] Old secret rejected after grace

**Out of Scope:**

- Rotation UI

---

## Issue M8-T6

**Title:** Integration test harness

**Type:** Chore

**Priority:** Medium

**Depends on:** M2-T9

**Context & Why:**

A reliable CI harness for the plugin prevents regressions in the next 100 tickets.

**Detailed Requirements:**

- `docker-compose` setup: Postgres + Kodi API + OpenClaw gateway + the plugin
- Test scripts:
  - Provision instance → expect `plugin.started`
  - Provision agent → Composio mount ok
  - Tool call with `strict` → approval request emitted
  - Force update → success and rollback cases
- Wire into CI as a separate workflow (slower, runs on main + nightly)

**Acceptance Criteria:**

- [ ] CI job runs green
- [ ] Each scenario tested

**Out of Scope:**

- Performance benchmarking

---

## Issue M8-T7

**Title:** Runbook

**Type:** Chore

**Priority:** Medium

**Depends on:** M2-T9, M6-T5

**Context & Why:**

When an instance misbehaves at 2am, a clear runbook saves sleep.

**Detailed Requirements:**

- `docs/openclaw-bridge/runbook.md` with sections:
  - Smoke test (existing, expand)
  - Debugging a stale instance
  - Rolling back a bad plugin version
  - Rotating an HMAC secret
  - Re-provisioning a failed agent
  - Recovering from a halted update (`/opt/kodi-bridge/state/update-halted` present)

**Acceptance Criteria:**

- [ ] Doc merged

**Out of Scope:**

- PagerDuty hookup

---

## Summary

Nine milestones, sixty-five tickets. Milestone 0 is a feasibility spike that gates the rest. Milestones 4, 6, 7, and 8 can progress in parallel once 2 and 3 land. Milestone 5 depends on both 3 and 4.

Once the plan is approved, tickets should be uploaded to Linear under the project "Kodi-OpenClaw Bridge Plugin" with the milestone structure above.
