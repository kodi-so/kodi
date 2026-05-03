# OpenClaw Bridge — Runbook

Operational reference for the `kodi-bridge` plugin: where data lives,
how to inspect it, and what to do when things go wrong.

## Approval queue debugging (KOD-415)

The plugin's autonomy module persists pending tool-call approvals to
disk so they survive plugin restarts. When a user takes hours or days
to approve an action, the request must still be there when they
finally click the button.

### Location

```
<stateDir>/kodi-bridge/approvals.jsonl
```

`<stateDir>` is whatever `runtime.state.resolveStateDir()` returns from
the OpenClaw plugin SDK — typically `~/.openclaw/state/` on the host.

### Format

JSON-Lines append-only log. Two record kinds:

```jsonc
{"type":"enqueue","approval":{"request_id":"...","agent_id":"...","session_key":"...","tool_name":"gmail__send_email","args_json":"{\"to\":\"a@b.com\"}","created_at":"2026-05-03T10:00:00Z","expires_at":"2026-05-03T11:00:00Z","status":"pending"}}
{"type":"resolve","request_id":"...","status":"approved","resolved_at":"2026-05-03T10:30:00Z","resolution_reason":"user clicked yes"}
```

On startup the plugin replays the log into an in-memory cache.
Last-write-wins: the latest record per `request_id` is the truth.

### Statuses

| Status | Meaning |
|---|---|
| `pending` | Awaiting user decision |
| `approved` | Resolved — user said yes; M5-T9 will inject a resume message |
| `denied` | Resolved — user said no |
| `expired` | Sweep timer flipped this; user didn't decide before `expires_at` |
| `orphaned` | Resolved — agent was deprovisioned before user decided |

### Inspecting

```sh
# Count pending approvals (in-flight tool calls awaiting decision)
grep '"type":"enqueue"' approvals.jsonl | jq -s 'length'

# Show the latest record per request_id (effective state)
jq -c 'select(.type == "enqueue") | .approval' approvals.jsonl | \
  jq -s 'group_by(.request_id) | map(last)'

# Find a specific request
grep '<request_id>' approvals.jsonl
```

### Sweeping

The plugin runs an internal sweep every 60s that marks pending entries
whose `expires_at` has passed as `expired` and emits
`tool.approval_timeout` to Kodi. No manual intervention is needed.

### Recovery

| Symptom | Action |
|---|---|
| File missing | Plugin starts fresh on next register; no harm |
| File unreadable / not-a-file | Plugin renames it to `approvals.jsonl.corrupt-<ts>`, starts fresh, emits `plugin.degraded` |
| Single corrupt line | Skipped on replay with a warn; rest of the file is still valid |
| Want to manually clear pending | Stop plugin → move file aside → restart plugin |

### Storage choice

JSONL was chosen over SQLite because the plugin is bundled with esbuild
as a single `.js` file and `better-sqlite3` is a native module — its
prebuilt binaries would have to be packaged outside the bundle and
match the deploy target's OS/arch. The spec explicitly allows the
JSONL fallback. Approval volume is low (typically a handful of pending
entries even on a busy org) so file size stays small.

---

## Smoke test: plugin bootstrap (KOD-370)

*(stub — populated when KOD-370's smoke test is finalized)*

---

## Plugin update / rollback (KOD-403)

*(stub — populated when M6 ships)*
