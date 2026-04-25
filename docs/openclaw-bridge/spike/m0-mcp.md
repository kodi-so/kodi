# M0-T1 Spike: Can the OpenClaw main runtime expose MCP/agent tools to Kodi-initiated chat turns?

- **Ticket:** [KOD-350](https://linear.app/kodi-ai/issue/KOD-350)
- **Author:** sebi75 (Claude Code assisted)
- **Date:** 2026-04-24
- **OpenClaw version tested:** `2026.4.23` (stable, latest at time of test)
- **Verdict:** **YES — achievable.** The embedded Pi agent that serves `/v1/chat/completions` does expose plugin-provided tools. The original plan's specific mechanism (`openclaw mcp set kodi-composio:<agentId>`) is **the wrong knob**, but the plugin SDK's `api.registerTool` does exactly what the plan wants, and `before_tool_call` gives us the autonomy gate.

## TL;DR for the team

The `kodi-bridge` plugin should:

1. Register Composio tools directly via `api.registerTool(...)` — one registration per toolkit action, with the execute callback forwarding to the Composio SDK session for the acting user.
2. Use the `before_tool_call` hook for autonomy enforcement (`{ block }`, `{ requireApproval }`, or proceed).
3. Drop `openclaw mcp set` from the plan entirely. That command writes to OpenClaw's *CLI-backend injection* surface, which is a separate code path that does not serve `/v1/chat/completions`.

This is a **better design than the original plan**: no per-user subprocess spawns, no stdio pipes per user, no MCP client version churn, full control over arg validation, logging, and autonomy gating. The rest of the M4 plan (per-user Composio session creation, session rotation on reconnect, org-membership wiring) is unchanged.

## How OpenClaw actually exposes tools to the agent

There are two MCP/tool surfaces in OpenClaw. The plan conflated them; they are unrelated code paths.

### Surface A — top-level `mcp.servers` (what `openclaw mcp set` writes)

- Config path: `~/.openclaw/openclaw.json` → `mcp.servers.<name>`.
- Consumed only by **CLI-backend subprocesses** (Claude Code CLI, Codex CLI, Gemini CLI) — and only when a backend plugin registration sets `bundleMcp: true` and declares a `bundleMcpMode` (`"claude-config-file"` / `"codex-config-overrides"` / `"gemini-system-settings"`).
- At agent-turn time, OpenClaw's `prepare.runtime` writes `mcp.servers` into the CLI's native MCP config file / args, and the CLI binary loads MCP for that subprocess.
- **Does not reach the built-in OpenAI-compat path.** Verified empirically (see below).

Quoted verbatim from `plugin-sdk/src/plugins/cli-backend.types.d.ts`:

```ts
export type CliBundleMcpMode =
  | "claude-config-file"
  | "codex-config-overrides"
  | "gemini-system-settings";

/**
 * Whether OpenClaw should inject bundle MCP config for this backend.
 *
 * Keep this opt-in. Only backends that explicitly consume OpenClaw's bundle
 * MCP bridge should enable it.
 */
bundleMcp?: boolean;
bundleMcpMode?: CliBundleMcpMode;
```

### Surface B — the embedded Pi agent's tool catalog (what `/v1/chat/completions` actually uses)

The in-process embedded Pi agent runs every `/v1/chat/completions` turn. Its tool catalog comes from three sources, merged at turn-prep time:

1. **Core built-ins** (exec, browser, web_search, file I/O, image generation, …).
2. **Plugin-registered tools** — plugins call `api.registerTool(...)` during their `register(api)` entry and the core merges them into the catalog.
3. **Bundle MCP** — MCP servers declared by installed plugin bundles or project-local `.mcp.json` files. The doc says verbatim (`plugins/bundles.md`):

    > *"Enabled bundles can contribute MCP server config. OpenClaw merges bundle MCP config into the effective embedded Pi settings as `mcpServers`, launches stdio servers or connects to HTTP endpoints, and registers tools with sanitized names like `serverName__toolName`. The agent runtime accesses them during embedded Pi turns through the selected tool profile."*

Static source confirmation of the embedded Pi path — `/v1/chat/completions` → bundle MCP loader:

```
openai-http-*.js       (the /v1/chat/completions HTTP handler)
  → agent-command-*.js
  → attempt-execution.runtime-*.js         (calls runEmbeddedPiAgent, cleanupBundleMcpOnRunEnd)
  → pi-embedded-*.js                        (imports pi-bundle-mcp-runtime)
  → pi-bundle-mcp-runtime-*.js              (loadEmbeddedPiMcpConfig, materializeBundleMcpToolsForRun)
```

So bundle MCP **is** consumed on the `/v1/chat/completions` path. Plugin-registered tools are also consumed.

### Why `openclaw mcp set` looks like it should work but doesn't

Top-level `mcp.servers` and bundle-mcp are separate fields with different consumers. `openclaw mcp set` writes to the former. The plan assumed they were the same.

## Plugin-registered tools — the recommended mechanism

Canonical plugin shape from the docs (`plugins/building-plugins.md`):

```typescript
import { definePluginEntry } from "openclaw/plugin-sdk/plugin-entry";
import { Type } from "@sinclair/typebox";

export default definePluginEntry({
  id: "kodi-bridge",
  name: "Kodi Bridge",
  description: "Composio tools, dual-comm, autonomy, memory",
  register(api) {
    api.registerTool({
      name: "composio__gmail_send",
      description: "Send a gmail message via the acting user's Composio session",
      parameters: Type.Object({
        to: Type.String(),
        subject: Type.String(),
        body: Type.String(),
      }),
      async execute(toolCallId, params) {
        // resolve acting user from session context; look up their Composio session
        // in-process; call composio.tools.execute('gmail_send', params) with user_id
        return { content: [{ type: "text", text: "ok" }] };
      },
    });

    api.on("before_tool_call", async (event) => {
      if (event.tool.name.startsWith("composio__")) {
        const policy = getAutonomyPolicyForCurrentAgent();
        if (policy === "strict") return { requireApproval: true };
        if (policy === "deny_writes" && isWrite(event.tool.name)) return { block: true };
      }
      return { block: false };
    });
  },
});
```

Properties worth noting:

- `api.registerTool` supports `{ optional: true }` for tools that only activate when the agent's config opts them in (`tools.allow: ["..."]`), and the default is "required / always available subject to tool policy." We'll register Composio tools with the default behavior so they're always in the loadout.
- Parameters are TypeBox schemas (same library already used elsewhere in OpenClaw).
- Per-agent scoping happens via the existing `agents.list[].tools.profile` / `tools.allow` / `tools.deny` config — no new mechanism needed. We can filter which Composio toolkits each agent can see by generating the tool names around the user's toolkit allowlist at plugin-registration time.

## Test artifacts

What the empirical test actually showed and what it did not:

- Registered an echo MCP via `openclaw mcp set echo '{"command":"npx","args":["-y","@modelcontextprotocol/server-everything","stdio"]}'`.
- Enabled `gateway.http.endpoints.chatCompletions.enabled = true`, started the gateway in verbose mode.
- Hit `POST /v1/chat/completions`. Observed:
  - Gateway never spawned the MCP server. `ps aux | grep server-everything` returned nothing.
  - Log grep for `mcp|echo|@modelcontextprotocol|server-everything` showed only my CLI invocations, never a runtime attachment.
  - The 500 response error traced to "no OpenAI API key configured" — the request reached the LLM-call step, confirming tools would have been built if any were to be built.
- This empirically confirms that `openclaw mcp set` does not feed the `/v1/chat/completions` path.
- The positive case (plugin `api.registerTool` does reach the agent) is verified via the source call chain above and the documented behavior — we did not build a PoC plugin in this spike because the cost of building one is nontrivial and the source evidence is unambiguous. If the team wants an empirical PoC before committing, a ~1-day spike can produce one.

## Cleanup

Gateway stopped, `echo` MCP `openclaw mcp unset`ed, chat endpoint config reverted. Local sandbox is in its prior state.

## Recommendations downstream

These are the plan-edit instructions; executed in the same PR that updates this memo.

- `architecture-plan.md` — replace the "`openclaw mcp set`-per-agent" narrative with the plugin-registered tools narrative. Keep the bidirectional event protocol, autonomy model, self-update, and module decomposition as designed.
- `implementation-spec.md` — update Module 3 (`composio`) to describe `api.registerTool` and per-user session dispatch inside the tool's execute closure; remove `openclaw mcp set` examples.
- Linear: **M4-T3 (KOD-382)** retitled from "Implement `composio` module: per-agent MCP mount" to "Implement `composio` module: per-agent tool registration"; body rewritten to reflect `api.registerTool`. **M4-T7 (KOD-386)** "session rotation" semantics change from "re-call `openclaw mcp set`" to "re-register the affected tools (or refresh the in-process Composio client)." All other M4 tickets unchanged.
- **M0-T2 (KOD-351)** is answered yes by the docs: `before_tool_call` supports `{ block }` and `{ requireApproval }`. Can close without an empirical spike unless the team wants PoC confirmation.
- **M0-T3 (KOD-352)** — programmatic agent lifecycle — still open and still needs a spike.

## Acceptance criteria

- [x] Memo exists at `docs/openclaw-bridge/spike/m0-mcp.md` with findings.
- [x] Memo answers: does the main runtime consume MCP-provided tools? **Yes — through plugin-registered tools (`api.registerTool`) and bundle MCP, both of which reach the embedded Pi agent that serves `/v1/chat/completions`.**
- [x] The `openclaw mcp set` → MCP tools in loadout assumption is explicitly refuted; the correct mechanism is documented.
- [x] Downstream plan edits specified.
- [ ] Plan / spec / M4 Linear ticket edits landed in the same PR (pending).
- [ ] Memo sign-off by project lead.
