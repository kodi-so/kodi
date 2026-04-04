# Agent Tool Access via Composio

## Phase 4

Last updated: 2026-04-03

## Goal

Make external tool execution safe, reviewable, and reliable enough for real
customer data.

Phase 4 is complete when Kodi can:

- queue policy-gated writes behind explicit approval requests
- show a human-readable preview of what will happen before execution
- execute approved actions with full actor/session/account lineage
- keep connected accounts healthy through webhooks, revalidation, and retry
  behavior

Phase 3 made connected tools usable in chat. Phase 4 makes those tools
operationally trustworthy.

## Ticket breakdown

### KOD-96 — Write previews and approval flow

Scope:

- convert gated write and admin tool calls into approval requests
- store a normalized preview of the requested action
- expose approvals in Kodi so owners or members can review and decide them
- execute the original tool action only after approval

Exit criteria:

- write/admin actions no longer disappear behind vague model narration
- Kodi shows the exact action, target, and payload preview before execution
- approvals can be approved or rejected from a first-party Kodi page

### KOD-97 — Extended audit lineage

Scope:

- tie approval requests to tool session runs and tool action runs
- store actor, source type, source id, connected account, action category, and
  request payload
- preserve status transitions for pending, running, succeeded, failed, and
  cancelled states
- persist execution response payloads and external log ids

Exit criteria:

- every approval-backed action is traceable from request to decision to
  execution result
- tool audit records include enough context to debug failures or answer
  “who did what with which account?”

### KOD-98 — Reliability, revalidation, and retries

Scope:

- process Composio webhook connection updates
- revalidate stale or degraded connected accounts
- retry transient runtime failures safely
- expose reconnect or attention states in the Kodi UI
- add a batch revalidation route suitable for scheduled internal jobs

Exit criteria:

- stale accounts do not linger as silently healthy
- transient read/draft failures get a safe retry path
- operators have a server-side way to revalidate connections in bulk

## What this Phase 4 branch covers

This branch completes `KOD-96`, `KOD-97`, and `KOD-98`.

Included:

- enriched `approval_requests` data for:
  - tool session lineage
  - source type and source id
  - toolkit and connected-account identity
  - action and action category
  - normalized request payload
- extended `tool_action_runs` lineage for:
  - source type and source id
  - target text
  - attempt count
  - transition history
  - external log id
- approval queuing from the runtime for gated writes/admin actions
- a new Kodi approvals surface at `/approvals`
- approval execution through a one-tool, request-scoped Composio session
- connection attention handling when auth/runtime failures occur
- manual revalidation from the integration detail page
- internal batch revalidation route for scheduled jobs
- webhook processing for connected-account lifecycle updates
- safe retry behavior for transient direct runtime failures

## Runtime behavior in Phase 4

When a tool is policy-gated:

1. Kodi records a pending `tool_action_runs` row.
2. Kodi creates an `approval_requests` row with a preview payload.
3. Chat returns a deterministic approval response with a link to `/approvals`.
4. A user approves or rejects the action in Kodi.
5. If approved, Kodi creates a narrow execution session and runs the original
   tool action.
6. Kodi persists the final result and status transitions.

This means the model no longer gets to “explain away” gated writes. Kodi owns
the approval workflow directly.

## Reliability behavior in Phase 4

- webhook updates continue to sync Composio account status into
  `toolkit_connections`
- runtime auth failures mark the connection as needing attention
- stale/degraded connections can be revalidated:
  - per-connection from Kodi UI
  - in bulk via `POST /internal/tool-access/revalidate-connections`
- transient read/draft execution failures are retried automatically before
  giving up

## Internal revalidation route

`POST /internal/tool-access/revalidate-connections`

Auth:

- bearer token using `TOOL_ACCESS_INTERNAL_TOKEN`
- if unset, it falls back to `MEETING_INTERNAL_TOKEN` or
  `ZOOM_GATEWAY_INTERNAL_TOKEN`

Optional JSON body:

```json
{
  "orgId": "org_123",
  "userId": "user_123",
  "toolkitSlug": "gmail",
  "limit": 100,
  "staleAfterHours": 12,
  "forceAll": false
}
```

Use this route for scheduled health checks or operators’ internal tooling.

## Testing checklist for Phase 4

- approval flow:
  - ask the agent to create or send something through a connected integration
  - confirm chat returns an approval link instead of executing immediately
  - approve the request in `/approvals`
  - confirm the action runs and recent approvals show execution status
- rejection flow:
  - reject a pending approval
  - confirm the action is cancelled and never executes
- audit verification:
  - confirm `approval_requests` rows include source, toolkit, account, and
    request payload
  - confirm `tool_action_runs` rows include transition history and attempt count
- reliability:
  - disconnect or break a connected account and confirm Kodi surfaces attention
  - use the detail-page revalidate button and confirm the connection status
    refreshes
  - hit the internal batch revalidation route and confirm it reports changed
    statuses when stale accounts are found
- runtime retry:
  - trigger a transient read/draft failure and confirm Kodi retries before
    surfacing the error

## Production note

Phase 4 closes the major safety and reliability gaps for day-to-day use, but it
is not the launch phase. Phase 5 still matters for beta rollout, metrics,
runbooks, scale testing, and final security review.
