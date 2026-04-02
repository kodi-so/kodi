# Agent Tool Access via Composio

## Phase 3

Last updated: 2026-04-02

## Goal

Turn connected Composio accounts into real tool access inside Kodi chat.

Phase 3 is complete when Kodi can:

- assemble a request-scoped Composio session for the acting user
- decide which tools are directly executable versus gated by workspace policy
- expose only the relevant allowed tools to the model for a given chat turn
- execute returned tool calls through Composio and persist audit lineage

This phase is runtime-heavy. Phase 1 and Phase 2 made the connection manager
real for humans. Phase 3 is where the agent actually starts using those
connections.

## Ticket breakdown

### KOD-93 — Request-scoped Composio session broker

Scope:

- create one Composio session per Kodi agent request
- allowlist only connected and workspace-enabled toolkits
- bind preferred connected-account overrides per toolkit
- keep Composio workbench disabled
- persist session lineage in `tool_session_runs`

Exit criteria:

- every chat run gets its own scoped Composio session
- the runtime never inherits the whole catalog by default
- the selected identity per toolkit is explicit and auditable

### KOD-94 — OpenClaw chat runtime integration

Scope:

- wire Kodi chat to the scoped tool runtime
- search the session for tools relevant to the current user message
- pass OpenAI-style tools to OpenClaw
- execute tool calls in Kodi and feed results back to the model
- persist tool execution lineage in `tool_action_runs`

Exit criteria:

- a normal chat turn can use connected tools in dev
- tool calls stay scoped to the current request
- tool errors come back through the conversation instead of failing silently

### KOD-95 — Permission engine and action classification

Scope:

- classify tools into `read`, `draft`, `write`, and `admin`
- evaluate workspace policy plus connection state into:
  - `allowed`
  - `approval_required`
  - `denied`
- keep the classification provider-agnostic and freeform-toolkit-safe
- hide gated tools from the executable tool list while still telling the model
  why they are unavailable

Exit criteria:

- the runtime can machine-classify and gate tools before execution
- reads and drafts can execute immediately when policy allows them
- write and admin tools remain gated by approval policy by default

## What this Phase 3 branch covers

This branch completes the chat runtime path for `KOD-93`, `KOD-94`, and
`KOD-95`.

Included:

- `tool_session_runs` table for request-scoped session lineage
- extended `tool_action_runs` lineage for actor, toolkit, connected-account,
  session, category, and idempotency data
- request-scoped Composio session creation from the current user, org policy,
  and preferred connected accounts
- message-scoped tool search so the model only sees relevant allowed tools for
  the current request
- provider-agnostic tool classification and policy evaluation
- OpenClaw chat loop that can:
  - send tools
  - receive tool calls
  - execute through Composio
  - append tool responses
  - continue until final assistant output
- runtime prompt guidance that tells the model which matching actions are gated
  by approval or policy

## Runtime model

For each chat turn:

1. Kodi syncs the user’s persisted Composio connections.
2. Kodi resolves the preferred active account for each toolkit.
3. Kodi filters to workspace-enabled toolkits only.
4. Kodi creates a request-scoped Composio session for that actor.
5. Kodi searches the session for tools relevant to the current user message.
6. Kodi classifies and gates those tools before exposing them to OpenClaw.
7. Kodi executes returned tool calls itself and records audit lineage.

This preserves the main Phase 0 production decision:

- catalog breadth lives in settings
- runtime breadth is always narrowed per request

## Policy behavior in Phase 3

- `read`
  - executable in chat only when `chat_reads_enabled=true`
- `draft`
  - executable only when `drafts_enabled=true`
- `write`
  - executable only when `writes_require_approval=false`
  - otherwise surfaced to the model as gated context, not executable tools
- `admin`
  - executable only when `admin_actions_enabled=true` and
    `writes_require_approval=false`

This phase does not implement approval request creation or approval execution.
That stays in the later approval phase.

## Testing checklist for Phase 3

- feature enabled and Composio configured:
  - ask a read-heavy question against a connected toolkit and confirm the agent
    uses the tool successfully in chat
- multiple connected accounts for one toolkit:
  - set a preferred account in settings and confirm the agent uses that account
- workspace disables chat reads for a toolkit:
  - confirm the agent no longer gets executable read tools for that toolkit
- workspace leaves writes behind approval:
  - ask for a write action and confirm the agent explains the action is gated
    instead of executing it
- tool execution failure from Composio:
  - confirm the failure is returned to the model and the chat request still
    resolves
- database verification:
  - `tool_session_runs` row created per chat turn when tool access is enabled
  - `tool_action_runs` row created for each executed tool call

## Current boundary

The Phase 3 runtime broker supports multiple source types, including `meeting`,
but Kodi’s shipped agent execution path today is chat. Meeting-triggered tool
execution will reuse the same broker once that invocation path exists.
