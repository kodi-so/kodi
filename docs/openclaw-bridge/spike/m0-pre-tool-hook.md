# M0-T2 Spike: Does the OpenClaw plugin SDK expose a pre-tool-invoke hook?

- **Ticket:** [KOD-351](https://linear.app/kodi-ai/issue/KOD-351)
- **Author:** sebi75 (Claude Code assisted)
- **Date:** 2026-04-24
- **OpenClaw version referenced:** `2026.4.23`
- **Verdict:** **YES.** `before_tool_call` is a first-class hook with the exact semantics the M5 autonomy module needs.

## Finding

The OpenClaw plugin SDK exposes `before_tool_call` (confirmed in `plugins/hooks.md` and `plugins/building-plugins.md`).

- Fires **before** any tool is invoked, including both plugin-registered tools and bundle-MCP-provided tools (once `kodi-bridge` lands, Composio tools will be plugin-registered, so this hook intercepts them natively).
- Hook handler receives the tool name, parameters, and context.
- Return shape supports three outcomes:
  - `{ block: true }` — stop the call, return a structured error to the agent.
  - `{ requireApproval: true }` — pause and route to the host's approval mechanism (this maps directly onto Kodi's existing approvals UI from the tool-access plan).
  - `{ block: false }` (or returning nothing) — proceed.

## Example (from `plugins/building-plugins.md`)

```typescript
register(api) {
  api.on("before_tool_call", async (event) => {
    if (event.tool.name === "my_tool") {
      return { requireApproval: true };
    }
    return { block: false };
  });
}
```

## Implication for M5

The M5 autonomy module design in `implementation-spec.md` can be implemented directly on this hook:

1. Lookup the acting agent's autonomy policy (cached per-agent, fetched from Kodi).
2. Classify the tool via the shared action-class utility (M5-T6).
3. Evaluate overrides → level rule → return `{ block }`, `{ requireApproval }`, or `{ block: false }`.
4. Emit the audit event (`tool.invoke.before` / `tool.denied` / `tool.approval_requested`) unconditionally for audit.

No wrapping-pattern fallback needed — that was the plan's "what if the hook doesn't exist" escape hatch, which we can drop.

## Acceptance criteria

- [x] Memo exists at `docs/openclaw-bridge/spike/m0-pre-tool-hook.md`.
- [x] Hook identified: `before_tool_call`.
- [x] Return-shape contract documented: `{ block }`, `{ requireApproval }`, default-proceed.
- [x] Plugin-registered AND bundle-MCP-provided tools are both covered (Composio will land as plugin-registered tools per the M0-T1 finding, so intercept coverage is automatic).
- [ ] Sign-off by project lead.

## Out of scope

- Designing the full autonomy policy model (M5-T1 / M5-T2).
- Building the plugin.
- Empirical PoC — not done. The doc and source evidence are unambiguous; if the team wants PoC confirmation, a half-day spike can produce one.
