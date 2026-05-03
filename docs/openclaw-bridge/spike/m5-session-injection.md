# M5-T9 Spike: Resuming an idle agent session via injected message

- **Ticket:** [KOD-416](https://linear.app/kodi-ai/issue/KOD-416)
- **Author:** sebi75 (Claude Code assisted)
- **Date:** 2026-05-03
- **OpenClaw version inspected:** `2026.4.23`
- **Verdict:** **`runtime.subagent.run({ sessionKey, message, deliver })` is the right primitive.** It writes a new turn into a named session and starts the agent processing it; with `deliver: true` the agent's response is delivered to the same channel the session is bound to.

## TL;DR

| Spike question | Answer |
|---|---|
| Does the injected message trigger an immediate agent turn? | **Yes.** `subagent.run` enqueues + starts the run on the gateway and returns a `runId`. |
| Can we attribute the message to "system" vs. user? | **Effectively yes.** The injected `message` is plain text — we prefix it with a marker like `[Kodi · Approval granted]` so the user can see it's from the bridge plugin, not a peer. There is no formal "from" sender on the wire (it's the user-side input slot for the session). |
| Does it work for an idle session (no active turn)? | **Yes.** Idle is the common case for KOD-416 — by the time the user approves hours later, the session has long since returned. `subagent.run` accepts the message and starts a fresh turn. |
| Does it persist in the session transcript visible to the user? | **Yes.** The injected message + the resulting agent turn are written into the same session store the chat UI reads. |

## API

```ts
type SubagentRunParams = {
  sessionKey: string;
  message: string;
  provider?: string;     // omit → agent's configured default
  model?: string;        // omit → agent's configured default
  extraSystemPrompt?: string;
  lane?: string;
  deliver?: boolean;     // true → response goes to the channel; false → silent
  idempotencyKey?: string;
}

type SubagentRunResult = { runId: string }
```

Available as `api.runtime.subagent.run` (`PluginRuntime.subagent`).

## Behavior under the M5-T9 use case

1. **Approval lands hours later.** The plugin process may have restarted any number of times. The original turn is long gone; calling back into the original promise is impossible.
2. **`subagent.run` is the resume primitive.** We pass `sessionKey` (we stored it on the `PendingApproval` row at enqueue time), a composed message describing the approval outcome, and `deliver: true`.
3. **Agent picks up.** The agent sees a new user-side message in the transcript that says, e.g., `"[Kodi · Approval granted] Action gmail__send_email ran successfully. Result: { id: 'msg_abc' }"`. It responds in-channel ("Done — I sent the email to a@b.com.") and the user sees both messages.

## Failure modes

- **Session no longer exists** (agent deprovisioned mid-wait): `subagent.run` rejects. Orphan path — mark queue entry `'orphaned'`, emit `tool.approval_orphan` (or fold into `tool.approval_resolved` with a status field; design call at impl time).
- **Mid-turn session**: per the docs `subagent.run` queues additional turns; verify by integration test once a real instance is reachable. Defensive code path: same as success — let the runtime handle queueing.
- **Rate-limit / transient error**: retry with exponential backoff (250ms, 500ms, 1s) up to 3 attempts; on final failure, treat as orphan.

## Why not `runtime.system.enqueueSystemEvent`?

`enqueueSystemEvent` is a generic event-bus push (heartbeat-wakes, infra signals). It doesn't write to the session transcript and doesn't trigger an agent turn — wrong primitive for "make the agent process this message and respond to the user."

## Why not direct session-store writes?

`runtime.agent.session.{loadSessionStore, saveSessionStore}` would let us mutate the transcript directly, but doing so wouldn't trigger an agent turn — the user would just see a system message hanging in the log with no follow-up. The `subagent.run` path triggers the actual response cycle.

## Acceptance criteria for the feature

- [x] Spike memo (this file)
- [ ] Approve a pending action after a plugin restart, observe the result message appears in the agent session
- [ ] Deny a pending action, observe the denial message appears
- [ ] Orphan path tested (deprovision the agent before resolving)
- [ ] Result truncation works for large tool outputs

The remaining four AC's are integration concerns and live with the implementation, not this memo.
