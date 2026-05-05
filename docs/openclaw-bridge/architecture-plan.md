# Kodi OpenClaw Bridge Architecture Plan

For build details, see [implementation-spec.md](./implementation-spec.md).

## Purpose

Every Kodi org is provisioned its own OpenClaw instance (an autonomous agent runtime). Today, Kodi only communicates with that instance by calling `POST /v1/chat/completions`, attaching Composio tools per request. This one-way, request-scoped model leaves the autonomous agent **blind to durable org context and without tools** whenever it operates outside a Kodi-initiated call, which is most of the time.

The `kodi-bridge` plugin is a single extensible plugin installed inside every OpenClaw instance that makes Composio tools, Kodi memory, autonomy policies, and bidirectional communication **persistently available to the agent**, regardless of who triggers the agent's work.

## Product Shape

Each org's OpenClaw instance hosts multiple agents (one per user in the org) and a single `kodi-bridge` plugin. The plugin is a runtime sidecar that:

- Mounts Composio as a persistent MCP server per user-agent, so every user has their own toolkit access scoped to their own identity and connections.
- Emits typed, versioned events from the agent back to Kodi (message sent, tool invoked, session compacted, approval required, plugin health) so Kodi is never out of the loop.
- Accepts inbound HTTP calls from Kodi to inject messages into sessions, push evidence to agents, update autonomy policies, trigger self-updates, and provision or deprovision agents as org membership changes.
- Enforces per-agent autonomy policies ranging from strict-approval to fully autonomous, with approval requests routed back to Kodi for human review when policy requires.
- Self-updates on a pull cadence from a Kodi-hosted bundle endpoint, with atomic swaps and automatic rollback on failure.
- Reserves a named module slot for memory tools so the Org Memory work can attach to the bridge without the team shipping a second plugin.

The plugin is the **one connection point** for all cross-cutting runtime concerns between Kodi and an OpenClaw instance.

## Design Principles

### One plugin, modular internally

A single `kodi-bridge` plugin owns every cross-cutting runtime concern. New features are added as modules inside the plugin, not as new plugins. This keeps the fleet homogeneous, simplifies self-update, and avoids the coordination cost of multiple plugins loaded in the same gateway.

### Injected, not published

The plugin is built in Kodi's monorepo, bundled in CI, uploaded to a Kodi-owned S3 bucket, and pulled onto each instance during cloud-init. Nothing is published to ClawHub or npm. Kodi is the trusted operator of every instance, so ClawHub's open-registry model and its signing story are unnecessary overhead.

### Pull-based self-update

Instances check for new plugin versions themselves, using their existing per-instance gateway token for authentication. This removes the need for Kodi to reach into each instance to update it and avoids the brittle surface of per-instance SSH or remote shell access.

### Persistent Composio, per user

The agent always has Composio available, without Kodi having to attach toolkits per request. Every user inside an org has their own agent with their own Composio session, so connections and usage are correctly attributed to the acting user rather than pooling under the org or a single account.

### Typed, versioned protocol in both directions

All events and commands use a versioned envelope with a known set of event kinds. Adding a new kind does not break existing listeners. Verbosity and subscription are configured from Kodi dynamically, so changing what the fleet emits does not require a plugin redeploy.

### Adjustable autonomy

Each agent runs under an autonomy level that ranges from always-ask to fully autonomous. The level, and any per-toolkit overrides, can be changed from Kodi at runtime. Every tool call emits an audit event regardless of autonomy level.

### Fail safe, recover fast

Network partitions, failed self-updates, missing Composio sessions, and plugin crashes are all recoverable. The plugin buffers outbound events to disk when Kodi is unreachable, rolls back failed self-updates, and reconciles its agent list against Kodi at startup.

## Current Foundations In The Codebase

### Instance provisioning

`apps/api/src/routers/instance/provisioning.ts` and `apps/api/src/routers/instance/cloud-init.ts` already provision EC2 instances, issue gateway tokens, write `openclaw.json`, and enable only the `/v1/chat/completions` endpoint. The bridge plan extends that cloud-init path to also drop the plugin bundle and configure it.

### Per-org OpenClaw URL + token

The `instances` table holds `orgId`, `hostname`, `instanceUrl`, and an encrypted `gatewayToken` per org. Kodi already resolves "which OpenClaw does this org talk to" via `apps/api/src/lib/openclaw/client.ts`. That same resolution powers the new inbound calls Kodi makes to the plugin.

### Request-scoped tool runtime

`apps/api/src/lib/tool-access-runtime.ts` builds OpenAI-format tool definitions per request and runs a tool-call loop against OpenClaw. The bridge plan does not remove this path; the user-chat flow continues to work unchanged. The plugin adds the missing autonomous path.

### Composio integration layer

`apps/api/src/lib/composio.ts` already wraps the Composio SDK, manages connected accounts, and enforces toolkit policy. The plan reuses this layer on the Kodi side when creating persistent Composio sessions at agent provisioning time. Composio credentials remain on the Kodi side; the plugin receives only MCP URLs.

### Approvals

`packages/db/src/schema/approvals.ts` and `apps/api/src/lib/tool-access-approvals.ts` already implement an approvals schema and flow. Autonomy enforcement in the plugin reuses this schema and flow rather than introducing a parallel one.

## Target Architecture

### 1. One OpenClaw instance per org, multiple agents inside

Each org has one provisioned OpenClaw instance. Inside it, the plugin manages N agents, one per user in the org. This matches OpenClaw's native agent-workspace model and preserves per-user identity for Composio, memory, audit, and approvals.

### 2. One plugin, a set of modules

The `kodi-bridge` plugin is a single package. Internally it is composed of modules that each register hooks, tools, HTTP routes, and gateway methods during `register(api)`:

- **bridge-core** — identity, config, HMAC, health, shared Kodi HTTP client
- **agent-manager** — provision and deprovision OpenClaw agents for users, reconcile with Kodi
- **composio** — create per-user Composio SDK sessions and register Composio actions as agent tools via `api.registerTool` (see M0-T1 memo; MCP-via-`openclaw mcp set` is the wrong surface for this use case)
- **event-bus** — outbound typed events to Kodi, subscription-based verbosity
- **inbound-api** — HTTP routes for Kodi to push commands into the instance
- **autonomy** — per-agent policy evaluation, approval routing
- **updater** — pull-based self-update loop
- **memory** — named slot for Org Memory tools (implements Gabe's `kodi-memory` contract as a module)

Adding a new feature is a new module, not a new plugin.

### 3. Injected bundle, versioned on S3

The plugin is bundled by CI into a single-file JS artifact plus its manifest, archived, and uploaded to a Kodi-owned S3 bucket keyed by version. A Kodi API endpoint mints short-lived signed URLs on request. Cloud-init fetches the latest version at provision time; the plugin's `updater` module checks periodically thereafter.

### 4. Typed event protocol with dynamic subscriptions

The plugin emits events to Kodi using a versioned envelope (`protocol: "kodi-bridge.v1"`), a catalog of event kinds, and a verbosity field. Kodi keeps per-instance subscription configuration that tells the plugin what to emit and how richly. Changing the subscription does not require a plugin redeploy.

### 5. Inbound HTTP from Kodi into the plugin

Kodi can reach the plugin at `POST {instanceUrl}/plugins/kodi-bridge/*` for commands such as provision an agent, inject a message into a session, update a policy, push external evidence, or trigger a self-update. Every inbound call is HMAC-signed and verified by the plugin.

### 6. Per-agent identity and Composio scoping

Every OpenClaw agent created by the plugin maps one-to-one to a Kodi user. Composio sessions are created with `composio.create(user_id=<kodi_user_id>)` so toolkit connections and actions are attributed to that specific user. The Composio Tool Router MCP is mounted into the agent's runtime; the agent always has Composio available without Kodi attaching tools per request.

### 7. Autonomy, adjustable at runtime

Each agent carries a policy with an autonomy level:

- `strict` — always ask for approval
- `normal` — auto-allow reads and drafts, ask for writes and admin actions (default)
- `lenient` — auto-allow reads, drafts, and writes; ask for admin
- `yolo` — auto-allow everything

Per-toolkit or per-action overrides refine these levels. Approvals flow back to Kodi, are surfaced in the existing approvals UI and schema, and the plugin blocks the tool call until Kodi responds. Every tool invocation is audited regardless of level.

### 8. Self-update with rollback

On startup and on a cron cadence, the plugin queries Kodi for the latest bundle version it should run. If newer, it downloads to a versioned directory, verifies the sha256, performs a health check, flips a symlink, restarts the gateway, and emits a success event. If any step fails, it rolls back by flipping the symlink back to the previous version.

### 9. Memory as a module, implementing the memory team's contract

The Org Memory project (see [docs/memory/](../memory/)) specifies a `kodi-memory` plugin with persistent tools, trusted identity from runtime hooks, per-deployment service tokens, and proactive recall. The bridge plan proposes that this plugin is replaced by a `memory` module inside `kodi-bridge` that preserves the same contract. This consolidation was a direct product requirement ("we should build one plugin, not multiple") and avoids running two plugins in the same gateway that need to share agent state, identity, HMAC secrets, and update lifecycles.

## How The Plugin And Kodi Split Responsibility

**Plugin owns**
- Agent lifecycle inside the OpenClaw instance
- Tool registration for external providers (Composio via `api.registerTool`, later others)
- Hook subscriptions and event emission
- Inbound HTTP surface from Kodi
- Autonomy evaluation at tool-invocation time
- Self-update mechanics
- Identity capture from runtime context
- Local persistence for outbound event buffering

**Kodi owns**
- Storage (Postgres, S3 for bundles, S3 for vault content)
- Org and user identity, auth, approvals, audit trail
- Composio credentials and session creation
- Subscription and policy configuration
- Plugin bundle publishing, versioning, rollout control
- Memory vault reads, writes, search, governance (Gabe's work)
- Business logic that decides what the agent should do and when

## Division Between This Plan And Adjacent Plans

- **Memory vault, manifests, indexes, workers, Memory UI** — owned by the Org Memory plan in [docs/memory/](../memory/). This plan delivers only the plugin-side module slot and the service-authenticated transport.
- **Kodi-side meeting forwarding** — unchanged for now. The plugin is the preferred ingress path for future meeting-driven runtime work but does not replace the existing `/v1/chat/completions` forwarding in this initiative.
- **Request-scoped user-chat tool runtime** (`tool-access-runtime.ts`) — unchanged in this initiative. A later consolidation of user chat and autonomous paths through the plugin is explicitly deferred.

## Delivery Shape

This work is built in nine milestones, each shippable and reviewable as a unit:

1. **Feasibility spike** — validate MCP runtime consumption, pre-tool-invoke hook, and programmatic agent creation before coding
2. **Data model and Kodi API foundations** — schema, S3 bucket, bundle endpoint
3. **Plugin skeleton and bundling pipeline** — minimal plugin loads on a real instance
4. **Dual communication protocol** — typed outbound events, inbound routes, subscriptions
5. **Multi-agent management and Composio per user** — agent lifecycle, per-user Composio SDK sessions, plugin-registered Composio tools
6. **Autonomy and policy enforcement** — levels, approval routing, audit
7. **Self-update** — pull loop, atomic swap, rollback
8. **Memory module foundation** — slot and stub, ready for the memory team
9. **Observability and hardening** — metrics, circuit breaker, secret rotation, runbook

Milestones 4, 5, 7, and 8 can progress in parallel once 3 is complete. Milestone 6 depends on both 4 and 5. Milestone 9 cuts across everything and is scheduled last.

## Risks And Mitigations

- ~~**MCP consumption**~~ — **Resolved by the M0-T1 spike.** `openclaw mcp set` does not feed the `/v1/chat/completions` path, but `api.registerTool` from the plugin does — and is a better fit than MCP for per-user Composio. See [`spike/m0-mcp.md`](./spike/m0-mcp.md).
- ~~**Pre-tool-invoke hook availability**~~ — **Resolved by the M0-T2 spike.** `before_tool_call` with `{ block, requireApproval }` is a first-class documented hook. See [`spike/m0-pre-tool-hook.md`](./spike/m0-pre-tool-hook.md).
- **Composio pricing at persistent-session-per-user scale** — requires a conversation with Composio before M5 lands. Budget for a session-count cap per plan if needed.
- **Gateway restart during in-flight work** — restarts interrupt active requests. Mitigated by draining before restart where the SDK supports it, running updates at low-traffic windows, and canary-ing new bundles before fleet-wide rollout.
- **Broken bundle deployed fleet-wide** — the single biggest operational risk. Mitigated by a canary instance that must report `plugin.started` healthy before the fleet is allowed to roll forward, plus automatic rollback on health-check failure post-swap.
- **Unification with Gabe's memory plan** — this plan supersedes the standalone `kodi-memory` plugin. Coordination with the memory team is needed before the `memory` module is implemented. Mitigated by preserving Gabe's contract exactly inside the module boundary.

## Summary

The `kodi-bridge` plugin turns each OpenClaw instance from a passive completions endpoint into an active, governed, multi-agent runtime that always has Composio, always has Kodi memory (once the memory team ships), always emits typed events back to Kodi, always accepts commands from Kodi, and self-updates without manual intervention. One plugin, many modules, bidirectional, extensible, and injected rather than published.
