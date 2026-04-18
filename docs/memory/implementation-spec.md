# Org Memory Implementation Spec

This document translates [architecture-plan.md](./architecture-plan.md) into a build plan.

## Purpose

Kodi should maintain a per-org markdown vault that acts as its long-term organizational memory.

When this work is complete, Kodi should be able to:

- maintain a memory vault for each org
- decide what deserves durable memory
- organize memory into a useful directory structure for that org
- update, rename, move, split, merge, and delete memory as needed
- keep memory concise and current
- answer questions by navigating the vault instead of re-reading all raw evidence
- expose memory natively inside the app

## Implementation Decisions

The following decisions are part of this plan:

- production vault files should live in S3-compatible object storage
- local development should use the same storage interface backed by local disk
- vault metadata should live in Postgres
- memory updates should be autonomous
- obsolete memory should leave active memory instead of being archived
- users should correct memory by asking Kodi to update it, not by editing markdown directly
- `memory.search` should be Postgres full-text search over markdown content, maintained on every file write
- memory workers should run on a queue, serialized per org, with an idempotency key of `(evidence_source, evidence_id, evidence_version)`

## System Overview

The implementation has five parts:

1. Raw evidence inputs
2. Vault storage and metadata
3. Memory maintenance engine
4. Retrieval and runtime tools
5. Native Memory UI

## 1. Raw Evidence Inputs

Memory should be updated from durable product signals, including:

- meetings and transcripts
- meeting artifacts and work items
- app chat conversations
- dashboard assistant conversations
- Slack conversations and threads from connected integrations
- activity and integration state
- explicit user requests to update memory

This layer remains the source material for memory updates. It is not memory itself.

## 2. Vault Storage And Metadata

### Storage model

Each org should have a dedicated vault root.

Recommended logical path:

- `memory/<orgId>/`

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

Markdown is the memory surface. Postgres metadata exists only to make the vault manageable.

#### `memory_vaults`

One row per org vault.

Suggested fields:

- `id`
- `org_id`
- `root_path`
- `manifest_path`
- `storage_backend`
- `created_at`
- `updated_at`

#### `memory_paths`

Tracks files and directories currently present in the vault.

Suggested fields:

- `id`
- `vault_id`
- `path`
- `path_type` (`file` or `directory`)
- `parent_path`
- `title`
- `is_manifest`
- `is_index`
- `last_updated_at`
- `created_at`
- `updated_at`

`memory_paths` should mirror the current vault structure. When a file or directory is deleted, its row should be removed as part of the same operation.

## 3. Vault Conventions

### Root manifest

Every vault should include `MEMORY.md`.

It should explain:

- how the vault is organized
- what major directories exist
- what files are important entry points
- how Kodi should add, update, move, rename, and delete memory
- any org-specific vocabulary that matters for path resolution

Suggested sections:

- `# Kodi Memory`
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

Each index should describe:

- what belongs in the directory
- what files exist there
- what each file is for
- any local naming or structural conventions

### Memory files

Kodi should keep files concise and modular.

File rules:

- one file should answer one primary question
- lead with the current summary
- keep sections stable enough to update repeatedly
- prefer updating an existing file over creating a near-duplicate
- remove outdated information instead of letting files bloat
- link related files when that helps navigation

File structure should fit the purpose of the file.

Kodi should not force one shared template across the whole vault. Different files will need different section layouts. The important rule is that each file should keep a stable shape over time so Kodi can update it cleanly.

Examples:

- a roadmap file may use sections like milestones, active work, upcoming work, and risks
- a process file may use sections like purpose, current workflow, owners, and exceptions
- a customer file may use sections like current relationship, active needs, recent changes, and linked work
- a capability file may use sections like what exists today, limitations, and planned changes

Soft size guidance:

- target under 600-1000 words for most files
- split files once they become crowded or multi-purpose
- keep index files shorter than the directories they summarize

## 4. Evidence-To-Memory Flow

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

When an event arrives, Kodi should trigger a worker immediately. The worker then decides whether memory should change.

### Memory-worthiness evaluation

Before writing to the vault, the worker should decide:

- is this durable or temporary
- is this likely to matter again
- does this change current state
- does this change next steps or ownership
- does this supersede existing memory
- is this best represented as an update to an existing file

Possible outcomes:

- ignore
- update existing memory
- create new memory
- delete obsolete memory
- trigger structural maintenance

### Path resolution

If memory should change, Kodi should determine:

- what directory this belongs in
- whether an existing file already owns the topic
- whether a directory index should also change
- whether `MEMORY.md` also needs updating

Path resolution should use:

- `MEMORY.md`
- local index files
- targeted search
- `memory_paths`

### Update execution

For a content update, Kodi should:

1. Load the target file.
2. Load only the minimum related context needed.
3. Apply a concise revision.
4. Preserve useful stable structure.
5. Update `memory_paths` metadata.
6. Update indexes or `MEMORY.md` if the change affects navigation.

## 5. Memory Maintenance Engine

The maintenance engine keeps the vault useful over time.

It should have three flows.

### `memory-process-evidence`

This is the main event-driven worker.

Its job is to:

- inspect new evidence
- decide whether it changes durable memory
- update memory only when the change is worth persisting

### `memory-refresh-currentness`

This is a scheduled maintenance pass.

Its job is to:

- revisit files that may no longer reflect reality
- refresh summaries, next steps, or ownership when newer evidence supports it
- keep important memory current even when no single event forced a rewrite

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

- affected paths
- operation kind
- required file reads
- whether manifest or index repair is needed

This plan is:

- transient
- internal to the worker
- not persisted
- not user-facing

## 6. Structural Rules

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
- prefer evolving existing structure over creating parallel overlapping areas

## 7. Retrieval And Runtime Tools

Kodi and OpenClaw should use explicit memory tools instead of direct filesystem crawling.

Suggested operations:

- `memory.get_manifest`
- `memory.get_index`
- `memory.search`
- `memory.read_path`
- `memory.read_related`
- `memory.get_recent_changes`
- `memory.update_content`
- `memory.create_path`
- `memory.rename_path`
- `memory.move_path`
- `memory.delete_path`
- `memory.rebuild_index`

Default retrieval flow:

1. Read `MEMORY.md`.
2. Read one or more relevant directory indexes.
3. Read a small set of target files.
4. Expand further only if needed.

The system should avoid reading the whole vault by default.

## 8. Native Memory UI

The Memory UI should be one continuous vault-browser experience.

### Root view

The default Memory Home should show the root of the vault, similar to browsing a repo:

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

The Memory surface should include a chat panel tied to the current context.

Users should be able to:

- ask Kodi questions about memory
- tell Kodi that something is wrong
- ask Kodi to update a file or directory
- ask Kodi to reorganize memory when the structure no longer fits

The first implementation should optimize for Kodi-maintained memory plus AI-mediated human correction, not direct manual editing.

## 9. Debugging And Logging

Keep this lightweight.

Useful logs:

- failed memory updates
- failed structural operations
- worker crashes
- enough path and operation context to debug what failed

This is for debugging, not a full observability program.

## 10. Testing Strategy

### Unit tests

Cover:

- manifest parsing
- index parsing
- path resolution
- memory-worthiness evaluation
- content update planning
- structural operation planning

### Integration tests

Cover:

- evidence ingestion into memory updates
- multi-file update flows
- structural reorganization flows
- retrieval flows through `MEMORY.md`, indexes, and `memory_paths`
- UI loading of live vault structure

### Scenario tests

Create end-to-end scenarios for several org shapes, such as:

- product roadmap org
- client services org
- operations-heavy org

This matters because the vault structure is supposed to adapt to different businesses.

## 11. Build Plan

This work should be built in complete vertical phases, not thin MVP slices.

### Phase 1: Vault Foundations

Build to completion:

- storage abstraction
- per-org vault creation
- `MEMORY.md`
- directory indexes
- `memory_vaults`
- `memory_paths`
- file operations
- manifest and index parsing
- read/list/search APIs

Outcome:

Kodi can host and navigate a real per-org vault.

### Phase 2: Event-Driven Memory Updates

Build to completion:

- evidence ingestion hooks
- memory-worthiness evaluation
- path resolution
- content update execution
- metadata synchronization
- chat-driven correction handling
- event-driven worker execution

Outcome:

Kodi can update memory from real org activity and user requests.

### Phase 3: Structural Maintenance

Build to completion:

- create/move/rename/delete operations
- split and merge operations
- manifest repair
- index repair
- structure-maintenance worker

Outcome:

Kodi can evolve the shape of the vault safely as the org changes.

### Phase 4: Native Memory UI

Build to completion:

- root vault browser
- directory navigation
- rendered file view
- last edited timestamps
- memory chat panel

Outcome:

Users can inspect and correct org memory inside Kodi.

### Phase 5: Runtime Integration And Scheduled Upkeep

Build to completion:

- OpenClaw memory tool contract
- retrieval heuristics
- memory-backed answering patterns
- scheduled currentness refresh
- next-step synthesis across related files

Outcome:

Kodi and OpenClaw operate directly against maintained org memory.

## 12. Recommended Codebase Areas

### Database

- add memory schema in `packages/db`

### API and services

- add vault storage abstraction in `apps/api`
- add memory services in `apps/api/src/lib/memory`
- add memory router in `apps/api/src/routers`

### Runtime integration

- extend assistant runtime tooling in `apps/api/src/lib/tool-access-runtime.ts` or adjacent runtime modules

### App UI

- add `apps/app/src/app/(app)/memory`

## Summary

This implementation should produce a complete org memory system built around:

- a per-org markdown vault
- `MEMORY.md` and directory indexes for navigation
- lightweight metadata in `memory_vaults` and `memory_paths`
- event-driven selective updates
- structural maintenance
- a native vault-browser UI
- runtime integration with Kodi and OpenClaw

The result should be a memory layer that Kodi can maintain as a living organizational wiki for each org.
