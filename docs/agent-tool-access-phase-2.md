# Agent Tool Access via Composio

## Phase 2

Last updated: 2026-04-02

## Goal

Turn the Phase 1 foundation into a production-grade connection manager inside
Kodi settings.

Phase 2 is complete when users can:

- browse a clear, trustworthy tool catalog in Kodi
- understand what is connected, what needs attention, and what is only
  discoverable
- connect and disconnect accounts with confidence
- see enough identity and capability context to know what the agent will use
- let workspace owners manage default tool policy from the same settings area

This phase is intentionally user-facing. The agent runtime will consume these
connections later, but Phase 2 is where the product becomes understandable and
safe for humans.

## Ticket breakdown

### KOD-90 — Settings > Tools catalog and connection state

Ship the main connection manager page.

Scope:

- production-grade page hierarchy and responsive layout
- strong empty, loading, setup-required, and feature-gated states
- searchable catalog with filter controls
- clear separation between first-wave tools and broader catalog discovery
- better connection-state explanation on every card

Exit criteria:

- the page feels polished on desktop and mobile
- users can quickly tell what is ready, blocked, or risky
- connection actions are obvious and status feedback is immediate

### KOD-91 — Toolkit detail UX

Deepen trust for individual integrations.

Scope:

- requested scopes and plain-language capability summaries
- multiple connected-account visibility and identity selection
- reconnect and disconnect flows with stronger warnings
- last validation time, recent errors, and identity metadata

Exit criteria:

- users can inspect a toolkit in detail before trusting it
- users can choose the right identity when multiple accounts exist
- reconnect and disconnect consequences are clear

### KOD-92 — Org admin policy controls

Add workspace-level governance for tool access.

Scope:

- enable and disable toolkits by workspace
- set default read, draft, write, and admin behavior
- keep safe defaults for write approval and admin restrictions
- record who changed policy and when

Exit criteria:

- owners can define the workspace default stance on tool access
- members can understand whether a missing action is a connection issue or a
  policy issue
- policy remains separate from user-scoped connected accounts

## Recommended build order

1. `KOD-90`: make the catalog itself polished, legible, and dependable
2. `KOD-91`: deepen the per-tool detail and multi-identity UX
3. `KOD-92`: add owner controls once the user connection surface is stable

## What this Phase 2 branch covers

This branch completes `KOD-90`, `KOD-91`, and `KOD-92`.

Included:

- redesigned Tool Access settings page with stronger browse, filter, and status
  framing
- dedicated toolkit detail panel with identity metadata, scopes, health, and
  disconnect actions
- user-scoped preferred connected-account selection when multiple identities
  exist for one toolkit
- owner-only workspace policy controls for enablement, reads, drafts, write
  approval, and admin actions
- persisted toolkit account preference storage separate from workspace policy
- policy-aware catalog and detail messaging so members can tell whether a limit
  comes from missing auth or workspace governance

Still intentionally out of scope:

- runtime session assembly for OpenClaw
- approval execution plumbing in the agent runtime
- broad trigger automation beyond connection and catalog management

## Testing checklist for Phase 2

- feature enabled, Composio configured:
  the catalog loads, sections render, and detail state follows the selected
  toolkit
- feature enabled, multiple connected accounts for one toolkit:
  users can choose a preferred identity and return to automatic selection
- feature enabled, connected account present:
  scopes, identity info, validation timestamps, and disconnect actions render
  correctly
- feature enabled, failed or expired account present:
  attention state is obvious in both the catalog and detail panel
- owner user:
  workspace policy changes save and immediately affect the visible policy state
- non-owner user:
  policy is visible but not editable
- feature disabled:
  page becomes browse-only and explains why
- Composio env missing:
  setup state explains what is blocked

## Phase 3 handoff

Phase 3 should treat this page as the human source of truth for:

- which user identities are connected
- which toolkits are healthy
- which defaults the workspace expects

The runtime should still assemble request-scoped sessions instead of inheriting
this page's broad catalog directly.
