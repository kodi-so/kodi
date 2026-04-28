# Kodi Memory Implementation Spec

This document translates [architecture-plan.md](./architecture-plan.md) into a build plan.

## Purpose

Kodi should maintain scoped markdown vaults that act as durable memory for organizations and org members.

When this work is complete, Kodi should be able to:

- maintain shared org memory for each org
- maintain member memory for each org member
- route shared work to an org agent and private work to the relevant member agent inside the org's OpenClaw deployment
- give every OpenClaw agent persistent access to the Kodi memory scopes it is allowed to use
- decide what deserves durable memory
- organize memory into useful directory structures
- update, rename, move, split, merge, and delete memory as needed
- answer questions by retrieving from memory instead of re-reading all raw evidence
- expose memory natively inside the app

## Implementation Decisions

The following decisions are part of this plan:

- vault files should live in Cloudflare R2 across all Railway environments, accessed through its S3-compatible API
- development, staging, and production should use separate buckets or prefixes while sharing the same storage behavior
- vault metadata should live in Postgres
- memory is scoped as `org` or `member`
- member memory is scoped to one org member, not to a global user identity
- OpenClaw should run one deployment per org with multiple agents inside that deployment
- memory tools should be persistently available through a `memory` module inside the required native `kodi-bridge` plugin
- memory updates should be autonomous
- obsolete memory should leave active memory instead of being archived
- users should correct memory by asking Kodi to update it, not by editing markdown directly
- `memory.search` should use Postgres full-text search over markdown content, maintained on every file write
- memory workers should run on a queue, serialized per memory scope, with an idempotency key of `(evidence_source, evidence_id, evidence_version, scope_type, scope_id)`

## System Overview

The implementation has six parts:

1. Raw evidence inputs
2. Scoped vault storage and metadata
3. OpenClaw agent registry
4. Memory maintenance engine
5. Persistent retrieval and runtime tools
6. Native Memory UI

## 1. Raw Evidence Inputs

Memory should be updated from durable product signals, including:

- meetings and transcripts
- meeting artifacts and work items
- app chat conversations
- dashboard assistant conversations
- Slack conversations and threads from connected integrations
- activity and integration state
- explicit user requests to update memory
- OpenClaw memory update proposals

This layer remains the source material for memory updates. It is not memory itself.

## 2. Scoped Vault Storage And Metadata

### Storage model

Each org should have one org vault and one member vault per org member.

Recommended logical paths:

- `memory/<orgId>/org/`
- `memory/<orgId>/members/<orgMemberId>/`

All Kodi environments run on Railway and should use the same Cloudflare R2 storage model, isolated by environment-specific buckets or prefixes.

The storage abstraction should support:

- list directory
- read file
- write file
- move path
- delete path
- create directory
- stat path
- search content

### Metadata tables

Markdown is the memory surface. Postgres metadata exists to make scoped vaults, path navigation, search, and runtime access manageable.

#### `memory_scope_type`

Enum values:

- `org`
- `member`

#### `memory_vaults`

One row per memory scope.

Suggested fields:

- `id`
- `org_id`
- `scope_type` (`org` or `member`)
- `org_member_id` nullable for org vaults, required for member vaults
- `root_path`
- `manifest_path`
- `storage_backend`
- `created_at`
- `updated_at`

Suggested constraints:

- unique org vault per `org_id`
- unique member vault per `(org_id, org_member_id)`

#### `memory_paths`

Tracks files and directories currently present in a vault.

Suggested fields:

- `id`
- `vault_id`
- `path`
- `path_type` (`file` or `directory`)
- `parent_path`
- `title`
- `is_manifest`
- `is_index`
- `content_search_vector` for markdown files
- `last_updated_at`
- `created_at`
- `updated_at`

`memory_paths` should mirror the current vault structure. When a file or directory is deleted, its row should be removed as part of the same operation.

#### `openclaw_agents`

Maps OpenClaw agent ids to Kodi identity scopes.

Suggested fields:

- `id`
- `org_id`
- `org_member_id` nullable for org agents, required for member agents
- `agent_type` (`org` or `member`)
- `openclaw_agent_id`
- `display_name`
- `status`
- `created_at`
- `updated_at`

Suggested constraints:

- one org agent per org
- one member agent per org member
- unique `openclaw_agent_id` per org

Kodi should use this table to resolve which memory scopes an OpenClaw agent may access.

## 3. Vault Conventions

### Root manifest

Every vault should include `MEMORY.md`.

It should explain:

- what scope the vault represents
- how the vault is organized
- what major directories exist
- what files are important entry points
- how Kodi should add, update, move, rename, and delete memory
- any scope-specific vocabulary that matters for path resolution

Suggested sections:

- `# Kodi Memory`
- `## Scope`
- `## How this vault is organized`
- `## Important entry points`
- `## Directory guide`
- `## Structural rules`
- `## Update rules`

### Directory indexes

Important directories should include compact local index files such as:

- `Projects/PROJECTS.md`
- `Customers/CUSTOMERS.md`
- `Processes/PROCESSES.md`
- `Current State/CURRENT-STATE.md`
- `Preferences/PREFERENCES.md`
- `Responsibilities/RESPONSIBILITIES.md`
- `Current Work/CURRENT-WORK.md`

Each index should describe:

- what belongs in the directory
- what files exist there
- what each file is for
- any naming or structural conventions

### Memory files

Kodi should keep files concise and modular.

File rules:

- one file should answer one primary question
- lead with the current summary
- keep sections stable enough to update repeatedly
- prefer updating an existing file over creating a near-duplicate
- remove outdated information instead of letting files bloat
- link related files when that helps navigation
- keep org-wide facts out of member memory unless they are only relevant to that member
- keep personal preferences and private working context out of org memory

Kodi should not force one shared template across all vaults. Different files need different section layouts. The important rule is that each file should keep a stable shape over time so Kodi can update it cleanly.

Soft size guidance:

- target under 600-1000 words for most files
- split files once they become crowded or multi-purpose
- keep index files shorter than the directories they summarize

## 4. OpenClaw Agent Identity

Kodi should provision one OpenClaw deployment per org and register multiple agents inside it.

Required agents:

- org agent for shared org-level work
- member agent for each org member

### Routing model

Kodi should keep four concepts separate:

- actor identity: who initiated the interaction
- conversation visibility: who can see the response
- agent scope: org agent or member agent
- memory scope: org memory, member memory, or both

Default routing:

- private web app chat routes to the actor's member agent
- Slack DMs route to the actor's member agent
- private user-scoped threads route to the actor's member agent
- public Slack channels route to the org agent
- shared web app chats or shared project threads route to the org agent
- org-level background jobs route to the org agent
- meetings route to the org agent unless Kodi has a clearly private member-scoped follow-up

Default memory access:

- member agent can access that member's memory and org memory
- org agent can access org memory
- org agent should not use member memory in shared responses

Kodi may keep actor identity on org-agent requests for audit, permissions, attribution, and update proposals.

Kodi should call OpenClaw with the target agent id for the current actor and workflow.

Example model values:

- `openclaw/org`
- `openclaw/member_<orgMemberId>`

The exact agent id format can differ, but it must be stable and resolvable through `openclaw_agents`.

## 5. Evidence-To-Memory Flow

### Trigger model

The main memory update path should be event-driven.

Typical triggers:

- meeting completion
- meaningful meeting transcript or state updates
- app chat changes
- dashboard assistant changes
- Slack conversation changes
- work item changes
- integration sync events
- explicit user requests
- OpenClaw memory update proposals

When an event arrives, Kodi should trigger a worker immediately. The worker then decides whether memory should change.

### Memory-worthiness evaluation

Before writing to a vault, the worker should decide:

- is this durable or temporary
- is this likely to matter again
- does this change current state
- does this change next steps or ownership
- does this supersede existing memory
- does this belong in org memory, member memory, or both
- is this best represented as an update to an existing file

Possible outcomes:

- ignore
- update existing org memory
- update existing member memory
- create new org memory
- create new member memory
- delete obsolete memory
- trigger structural maintenance

### Scope resolution

Kodi should choose memory scope before choosing a file path.

Use org memory for:

- shared project state
- customer context
- company processes
- decisions that affect the org
- shared next steps and ownership
- information other members should rely on

Use member memory for:

- user preferences
- personal working style
- private responsibilities
- individual current work
- private commitments
- context that should follow the member across channels inside the org

Use both scopes when a fact has a shared component and a personal component.

### Path resolution

If memory should change, Kodi should determine:

- which vault owns the update
- what directory this belongs in
- whether an existing file already owns the topic
- whether a directory index should also change
- whether `MEMORY.md` also needs updating

Path resolution should use:

- the target vault's `MEMORY.md`
- local index files
- targeted search
- `memory_paths`

### Update execution

For a content update, Kodi should:

1. Load the target vault manifest.
2. Load the target file.
3. Load only the minimum related context needed.
4. Apply a concise revision.
5. Preserve useful stable structure.
6. Update `memory_paths` metadata and search vector.
7. Update indexes or `MEMORY.md` if the change affects navigation.

## 6. Memory Maintenance Engine

The maintenance engine keeps scoped vaults useful over time.

It should have three flows.

### `memory-process-evidence`

This is the main event-driven worker.

Its job is to:

- inspect new evidence
- decide whether it changes durable memory
- choose org scope, member scope, or both
- update memory only when the change is worth persisting

### `memory-refresh-currentness`

This is a scheduled maintenance pass.

Its job is to:

- revisit files that may no longer reflect reality
- refresh summaries, next steps, or ownership when newer evidence supports it
- keep important org and member memory current

If Kodi has enough information to correct a file, it should update it instead of merely labeling it.

### `memory-maintain-structure`

This runs when structural work is needed, either reactively or on a slower cadence.

Its job is to:

- split oversized files
- reorganize crowded directories
- rename or move paths when the current structure no longer fits
- merge overlapping memory areas
- rebuild indexes and `MEMORY.md` after structural changes

### Internal update plan

Before writing, the worker should build a small in-memory plan describing:

- affected vaults
- affected paths
- operation kind
- required file reads
- whether manifest or index repair is needed

This plan is transient, internal to the worker, and not user-facing.

## 7. Structural Rules

Kodi should be able to:

- create directories
- create subdirectories
- create files
- rename files
- rename directories
- move files
- move directories
- split one file into several
- merge several files into one
- delete obsolete memory

Structural rules:

- repair `MEMORY.md` and any affected indexes as part of the same operation
- keep `memory_paths` in sync with the actual vault structure
- keep org and member vaults structurally independent
- prefer evolving existing structure over creating parallel overlapping areas

## 8. Bridge-Hosted Memory Runtime Tools

Kodi and OpenClaw should use explicit memory tools instead of direct filesystem crawling.

Persistent memory access should be implemented as a `memory` module inside the required native `kodi-bridge` plugin described in [docs/openclaw-bridge/](../openclaw-bridge/).

The memory module should be installed and enabled as part of each org's `kodi-bridge` runtime. It should expose agent tools while delegating all durable memory operations to Kodi's authenticated Memory API.

The bridge-hosted memory module must not read or write R2, Postgres, or vault files directly.

### Runtime configuration

The memory runtime should rely on the bridge configuration and transport. The memory-specific requirements are:

- Kodi Memory API base URL available to the bridge runtime
- authenticated bridge-to-Kodi requests
- fail-closed behavior enabled

### Trusted identity flow

The memory module should derive trusted identity from OpenClaw runtime context.

For tool calls:

1. Register the bridge hook used for memory-tool interception.
2. When a memory tool is invoked, capture trusted `agentId`, `sessionKey`, and `toolCallId`.
3. Store that context in a bounded in-memory map keyed by `toolCallId`.
4. In the tool handler, look up the captured context by `toolCallId`.
5. If no trusted context exists, fail closed.
6. Send the trusted context to Kodi through the bridge's authenticated request path.
7. Kodi resolves the authenticated bridge instance and `agentId` through `openclaw_agents` and exposes only allowed memory scopes.

The model must not be allowed to provide `agentId`, `orgId`, `orgMemberId`, or scope as trusted tool parameters.

### Scope access

Default scope access:

- org agent can access org memory
- member agent can access its member memory and org memory

### Explicit tools

The bridge memory contract should expose tools that cover:

- vault manifests
- directory indexes
- search
- direct path reads
- related-file reads
- recent changes
- update proposals
- create, rename, move, and delete proposals

The exact tool names should follow the bridge memory contract so the memory docs and bridge docs stay aligned.

OpenClaw agents should decide what memory to retrieve and may iterate when they need more detail.

Default retrieval flow for an agent:

1. Read the relevant `MEMORY.md` entry points.
2. Inspect directory index files when they help narrow the search.
3. Run targeted search in the allowed scopes.
4. Read a small set of target files.
5. Expand further only if needed.

The system should avoid reading whole vaults by default.

OpenClaw should propose durable memory changes. Kodi should execute accepted changes through the memory maintenance engine.

## 9. Native Memory UI

The Memory UI should be one continuous vault-browser experience with scope switching.

### Scope switcher

Users should be able to switch between:

- org memory
- their member memory

Admins may later inspect member memory according to product policy, but the first build should optimize for the current user's member memory plus shared org memory.

### Root view

The default Memory Home should show the root of the selected vault, similar to browsing a repo:

- directories
- files
- last edited times

### Directory view

When a user opens a directory, the same surface should show:

- the directory summary from its index
- files and subdirectories
- last edited times

### File view

When a user opens a file, the same surface should show:

- rendered markdown
- related links when available
- last edited time

### Memory chat panel

The Memory surface should include a chat panel tied to the current scope and path.

Users should be able to:

- ask Kodi questions about memory
- tell Kodi that something is wrong
- ask Kodi to update a file or directory
- ask Kodi to reorganize memory when the structure no longer fits

## 10. Debugging And Logging

Keep this lightweight.

Useful logs:

- failed memory updates
- failed structural operations
- failed bridge memory-module calls
- agent-to-scope resolution failures
- worker crashes
- enough scope, path, and operation context to debug what failed

This is for debugging, not a full observability program.

## 11. Testing Strategy

### Unit tests

Cover:

- manifest parsing
- index parsing
- scope resolution
- path resolution
- memory-worthiness evaluation
- content update planning
- structural operation planning
- agent-to-scope resolution

### Integration tests

Cover:

- org vault bootstrap
- member vault bootstrap
- evidence ingestion into scoped memory updates
- multi-file update flows
- structural reorganization flows
- retrieval through `MEMORY.md`, indexes, and `memory_paths`
- bridge-hosted memory tool calls
- UI loading of live vault structure

### Scenario tests

Create end-to-end scenarios for several org shapes, such as:

- product roadmap org
- client services org
- operations-heavy org

Each scenario should include multiple members so member memory and org memory can be tested together.

## 12. Build Plan

This work should be built in complete vertical phases.

### Phase 1: Scoped Vault Foundations

Build to completion:

- storage abstraction
- org vault creation
- member vault creation
- `MEMORY.md`
- directory indexes
- `memory_vaults`
- `memory_paths`
- file operations
- manifest and index parsing
- read/list/search APIs

Outcome:

Kodi can host and navigate real scoped vaults.

### Phase 2: Agent Identity And Persistent Memory Access

Build to completion:

- OpenClaw agent registry
- org agent registration
- member agent registration
- runtime routing by org member
- `kodi-bridge` memory-module integration
- bridge-hosted memory tool surface
- authenticated bridge-to-Kodi memory access and agent-to-scope resolution
- fail-closed identity validation

Outcome:

Every OpenClaw agent can access the Kodi memory scopes it is allowed to use.

### Phase 3: Event-Driven Memory Updates

Build to completion:

- evidence ingestion hooks
- memory-worthiness evaluation
- scope resolution
- path resolution
- content update execution
- metadata synchronization
- chat-driven correction handling
- OpenClaw memory update proposal handling
- event-driven worker execution

Outcome:

Kodi can update org and member memory from real activity and user requests.

### Phase 4: Structural Maintenance

Build to completion:

- create/move/rename/delete operations
- split and merge operations
- manifest repair
- index repair
- structure-maintenance worker

Outcome:

Kodi can evolve the shape of each scoped vault safely.

### Phase 5: Native Memory UI

Build to completion:

- scope switcher
- root vault browser
- directory navigation
- rendered file view
- last edited timestamps
- memory chat panel

Outcome:

Users can inspect and correct org memory and their member memory inside Kodi.

### Phase 6: Runtime Integration And Scheduled Upkeep

Build to completion:

- layered retrieval heuristics
- memory-backed answering patterns
- scheduled currentness refresh
- next-step synthesis across related files
- final full-system scenarios

Outcome:

Kodi and OpenClaw operate directly against maintained org and member memory.

## 13. Recommended Codebase Areas

### Database

- add memory schema in `packages/db`
- add OpenClaw agent registry in `packages/db`

### API and services

- add vault storage abstraction in `apps/api`
- add memory services in `apps/api/src/lib/memory`
- add memory router in `apps/api/src/routers`
- add authenticated memory endpoints for the bridge-hosted memory module

### Runtime integration

- extend OpenClaw client and adjacent runtime modules to route by agent id
- extend assistant runtime tooling to use layered memory retrieval
- integrate with `kodi-bridge` provisioning and runtime routing for memory access

### App UI

- add `apps/app/src/app/(app)/memory`

## Summary

This implementation should produce a complete memory system built around:

- shared org markdown vaults
- per-member markdown vaults
- `MEMORY.md` and directory indexes
- lightweight metadata in `memory_vaults` and `memory_paths`
- an OpenClaw agent registry
- a bridge-hosted `memory` module inside `kodi-bridge`
- bridge-hosted memory tools for OpenClaw agents
- event-driven selective updates
- structural maintenance
- a native vault-browser UI
- runtime integration with Kodi and OpenClaw

The result should be a memory layer that Kodi can maintain as durable context for every org and every member agent.
