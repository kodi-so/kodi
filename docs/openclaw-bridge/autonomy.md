# OpenClaw Bridge — Autonomy User Guide

How per-agent autonomy works in the `kodi-bridge` plugin: what each level means, how overrides compose, what the user sees during the approval flow, and how to change a policy until a UI exists.

This doc is for admins running Kodi instances. It assumes you've already followed the install steps in [implementation-spec.md](./implementation-spec.md) and have at least one OpenClaw agent provisioned.

---

## Levels in one table

Every tool a Composio agent can call is classified into one of four **action classes** based on its name signature (verb-only — see `@kodi/shared/action-class`):

- **read** — `GET`, `LIST`, `FETCH`, `SEARCH`, `DESCRIBE`, etc.
- **draft** — `DRAFT`, `PREVIEW`, `PREPARE`, `SUMMARIZE`, etc.
- **write** — `SEND`, `CREATE`, `UPDATE`, `DELETE`, `MOVE`, `MERGE`, etc.
- **admin** — anything containing `ADMIN`, `SCIM`, `PERMISSION`, `ROLE`, `INSTALL`, `WEBHOOK`, `TOKEN`, `SECRET`, `INTEGRATION`, `DELETE_USER`, `MANAGE_*`.

A name that doesn't match any verb falls back to `write` for policy purposes (conservative).

The agent's autonomy **level** says what to do for each class:

| Level | read | draft | write | admin |
|---|---|---|---|---|
| `strict` | ask | ask | ask | ask |
| `normal` (default) | allow | allow | ask | ask |
| `lenient` | allow | allow | allow | ask |
| `yolo` | allow | allow | allow | allow |

`allow` runs the tool. `ask` queues the call for human approval (see [Approval flow](#approval-flow)). `deny` (only reachable via overrides) blocks the call entirely with a structured error.

If no `agent_autonomy_policies` row exists for an agent, the plugin treats it as `normal`.

---

## Overrides: per-tool exceptions

`overrides` is a JSON object keyed by tool name (or glob), with values from `'allow' | 'ask' | 'deny'`. Most-specific match wins; falls through to the level rule when nothing matches.

### Match rules

- **Exact match** beats every glob. `"github.merge_pr"` is the highest-specificity match for that tool.
- **Trailing-`*` glob** matches any tool starting with the prefix. Longer prefix beats shorter.
- **Bare `*`** matches everything (lowest specificity — useful as a kill-switch).

### Examples

```jsonc
// Lenient agent except: never let it post to Slack without asking, and
// straight-up deny merge_pr.
{
  "autonomy_level": "lenient",
  "overrides": {
    "slack.*": "ask",
    "github.merge_pr": "deny"
  }
}
```

```jsonc
// Strict agent that's allowed to read freely (overrides loosen, not just tighten).
{
  "autonomy_level": "strict",
  "overrides": {
    "gmail.list_messages": "allow",
    "gmail.fetch_message": "allow"
  }
}
```

```jsonc
// Yolo with one safety net.
{
  "autonomy_level": "yolo",
  "overrides": {
    "*": "ask"
  }
}
// Equivalent to `strict` (ask everywhere) since `*` matches every tool
// at lowest specificity — added here as an illustration; in practice
// you'd just set autonomy_level=strict.
```

### Tool name format

Composio-registered tools have the form `composio__<openclaw_agent_id>__<toolkit>__<action>`, but the plugin's interceptor matches against the **whole** tool name string. For overrides aimed at a toolkit family, write `composio__*__gmail__*` — or, if you're operating across all agents in an org with a uniform suffix, the more readable `gmail.*` pattern works against the inferred slug. (The plugin compares strings; whichever pattern you use, it must exactly prefix the tool name string the SDK passes in.)

---

## Approval flow

When a tool call hits `ask`, the agent's turn doesn't block. Instead:

1. **Plugin** generates a `request_id` (UUID), serializes the call args, and writes a row to its **durable approval queue** (a JSONL file under `<stateDir>/kodi-bridge/approvals.jsonl`). The queue survives plugin restarts, gateway restarts, and self-update cycles.
2. **Plugin** emits `tool.approval_requested` to Kodi.
3. **Plugin** returns `block: true` to the SDK with a "queued for approval" message — the agent surfaces something like *"I've asked for approval to do X; I'll continue once you respond"* and ends the turn cleanly. **There is no in-memory await holding the gateway open.**
4. **Kodi** ingests the event. Its dispatcher creates an `approvalRequests` row with `subjectType: 'plugin_tool_call'` so it appears alongside other approvals in the existing UI.
5. **User** clicks Approve or Deny in the Kodi approvals UI.
6. **Kodi** signs and POSTs `/plugins/kodi-bridge/approvals/<request_id>/resolve` with `{ approved: bool, reason?: string }`.
7. **Plugin** loads the persisted row, then:
    - **If approved**: runs the tool (replays the original call against Composio), captures the result.
    - **If denied**: skips execution; the optional `reason` becomes part of the user-facing message.
8. **Plugin** injects a follow-up message into the original session via `runtime.subagent.run({ sessionKey, message, deliver: true })`. The agent picks up, processes the result, and replies in-channel.
9. **Plugin** emits `tool.approval_resolved` (audit) and, when the deferred re-execute happened, `tool.invoke.after` with `duration_ms` + `outcome`.

The user sees both the original "I'm asking for approval" message *and* the agent's follow-up in the same transcript. Plugin restarts at any point in step 1–7 don't lose anything — the JSONL log replays on startup.

### Failure modes

| Situation | What happens |
|---|---|
| User decides after the queue's expiry sweep marked the entry `expired` | Plugin returns 410 Gone. Kodi marks the approval row `expired` in its DB. No agent message. |
| Agent session is gone when the plugin tries to inject the follow-up | Plugin emits `tool.approval_resolved` with `approved: false, reason: 'orphaned'`; queue entry marked `orphaned`; ops can grep `plugin.degraded` events for these. |
| Tool execution fails after approval (Composio OAuth expired, rate limit, etc.) | Plugin still injects a follow-up message describing the failure ("Approval granted but the action could not run: …") — the user is never left wondering what happened. |
| Duplicate Kodi → plugin resolve calls | Idempotent on `request_id`. Second call returns 200 with `status: 'already_resolved'` and no side effects. |

### Timeout behavior

Per-entry **expiry** lives on the queue, not on a timer in the agent's turn:

| Level | Approval expiry (default) |
|---|---|
| `strict` | 24h |
| `normal` | 24h |
| `lenient` | 24h |

A 60-second sweep timer in the plugin checks for past-expiry pending entries, marks them `expired`, and emits `tool.approval_timeout` to Kodi. Default expiry is uniform across levels right now (the spec's earlier per-level timeout knobs were tied to the in-memory polling design, which we replaced with the deferred-approval pattern in M5-T8/T9). If you need a tighter window, change `approvalTtlMs` when constructing the interceptor (see `packages/openclaw-bridge/src/modules/autonomy/interceptor.ts`).

---

## Audit

Every tool invocation produces ≥1 row in `plugin_event_log`. The full emission table:

| Decision path | Events emitted |
|---|---|
| `allow` | `tool.invoke.before` → `tool.invoke.after` |
| `deny` | `tool.denied` |
| `ask` → approve + tool succeeds | `tool.approval_requested` → `tool.approval_resolved` → `tool.invoke.after` |
| `ask` → approve + tool fails | `tool.approval_requested` → `tool.approval_resolved` → `tool.invoke.after` (`outcome: error`) |
| `ask` → deny | `tool.approval_requested` → `tool.approval_resolved` |
| `ask` → expire | `tool.approval_requested` → `tool.approval_timeout` |

`tool.invoke.after` carries `duration_ms`, `outcome` (`ok` | `error`), and an optional `error` string. It ships at `full` verbosity by default — if subscriptions get tuned down later, keep this kind at `full` so the audit trail stays useful.

### Reading the tool log

```sh
curl -i \
  -H "Cookie: <your better-auth session cookie>" \
  "https://kodi.example.com/api/openclaw/agents/<agent_id>/tool-log?limit=50"
```

Optional query params:

- `since` — ISO datetime; only rows with `received_at >= since`.
- `limit` — default 100, max 500.
- `kinds` — comma-separated; whitelisted to the six tool.* kinds above.

Auth: better-auth session + any-role membership in the agent's org. The endpoint is read-only and exposes nothing the agent didn't already see in the transcript.

---

## Changing a policy via API

Until the admin UI lands, use the HTTP endpoint directly. Auth: better-auth session + role=`owner` in the agent's org.

```sh
curl -X PUT \
  -H "Content-Type: application/json" \
  -H "Cookie: <your better-auth session cookie>" \
  https://kodi.example.com/api/openclaw/agents/<agent_id>/autonomy \
  -d '{
    "autonomy_level": "lenient",
    "overrides": {
      "slack.*": "ask",
      "github.merge_pr": "deny"
    }
  }'
```

### Body shape

```ts
{
  autonomy_level: 'strict' | 'normal' | 'lenient' | 'yolo',
  overrides?: Record<string, 'allow' | 'ask' | 'deny'> | null
}
```

Validation rules:

- `autonomy_level` must be exactly one of the four values.
- `overrides` keys must be non-empty strings (any tool-name glob; the plugin matches them at hook time).
- `overrides` values must be exactly `'allow'`, `'ask'`, or `'deny'`.
- Sending `overrides: null` (or omitting it) wipes all overrides; sending `overrides: {}` (empty) is treated the same.

### Response shape

```jsonc
{
  "agent_id": "...",
  "autonomy_level": "lenient",
  "overrides": { "slack.*": "ask", "github.merge_pr": "deny" },
  "updated_at": "2026-05-04T07:00:00Z",
  "reload_pushed": true,           // false if the plugin push failed
  "reload_reason": null            // populated when reload_pushed=false
}
```

### How fast does the change take effect?

The PUT does two things: persist to `agent_autonomy_policies`, then signed-POST `/plugins/kodi-bridge/agents/update-policy` to the running instance. The plugin's loader cache invalidates on receipt — typical propagation time is sub-second.

If the push fails (instance not running, network blip, HTTP error), the response carries `reload_pushed: false` plus a `reload_reason`. The persisted row is the source of truth and the plugin will pick the change up on its next 15-minute TTL refresh — so the worst case is a 15-minute delay, never silent failure.

### Status codes

| Code | Meaning |
|---|---|
| 200 | OK; row upserted; response body as above. |
| 400 | Body failed schema validation (unknown level, bad override action, empty key, etc.). |
| 401 | No session — log in first. |
| 403 | You're either not a member of the agent's org or you're not an `owner`. |
| 404 | Agent not found. |

---

## Reading the cached policy

```sh
curl -H "Authorization: Bearer <instance gateway_token>" \
  https://kodi.example.com/api/openclaw/agents/<agent_id>/autonomy
```

Bearer auth here, not session — this endpoint is the plugin's own cache-miss path (KOD-389). The response is the same shape the PUT returns minus the `reload_pushed` / `reload_reason` fields.

If no row exists, the response is the default: `{ agent_id, autonomy_level: 'normal', overrides: null }`.

---

## Recipes

### "Read-only auditor agent for compliance"

```jsonc
{ "autonomy_level": "strict" }
```

Every call asks. The auditor approves whatever they're comfortable with; everything else is denied by inaction (expires after 24h).

### "Standard agent — humans review writes, reads are free"

```jsonc
{ "autonomy_level": "normal" }
```

This is the default if you set no row at all. Reads / drafts auto-allow; writes / admin queue for approval.

### "Trusted agent — no approval friction except for destructive admin work"

```jsonc
{ "autonomy_level": "lenient" }
```

### "Yolo agent for known-safe automations"

```jsonc
{ "autonomy_level": "yolo" }
```

You're saying "I trust this agent's policy stack to never call something it shouldn't." Make sure the agent's tool surface is narrow (the `toolkit_allowlist` lives upstream in the org's tool-access config — see `docs/tool-access/`).

### "Lenient but never let it touch production GitHub"

```jsonc
{
  "autonomy_level": "lenient",
  "overrides": {
    "github.delete_*": "deny",
    "github.merge_pr": "ask",
    "github.create_release": "ask"
  }
}
```

### "Per-tool toggle — the agent CAN do X but ask first"

```jsonc
{
  "autonomy_level": "lenient",
  "overrides": { "gmail.send_email": "ask" }
}
```

---

## Cross-references

- **Implementation spec:** [implementation-spec.md § 5 (Autonomy)](./implementation-spec.md)
- **Runbook (queue debugging):** [runbook.md](./runbook.md)
- **Spike memos:**
  - [spike/m0-pre-tool-hook.md](./spike/m0-pre-tool-hook.md) — `before_tool_call` hook contract
  - [spike/m5-session-injection.md](./spike/m5-session-injection.md) — resume-via-injected-message primitive
- **Source:**
  - `packages/openclaw-bridge/src/modules/autonomy/` — policy loader, queue, resume, interceptor, audit
  - `packages/shared/src/action-class.ts` — verb-based classifier
  - `apps/api/src/lib/openclaw/autonomy.ts` — Kodi-side mutation helper
  - `apps/api/src/routes/openclaw-agents.ts` — GET/PUT autonomy + GET tool-log routes
