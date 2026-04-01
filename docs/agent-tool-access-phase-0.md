# Agent Tool Access via Composio

## Phase 0

Last updated: 2026-04-01

## Goal

Finish the decisions that must be true before we build Composio-backed tool access in Kodi.

Phase 0 is complete when the team has:

- a locked v1 product contract
- a schema redesign plan that fits Composio's user-scoped account model
- an auth ownership and environment contract for the first-wave toolkits
- a clean handoff into implementation work in Phase 1

This phase is intentionally decision-heavy. We should not ship broad backend or UI work before these choices are made because the current Kodi integration model is still Zoom-specific and partially org-scoped.

## Composio terms

Composio uses a few terms that are worth locking down up front because they affect how we design Kodi:

- `toolkit`: an integration provider or app surface such as GitHub, Gmail, Slack, or Linear
- `tool`: an individual executable capability within a toolkit
- `connected account`: a user's authenticated account for a toolkit
- `session`: the runtime-scoped Composio context an agent uses to discover and execute tools

When this document says "tool access," we mean:

- Kodi users connect their accounts to Composio
- Kodi decides which connected accounts and toolkits are allowed in a given request
- the LLM gets access only through a Kodi-brokered runtime session

The important design point is that Composio can expose a very large catalog, but that does not mean Kodi should hand the whole catalog to every OpenClaw session by default.

## Why Phase 0 matters

Kodi already has useful primitives:

- org-scoped integrations surfaces in [apps/app/src/app/(app)/settings/integrations/page.tsx](</Users/noahmilberger/Documents/kodi/kodi/apps/app/src/app/(app)/settings/integrations/page.tsx>)
- external action tracking in [packages/db/src/schema/tool-connections.ts](/Users/noahmilberger/Documents/kodi/kodi/packages/db/src/schema/tool-connections.ts)
- approval records in [packages/db/src/schema/approvals.ts](/Users/noahmilberger/Documents/kodi/kodi/packages/db/src/schema/approvals.ts)
- provider installation records in [packages/db/src/schema/provider-installations.ts](/Users/noahmilberger/Documents/kodi/kodi/packages/db/src/schema/provider-installations.ts)

But the current model does not yet fit Composio cleanly:

- `tool_connections` is org-scoped and backed by a fixed enum
- `provider_installations` assumes Kodi stores provider tokens directly
- the integrations UI is still hard-coded around Zoom and placeholder entries
- API env validation in [apps/api/src/env.ts](/Users/noahmilberger/Documents/kodi/kodi/apps/api/src/env.ts) has no Composio contract yet

## Exit criteria

Phase 0 is done only when all of the following are true:

1. The v1 promise is explicit.
   Users, internal teammates, and design partners should all hear the same story about what "tool access" means in Kodi.
2. The first-wave toolkit shortlist is approved.
   We need a bounded launch surface.
3. The data model is designed.
   We need a concrete migration plan away from enum-based org-only tool connections.
4. The auth strategy is decided per toolkit.
   We need to know when we rely on Composio managed auth and when we bring our own OAuth app through custom auth configs.
5. The environment contract is documented.
   Dev, staging, and production need clear secrets, callback flows, and ownership.
6. Phase 1 inputs are unblocked.
   Backend implementation should be able to start without reopening product-shaping questions.

## Phase 0 scope

### In scope

- v1 product contract
- launch and beta boundaries
- first-wave and second-wave toolkit recommendations
- account ownership model
- policy model
- schema redesign plan
- auth ownership decisions
- environment variable contract
- rollout and support assumptions

### Out of scope

- building Composio API wrappers
- implementing OAuth flows
- shipping the new settings UX
- wiring OpenClaw to Composio sessions
- building approval UI for external writes

Those belong to later phases even if this document defines their inputs.

## Product contract

### User-facing promise

Kodi users can connect the work tools they already use, choose which account their agent should use, and control what kinds of actions the agent may take. Reads can be immediate. Writes are previewed and approved by default.

### What v1 is

V1 is governed work-tool access for SaaS and API-backed tools through Composio.

### What v1 is not

V1 is not arbitrary control of any local desktop app on a user's machine. We should keep a provider-agnostic abstraction so future MCP or local desktop connectors can plug in later, but we should not market or architect v1 as "full computer control."

### Access model

- connections are user-scoped
- policy is org-scoped
- execution is actor-scoped
- sessions are request-scoped

That means the user who initiates or approves work determines the identity Kodi should use, while the org decides whether that toolkit and action class are allowed.

### UI and runtime model

Kodi should use Composio in two distinct layers:

1. Catalog and connection management
   Users search integrations in Kodi, connect accounts in Kodi's UI flow, and manage their connected identities from Kodi settings.
2. Runtime execution
   Kodi creates a request-scoped Composio session for the actor and only enables the toolkits that are both connected and allowed for that request.

Recommended production stance:

- the UI may search across the broad Composio catalog
- the runtime must never expose the broad Composio catalog to OpenClaw by default
- Kodi should disable Composio's in-chat connection flow and keep account linking in Kodi's UI
- Kodi should disable Composio workbench by default

This matches Composio's documented model well:

- sessions can expose a broad dynamic catalog
- connections persist across sessions
- hosted auth links can be initiated outside the chat experience

For Kodi, that means Composio is primarily the connection and execution substrate, while Kodi remains the policy and user-experience layer.

### Default action policy

- `read`: allowed if the toolkit is enabled for the org and the actor has a healthy connected account
- `draft`: allowed inside Kodi without external side effects
- `write`: requires approval by default
- `admin`: disabled by default in v1 unless explicitly enabled for a narrow toolkit/action pair

## Catalog and support strategy

### Full catalog discoverability

Yes, Composio makes a large set of supported integrations available out of the box. Kodi should take advantage of that in the settings experience.

Recommended product behavior:

- users can search the Composio-backed integration catalog from Kodi
- users can connect supported integrations from that search flow
- Kodi stores normalized metadata and connection state locally for UX, policy, and auditability

Recommended runtime behavior:

- OpenClaw should not receive "everything Composio supports" by default
- Kodi should assemble an allowlisted session from the actor's connected accounts plus org policy
- only toolkits relevant to the request should be enabled

This distinction is critical for production readiness, security, and scale:

- it reduces prompt/tool noise for the agent
- it avoids accidental access to irrelevant or risky tools
- it keeps approval and audit boundaries understandable
- it makes performance and debugging much easier

### Support tiers

Kodi should separate searchable availability from official support level.

- `tier_1`: officially supported and tested in beta and launch
- `tier_2`: available behind admin enablement or experimental labeling
- `tier_3`: discoverable later if we decide to expose the long tail broadly

This gives us the best of both worlds:

- users get a broad "search and add integrations" experience
- Kodi still launches with a supportable, production-grade subset

## Recommended toolkit rollout

### Tier 1 / first wave

- Gmail
- Google Calendar
- Slack
- GitHub
- Linear
- Notion

These are high-value, understandable to users, and closely aligned with Kodi's meeting follow-through and work execution story.

### Tier 2 / second wave

- Jira
- Google Drive
- HubSpot
- Confluence
- Microsoft Outlook and Calendar

### Explicitly not in launch wave

- broad browser automation
- arbitrary native desktop apps
- self-hosted or highly customized enterprise tools unless required for a design partner

### Why not "everything out of the box" for runtime

Composio can make everything discoverable, but the recommended production design is still to scope the runtime aggressively:

- some orgs should not allow every toolkit
- some users will have no connected account for most toolkits
- approval and audit become harder to reason about when the agent can discover everything
- support quality drops sharply if the product implicitly promises every long-tail integration is equally production-ready

So the recommended design is:

- broad catalog search in settings
- explicit connection by the user
- org policy gate
- request-scoped runtime allowlist

## Auth ownership decisions

Composio supports both managed auth and custom auth configs. Their current docs recommend using your own developer app for OAuth2 in production because it improves control over scopes, rate limits, and branding.

Source references:

- https://docs.composio.dev/docs/configuring-sessions
- https://docs.composio.dev/docs/authenticating-tools
- https://docs.composio.dev/docs/auth-configuration/custom-auth-configs

### Recommended policy by toolkit

| Toolkit                 | Phase 0 decision                                                | Why                                                                    |
| ----------------------- | --------------------------------------------------------------- | ---------------------------------------------------------------------- |
| Gmail + Google Calendar | Use Kodi-owned Google OAuth app via Composio custom auth config | Shared Google quota is risky, and Google branding matters to end users |
| Slack                   | Use Kodi-owned Slack app via Composio custom auth config        | Branding, scope control, and future Slack-native workflows             |
| GitHub                  | Use Kodi-owned GitHub OAuth app via Composio custom auth config | Better scope control and fewer surprises for engineering users         |
| Linear                  | Start with Composio managed auth for beta, revisit if needed    | Lower implementation burden and lower brand sensitivity                |
| Notion                  | Start with Composio managed auth for beta, revisit if needed    | Similar reasoning to Linear                                            |
| Jira                    | Likely custom auth config before launch if included             | Enterprise subdomain and scope needs are common                        |

### Decision rules

Use Kodi-owned OAuth apps when any of the following are true:

- the provider is strategic to Kodi's core workflows
- the provider's consent screen trust matters a lot
- we need custom scopes beyond the vendor defaults
- shared Composio OAuth quota would create product risk

Use Composio managed auth only when:

- the toolkit is lower-risk for beta
- branding concerns are acceptable
- default scopes are sufficient
- we can tolerate migrating to custom auth later

### Connection flow decision

Kodi should manage connections in the app UI instead of relying on in-chat Composio connection prompts.

Recommended implementation:

- Kodi initiates Composio auth links from the settings experience
- runtime sessions use `manage_connections = false` so OpenClaw does not interrupt users with auth prompts during chat
- when a user asks for a task requiring an unconnected toolkit, Kodi should point them back to the integration flow or offer a controlled "Connect" UI action outside the tool-execution loop

This is a better fit for Kodi because it preserves a cleaner product UX and keeps approval and connection management in one place.

## Environment contract

Phase 0 should lock the variables Phase 1 will add to [apps/api/src/env.ts](/Users/noahmilberger/Documents/kodi/kodi/apps/api/src/env.ts).

### Core Composio variables

- `KODI_FEATURE_TOOL_ACCESS`
- `COMPOSIO_API_KEY`
- `COMPOSIO_WEBHOOK_SECRET`
- `COMPOSIO_BASE_URL` optional if the SDK already targets the correct default
- `COMPOSIO_MANAGE_CONNECTIONS_IN_CHAT` default `false`

### Redirect and callback variables

- `COMPOSIO_OAUTH_REDIRECT_URL`
- `COMPOSIO_AUTH_CALLBACK_URL`

If we white-label OAuth through our own domain, the callback path should live on Kodi's domain and forward to the Composio callback endpoint as recommended in Composio's custom auth docs.

### Custom auth config ids

These should be stored explicitly in env per environment rather than buried in code:

- `COMPOSIO_AUTH_CONFIG_GOOGLE`
- `COMPOSIO_AUTH_CONFIG_SLACK`
- `COMPOSIO_AUTH_CONFIG_GITHUB`
- `COMPOSIO_AUTH_CONFIG_LINEAR`
- `COMPOSIO_AUTH_CONFIG_NOTION`

If a toolkit uses managed auth only, the env value may remain unset.

### Optional per-tool provider credentials

Needed only for Kodi-owned OAuth apps:

- `GOOGLE_CLIENT_ID`
- `GOOGLE_CLIENT_SECRET`
- `SLACK_CLIENT_ID`
- `SLACK_CLIENT_SECRET`
- `GITHUB_CLIENT_ID`
- `GITHUB_CLIENT_SECRET`

Phase 0 should document these even if Phase 1 does not yet validate every one at startup.

## Schema redesign plan

### Current problems

The current schema assumes an org-level connection record:

- `tool_connections.tool` is a fixed enum
- one org can have only one record per tool in practice
- credential storage assumes Kodi may hold provider secrets directly

Composio's model is different:

- connected accounts belong to a user
- multiple connected accounts can exist for the same toolkit
- request-scoped sessions choose which connected account to use
- auth configs are reusable blueprints, not the connection itself

### Recommended model

Keep conference-provider installation data separate from work-tool access.

`provider_installations` should remain for products like Zoom where Kodi directly manages a conference integration.

For work-tool access, evolve toward these concepts:

### `toolkit_connections`

One row per user, org, and connected account.

Suggested fields:

- `id`
- `org_id`
- `user_id`
- `toolkit_slug`
- `toolkit_name`
- `auth_config_id`
- `auth_config_source` = `managed | custom`
- `connected_account_id`
- `connected_account_status`
- `connected_account_label`
- `external_user_id`
- `external_user_email`
- `scopes`
- `metadata`
- `last_validated_at`
- `last_error_at`
- `error_message`
- `created_at`
- `updated_at`

Suggested indexes:

- `(org_id, user_id, toolkit_slug)`
- `(connected_account_id)` unique
- `(org_id, connected_account_status)`

### `toolkit_policies`

Org-level policy rows for whether and how a toolkit may be used.

Suggested fields:

- `id`
- `org_id`
- `toolkit_slug`
- `enabled`
- `chat_reads_enabled`
- `meeting_reads_enabled`
- `drafts_enabled`
- `writes_require_approval`
- `admin_actions_enabled`
- `allowed_action_patterns`
- `created_by_user_id`
- `updated_by_user_id`
- `created_at`
- `updated_at`

### `tool_session_runs`

Request-scoped records for the temporary Composio session Kodi assembled.

Suggested fields:

- `id`
- `org_id`
- `user_id`
- `composio_session_id`
- `source_type` = `chat | meeting | workflow`
- `source_id`
- `enabled_toolkits`
- `connected_account_overrides`
- `workbench_enabled`
- `created_at`
- `expired_at`

This table is optional for Phase 1 implementation but should be designed now so we can preserve session lineage once runtime integration starts.

### `tool_action_runs`

Extend the existing table instead of replacing it outright.

Add:

- `actor_user_id`
- `approval_request_id`
- `toolkit_slug`
- `connected_account_id`
- `tool_session_run_id`
- `action_category`
- `idempotency_key`

Retain:

- meeting and work item linkage
- request and response payloads
- lifecycle timestamps

### Migration strategy

Phase 0 should decide the migration shape even if Phase 1 implements it.

Recommended path:

1. Keep `provider_installations` as-is for Zoom and future conference providers.
2. Add new dynamic work-tool tables rather than overloading the current enum model.
3. Migrate `tool_action_runs` to reference the new connection records.
4. Deprecate `tool_connections` once the Composio-backed path is live.

This is safer than trying to mutate the current enum-backed table into two incompatible jobs at once.

## Security decisions

- Kodi should not store third-party OAuth access tokens for Composio-backed toolkits unless a toolkit explicitly requires a hybrid design.
- Composio is the token system of record for work-tool access.
- Kodi stores only the metadata it needs for policy, UX, and auditability.
- every external write must preserve actor, payload intent, and approval linkage
- every request-scoped session must be created from an explicit allowlist of toolkits
- every request-scoped session should disable in-chat connection prompts by default
- Composio workbench should remain disabled by default in Kodi

## Deliverables by ticket

### KOD-84 — Define the v1 product contract and supported toolkit shortlist

Deliverables:

- this Phase 0 document
- alignment with the project-level Linear planning doc
- approved first-wave toolkit list
- explicit non-goals and product language
- launch and beta boundary decisions

Done when:

- team can explain the feature consistently
- design and engineering are working from the same bounded scope

### KOD-85 — Redesign Kodi tool connection schema for dynamic toolkits and user-scoped accounts

Deliverables:

- [docs/agent-tool-access-schema-plan.md](/Users/noahmilberger/Documents/kodi/kodi/docs/agent-tool-access-schema-plan.md)
- target schema concepts and field list
- migration strategy
- decision on whether to evolve or replace `tool_connections`
- required extensions to audit and approval lineage

Done when:

- Phase 1 can implement schema work without reopening core data-model questions

### KOD-86 — Decide auth ownership strategy and environment contract for core toolkits

Deliverables:

- [docs/agent-tool-access-auth-contract.md](/Users/noahmilberger/Documents/kodi/kodi/docs/agent-tool-access-auth-contract.md)
- auth ownership decision per first-wave toolkit
- env var contract for Composio and custom auth configs
- redirect and callback strategy
- initial secret management plan for dev, staging, and production

Done when:

- a teammate can set up a new environment without reverse-engineering hidden decisions

## Phase 1 handoff

Phase 1 can start once we have all of the following:

- the `ComposioService` abstraction shape
- the initial env contract
- the dynamic schema plan
- the first-wave toolkit list
- the auth-config strategy per toolkit

Recommended first implementation order:

1. add Composio env validation and feature flags
2. introduce new schema tables for toolkit connections and policy
3. implement searchable catalog and connection initiation in Kodi UI
4. persist connected-account metadata from auth callbacks
5. expose a normalized toolkit catalog API for the web app

## Open questions that must be closed during Phase 0

- Should Linear and Notion remain on Composio managed auth for launch, or should we standardize on Kodi-owned OAuth apps for all first-wave toolkits?
- Do we want a `tool_session_runs` table in Phase 1, or can that land with runtime integration in Phase 3?
- Do we need org-shared service accounts for any first-wave toolkit, or is personal-account-only the correct v1 stance?
- Which action categories, if any, qualify for trusted automation without approval in v1 beta?

## Final Phase 0 recommendations

- Use Composio as the connected-account system and execution substrate for user-linked SaaS tools.
- Let users search a broad Composio-backed catalog from Kodi settings.
- Keep official support tiering inside Kodi so launch quality remains high.
- Build UI-managed connection flows and disable in-chat connection prompts for runtime sessions.
- Never hand the full Composio catalog to OpenClaw by default.
- Create request-scoped, actor-scoped sessions with explicit allowlists.
- Keep approval, auditability, and policy enforcement owned by Kodi.

Phase 0 should leave these as explicit answers, not background assumptions.
