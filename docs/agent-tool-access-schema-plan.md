# Agent Tool Access Schema Plan

Last updated: 2026-04-01

## Purpose

This document is the concrete schema and migration deliverable for Phase 0 ticket `KOD-85`.

It translates the high-level Phase 0 decisions into a target database shape that Phase 1 can implement without reopening core data-model questions.

## Existing state

Kodi currently has two relevant integration models:

- [provider-installations.ts](/Users/noahmilberger/Documents/kodi/kodi/packages/db/src/schema/provider-installations.ts)
- [tool-connections.ts](/Users/noahmilberger/Documents/kodi/kodi/packages/db/src/schema/tool-connections.ts)

Those tables reflect two earlier assumptions:

- conference integrations like Zoom are org-level installs managed directly by Kodi
- work-tool connections are enum-based and org-scoped

Those assumptions do not fit Composio well because Composio centers on user-scoped connected accounts and request-scoped runtime sessions.

## Final Phase 0 decision

Do not try to evolve `provider_installations` and `tool_connections` into one shared abstraction.

Recommended split:

- keep `provider_installations` for conference-provider installs such as Zoom
- introduce a new dynamic tool-access model for Composio-backed work tools
- extend `tool_action_runs` so audit history remains continuous
- deprecate the current enum-based `tool_connections` path after the Composio-backed model is live

## Target tables

### `toolkit_connections`

Represents one connected account for one user in one org.

Suggested columns:

- `id`
- `org_id`
- `user_id`
- `toolkit_slug`
- `toolkit_name`
- `auth_config_id`
- `auth_config_source`
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

Suggested constraints and indexes:

- unique `connected_account_id`
- index `(org_id, user_id, toolkit_slug)`
- index `(org_id, connected_account_status)`
- optional unique composite `(org_id, user_id, toolkit_slug, connected_account_id)`

Notes:

- `toolkit_slug` must be freeform text, not an enum
- one user may have multiple accounts for the same toolkit
- one org may have many users connected to the same toolkit

### `toolkit_policies`

Represents org-level defaults and gates for whether a toolkit may be used.

Suggested columns:

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

Suggested constraints and indexes:

- unique `(org_id, toolkit_slug)`
- index `(org_id, enabled)`

Notes:

- keep policy separate from connection health
- policy should exist even when no users have connected yet

### `tool_session_runs`

Represents the request-scoped Composio session Kodi assembled for one request.

Suggested columns:

- `id`
- `org_id`
- `user_id`
- `composio_session_id`
- `source_type`
- `source_id`
- `enabled_toolkits`
- `connected_account_overrides`
- `manage_connections_in_chat`
- `workbench_enabled`
- `created_at`
- `expired_at`

Suggested constraints and indexes:

- unique `composio_session_id`
- index `(org_id, user_id, created_at)`
- index `(source_type, source_id)`

Phase 0 decision:

- design this table now
- implementation can land in Phase 1 or Phase 3 depending on engineering sequencing

If Phase 1 omits it, that should be a deliberate sequencing choice rather than a missing design.

## Existing table changes

### `tool_action_runs`

Keep the table and extend it.

Add:

- `actor_user_id`
- `approval_request_id`
- `toolkit_slug`
- `connected_account_id`
- `tool_session_run_id`
- `action_category`
- `idempotency_key`

Keep:

- `meeting_session_id`
- `work_item_id`
- request and response payloads
- run timestamps and status transitions

Why:

- this preserves historical continuity
- it keeps the audit trail model intact
- it avoids building a parallel execution history system

### `approval_requests`

No Phase 0 table split is needed, but Phase 1 and Phase 4 should assume approval rows may reference:

- tool action previews
- requested connected account identity
- target toolkit and action category

### `tool_connections`

Phase 0 decision:

- do not extend the enum-backed table for Composio-backed work-tool access
- leave it in place temporarily for compatibility
- mark it as the legacy path for org-level fixed-provider tool connections

Why:

- a fixed enum is the wrong long-term shape for Composio
- trying to retrofit user-scoped connected accounts into this table will create confusing nullability and migration risk
- replacing it gradually is safer than mutating it in place

## Migration plan

Recommended sequence:

1. Add new tables for `toolkit_connections` and `toolkit_policies`.
2. Optionally add `tool_session_runs` if runtime lineage is desired in Phase 1.
3. Extend `tool_action_runs` with actor, session, connected-account, and action-category fields.
4. Move new Composio-backed features onto the new tables only.
5. Leave Zoom and other conference installs on `provider_installations`.
6. Deprecate `tool_connections` once there are no callers left.

## Why this is production-safe

- keeps conference-provider auth separate from general work-tool auth
- models the real Composio connected-account structure
- supports multiple accounts per toolkit without hacks
- gives Kodi room to enforce org policy independently of connection health
- preserves full audit lineage for approvals and writes

## Questions closed by Phase 0

- Should `tool_connections` be evolved in place?
  - No. Introduce a new dynamic model and retire the old table later.
- Should `provider_installations` remain conference-specific?
  - Yes.
- Should org policy and user connections be represented separately?
  - Yes.
- Should runtime session lineage be designed now?
  - Yes.
