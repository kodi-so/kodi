# Kodi Memory Linear Upload Plan

This document is the team-review and upload-ready version of the Kodi Memory plan.

Reference docs:

1. [architecture-plan.md](./architecture-plan.md)
2. [implementation-spec.md](./implementation-spec.md)

## Project

### Project Title

Kodi Memory

### Project Summary

Build scoped durable memory for Kodi as shared org vaults, per-member vaults, and a required `kodi-memory` OpenClaw plugin.

### Project Description

Kodi should maintain durable markdown memory for both organizations and the members inside them. Each org gets a shared org memory vault. Each org member gets a member memory vault inside that org. Each org's OpenClaw deployment contains one org agent and one member agent per org member.

When a user talks to Kodi in the web app, Slack, or another channel, they are talking to their OpenClaw member agent. That agent should always have access to OpenClaw internal memory, the user's Kodi member memory, and the shared Kodi org memory.

This project delivers the first complete version of scoped memory:

- scoped markdown vaults backed by S3-compatible storage
- lightweight Postgres metadata
- org and member OpenClaw agent registration
- a required `kodi-memory` OpenClaw plugin backed by Kodi APIs
- event-driven memory maintenance
- safe structural maintenance
- native Memory UI with chat-based correction
- runtime retrieval that uses org and member memory together

### Project Success Criteria

- every org has a shared org memory vault
- every org member has a member memory vault for that org
- Kodi can create and maintain `MEMORY.md` and directory indexes for each vault
- Kodi can route users to their OpenClaw member agents
- OpenClaw agents can persistently access allowed Kodi memory scopes
- Kodi can update org and member memory from real evidence
- Kodi can reorganize vaults safely when structure stops fitting
- users can browse org memory and their member memory in the app
- runtime answers can retrieve from OpenClaw internal memory, Kodi member memory, and Kodi org memory

## Milestones

### Milestone 1

Title: Scoped Vault Foundations

Description:

Build the storage, metadata, bootstrap, and retrieval foundation for org and member memory vaults.

Outcome:

Kodi can host real scoped vaults, bootstrap `MEMORY.md` and directory indexes, keep `memory_paths` in sync, and expose read, list, and search APIs.

### Milestone 2

Title: Agent Identity And Persistent Memory Access

Description:

Register org and member OpenClaw agents, route runtime calls to the correct agent, and install the `kodi-memory` plugin backed by Kodi APIs.

Outcome:

Every OpenClaw agent can access the Kodi memory scopes it is allowed to use across its interactions.

### Milestone 3

Title: Event-Driven Memory Updates

Description:

Build the main memory ingestion path from product evidence and OpenClaw proposals into scoped vault updates.

Outcome:

Kodi can respond to meetings, app chat, dashboard assistant activity, Slack activity, correction requests, and OpenClaw proposals by updating the right org or member memory.

### Milestone 4

Title: Structural Maintenance

Description:

Build the operations that let Kodi evolve each vault safely.

Outcome:

Kodi can create, move, rename, split, merge, and delete memory while keeping `MEMORY.md`, directory indexes, and `memory_paths` correct.

### Milestone 5

Title: Native Memory UI

Description:

Build the in-product memory experience as a scoped vault browser with chat-based correction.

Outcome:

Users can browse org memory and their member memory, drill into directories and files, see last edited details, and ask Kodi to correct or reorganize memory.

### Milestone 6

Title: Runtime Integration And Scheduled Upkeep

Description:

Build layered retrieval, memory-backed answering, and scheduled upkeep across org and member memory.

Outcome:

Kodi and OpenClaw can answer from maintained memory and run scheduled refresh passes to keep key memory current.

## Issues

Each issue below is written in a Linear-friendly format:

- title
- milestone
- description
- dependencies

## Milestone 1 Issues

### Issue 1

Title: Add scoped memory schema and migrations

Milestone: Scoped Vault Foundations

Description:

Add the initial memory schema in `packages/db` with `memory_vaults`, `memory_paths`, and a `memory_scope_type` enum. Support org vaults and member vaults, including constraints for one org vault per org and one member vault per org member.

Dependencies:

- None

### Issue 2

Title: Implement vault storage abstraction

Milestone: Scoped Vault Foundations

Description:

Create the storage interface for vault operations using S3-compatible object storage across all Railway environments. Environments should be isolated by bucket or prefix while sharing the same storage behavior. The abstraction should support directory listing, file reads and writes, moves, deletes, directory creation, stat, and search.

Dependencies:

- Add scoped memory schema and migrations

### Issue 3

Title: Build org vault bootstrap services

Milestone: Scoped Vault Foundations

Description:

Add services that create the shared org vault, establish the root path, seed `MEMORY.md`, and create initial org directory indexes.

Dependencies:

- Add scoped memory schema and migrations
- Implement vault storage abstraction

### Issue 4

Title: Build member vault bootstrap services

Milestone: Scoped Vault Foundations

Description:

Add services that create a member vault for each org member, establish the root path, seed `MEMORY.md`, and create initial member directory indexes.

Dependencies:

- Add scoped memory schema and migrations
- Implement vault storage abstraction

### Issue 5

Title: Build path indexing and metadata sync services

Milestone: Scoped Vault Foundations

Description:

Keep `memory_paths` aligned with each live vault structure during create, write, move, rename, and delete operations. Maintain markdown full-text search data on every file write.

Dependencies:

- Add scoped memory schema and migrations
- Implement vault storage abstraction

### Issue 6

Title: Implement manifest and directory index parsing

Milestone: Scoped Vault Foundations

Description:

Add parsing utilities for `MEMORY.md` and directory index files so the memory system can navigate org and member vaults consistently.

Dependencies:

- Build org vault bootstrap services
- Build member vault bootstrap services

### Issue 7

Title: Add scoped memory read, list, and search APIs

Milestone: Scoped Vault Foundations

Description:

Create memory router and service methods for reading manifests, listing directories, opening files, and running targeted search against org and member vaults.

Dependencies:

- Implement vault storage abstraction
- Build path indexing and metadata sync services
- Implement manifest and directory index parsing

### Issue 8

Title: Add scoped vault foundation scenario coverage

Milestone: Scoped Vault Foundations

Description:

Create integration coverage for org vault creation, member vault creation, file operations, path indexing, manifest parsing, index parsing, and scoped search through the real service layer.

Dependencies:

- Add scoped memory read, list, and search APIs

## Milestone 2 Issues

### Issue 9

Title: Add OpenClaw agent registry schema

Milestone: Agent Identity And Persistent Memory Access

Description:

Add an `openclaw_agents` table that maps OpenClaw agent ids to Kodi org and org-member scopes. Support one org agent per org and one member agent per org member.

Dependencies:

- Add scoped memory schema and migrations

### Issue 10

Title: Register org and member agents during lifecycle events

Milestone: Agent Identity And Persistent Memory Access

Description:

Create services that register the org agent when an org is provisioned and register member agents when users join an org. Keep the registry stable as membership changes.

Dependencies:

- Add OpenClaw agent registry schema

### Issue 11

Title: Route OpenClaw runtime calls by actor

Milestone: Agent Identity And Persistent Memory Access

Description:

Update the OpenClaw client and runtime call sites so web app chat, Slack, and background jobs call the correct OpenClaw agent for the current actor and workflow.

Dependencies:

- Register org and member agents during lifecycle events

### Issue 12

Title: Build `kodi-memory` service authentication

Milestone: Agent Identity And Persistent Memory Access

Description:

Add a service-authenticated path from the `kodi-memory` OpenClaw plugin to Kodi memory APIs. Requests should authenticate the OpenClaw deployment, include trusted runtime identity from the plugin, identify the calling OpenClaw agent, and resolve allowed memory scopes from `openclaw_agents`.

Dependencies:

- Add OpenClaw agent registry schema
- Add scoped memory read, list, and search APIs

### Issue 13

Title: Build the `kodi-memory` OpenClaw plugin

Milestone: Agent Identity And Persistent Memory Access

Description:

Build a required native OpenClaw plugin named `kodi-memory`. The plugin should expose tools for manifests, indexes, search, path reads, related reads, recent changes, and memory update proposals. It should call Kodi's service-authenticated Memory API and should not access S3, Postgres, or vault files directly.

Dependencies:

- Build `kodi-memory` service authentication

### Issue 14

Title: Add trusted identity capture and fail-closed behavior

Milestone: Agent Identity And Persistent Memory Access

Description:

Implement trusted identity capture in the `kodi-memory` plugin. For `kodi_memory_*` tool calls, capture `agentId`, `sessionKey`, and `toolCallId` from OpenClaw runtime hook context before execution, look it up during tool execution, and fail closed when trusted identity context is missing.

Dependencies:

- Build the `kodi-memory` OpenClaw plugin

### Issue 15

Title: Add proactive memory recall

Milestone: Agent Identity And Persistent Memory Access

Description:

Add proactive recall to the `kodi-memory` plugin so each agent turn can receive a small relevant memory briefing from Kodi before the reply. Recall must use trusted runtime identity and return only memory from allowed scopes.

Dependencies:

- Add trusted identity capture and fail-closed behavior

### Issue 16

Title: Add `kodi-memory` provisioning and smoke tests

Milestone: Agent Identity And Persistent Memory Access

Description:

Install and configure the `kodi-memory` plugin during OpenClaw provisioning. Add a smoke test for the pinned OpenClaw version that verifies `before_tool_call` provides `agentId`, `sessionKey`, and `toolCallId` for `kodi_memory_*` tool calls. Provisioning validation should fail closed if trusted identity is unavailable.

Dependencies:

- Add proactive memory recall

### Issue 17

Title: Add `kodi-memory` access coverage

Milestone: Agent Identity And Persistent Memory Access

Description:

Create coverage proving org agents can access org memory, member agents can access their member memory plus org memory, and agents cannot access unrelated member memory. Include fail-closed tests for missing trusted identity context.

Dependencies:

- Add `kodi-memory` provisioning and smoke tests

## Milestone 3 Issues

### Issue 18

Title: Define memory event contracts and worker entrypoints

Milestone: Event-Driven Memory Updates

Description:

Define the internal event model for memory updates and wire worker entrypoints that can be triggered by product events and OpenClaw memory proposals.

Dependencies:

- Add scoped memory read, list, and search APIs

### Issue 19

Title: Connect meeting evidence to memory events

Milestone: Event-Driven Memory Updates

Description:

Emit memory update events from meeting completion and meaningful meeting state changes so meeting evidence can drive org and member memory updates.

Dependencies:

- Define memory event contracts and worker entrypoints

### Issue 20

Title: Connect app chat and dashboard assistant evidence to memory events

Milestone: Event-Driven Memory Updates

Description:

Emit memory update events from meaningful app chat and dashboard assistant changes so conversational activity can update scoped memory.

Dependencies:

- Define memory event contracts and worker entrypoints

### Issue 21

Title: Connect Slack evidence to memory events

Milestone: Event-Driven Memory Updates

Description:

Use the integrations layer to emit memory update events from meaningful Slack thread and conversation changes.

Dependencies:

- Define memory event contracts and worker entrypoints

### Issue 22

Title: Build memory-worthiness and scope evaluation

Milestone: Event-Driven Memory Updates

Description:

Implement the logic that decides whether new evidence should change durable memory and whether each change belongs in org memory, member memory, or both.

Dependencies:

- Define memory event contracts and worker entrypoints

### Issue 23

Title: Build path resolution for scoped content updates

Milestone: Event-Driven Memory Updates

Description:

Implement the logic that decides where a memory update belongs using the target vault's `MEMORY.md`, directory indexes, targeted search, and `memory_paths`.

Dependencies:

- Build memory-worthiness and scope evaluation
- Implement manifest and directory index parsing

### Issue 24

Title: Build content update execution and metadata sync

Milestone: Event-Driven Memory Updates

Description:

Implement the write path that updates files concisely, repairs affected indexes when needed, and keeps `memory_paths` and search data in sync with the live vault.

Dependencies:

- Build path resolution for scoped content updates
- Build path indexing and metadata sync services

### Issue 25

Title: Add chat-driven memory correction handling

Milestone: Event-Driven Memory Updates

Description:

Allow users to tell Kodi to correct org or member memory through chat and route those requests through the same update pipeline as other evidence sources.

Dependencies:

- Build content update execution and metadata sync

### Issue 26

Title: Handle OpenClaw memory update proposals

Milestone: Event-Driven Memory Updates

Description:

Accept memory update proposals from the `kodi-memory` plugin and route them through the memory worker so durable memory changes remain governed by Kodi.

Dependencies:

- Build the `kodi-memory` OpenClaw plugin
- Build content update execution and metadata sync

### Issue 27

Title: Add end-to-end coverage for scoped memory updates

Milestone: Event-Driven Memory Updates

Description:

Create scenario coverage that proves Kodi can process meetings, app chat, dashboard assistant activity, Slack evidence, correction requests, and OpenClaw proposals into org and member vault updates.

Dependencies:

- Connect meeting evidence to memory events
- Connect app chat and dashboard assistant evidence to memory events
- Connect Slack evidence to memory events
- Add chat-driven memory correction handling
- Handle OpenClaw memory update proposals

## Milestone 4 Issues

### Issue 28

Title: Implement structural path operations

Milestone: Structural Maintenance

Description:

Add supported structural operations for create, move, rename, and delete across files and directories within a scoped vault.

Dependencies:

- Build path indexing and metadata sync services

### Issue 29

Title: Implement file split and merge operations

Milestone: Structural Maintenance

Description:

Allow Kodi to split crowded files and merge overlapping memory files while preserving clean navigation and concise memory.

Dependencies:

- Implement structural path operations

### Issue 30

Title: Build manifest and index repair logic for structural changes

Milestone: Structural Maintenance

Description:

Repair `MEMORY.md` and affected directory indexes as part of structural operations so navigation remains correct after moves, renames, splits, merges, and deletes.

Dependencies:

- Implement structural path operations
- Implement file split and merge operations

### Issue 31

Title: Build the structure-maintenance worker

Milestone: Structural Maintenance

Description:

Add the worker flow that decides when structural maintenance is needed and executes supported operations safely within the affected vault.

Dependencies:

- Implement structural path operations
- Implement file split and merge operations
- Build manifest and index repair logic for structural changes

### Issue 32

Title: Add structural maintenance scenario coverage

Milestone: Structural Maintenance

Description:

Create integration scenarios that cover directory reorganization, file splits, file merges, moves, renames, and deletes across org and member vaults.

Dependencies:

- Build the structure-maintenance worker

## Milestone 5 Issues

### Issue 33

Title: Create the Memory app route and shell

Milestone: Native Memory UI

Description:

Add the `apps/app/src/app/(app)/memory` route and build the shared shell for the scoped vault-browser experience.

Dependencies:

- Add scoped memory read, list, and search APIs

### Issue 34

Title: Build memory scope switching

Milestone: Native Memory UI

Description:

Allow users to switch between shared org memory and their member memory within the Memory surface.

Dependencies:

- Create the Memory app route and shell

### Issue 35

Title: Build the root and directory browser views

Milestone: Native Memory UI

Description:

Render the selected vault root and directory drill-down states using live memory metadata and directory index summaries.

Dependencies:

- Build memory scope switching

### Issue 36

Title: Build the memory file view

Milestone: Native Memory UI

Description:

Render markdown files inside the Memory surface, including related links and last edited details.

Dependencies:

- Create the Memory app route and shell

### Issue 37

Title: Build the Memory chat panel

Milestone: Native Memory UI

Description:

Add the chat interface that lets users ask questions about memory, report inaccuracies, and request memory changes from the current scope and path.

Dependencies:

- Create the Memory app route and shell
- Add chat-driven memory correction handling

### Issue 38

Title: Add UI integration and scenario coverage

Milestone: Native Memory UI

Description:

Create UI-level coverage for scope switching, vault browsing, file viewing, and chat-based correction across empty and populated vault states.

Dependencies:

- Build the root and directory browser views
- Build the memory file view
- Build the Memory chat panel

## Milestone 6 Issues

### Issue 39

Title: Implement layered memory retrieval heuristics

Milestone: Runtime Integration And Scheduled Upkeep

Description:

Teach the runtime how to retrieve from member `MEMORY.md`, org `MEMORY.md`, directory indexes, and target files without reading whole vaults.

Dependencies:

- Add proactive memory recall

### Issue 40

Title: Implement memory-backed answering flows

Milestone: Runtime Integration And Scheduled Upkeep

Description:

Use layered memory retrieval inside runtime answers so Kodi responds from OpenClaw internal memory, member memory, org memory, and current request context.

Dependencies:

- Implement layered memory retrieval heuristics

### Issue 41

Title: Build the scheduled currentness refresh worker

Milestone: Runtime Integration And Scheduled Upkeep

Description:

Add the scheduled maintenance pass that revisits files that may no longer reflect reality and refreshes them when newer evidence supports it.

Dependencies:

- Build content update execution and metadata sync

### Issue 42

Title: Implement cross-file next-step synthesis

Milestone: Runtime Integration And Scheduled Upkeep

Description:

Add the logic that keeps next-step understanding up to date across related org and member memory files so Kodi can answer clearly about what should happen next.

Dependencies:

- Implement memory-backed answering flows
- Build the scheduled currentness refresh worker

### Issue 43

Title: Add final full-system scenario coverage

Milestone: Runtime Integration And Scheduled Upkeep

Description:

Create end-to-end scenarios that prove the full memory system works across multiple org shapes, multiple members, `kodi-memory` plugin access, runtime interactions, and scheduled upkeep.

Dependencies:

- Add scoped vault foundation scenario coverage
- Add `kodi-memory` access coverage
- Add end-to-end coverage for scoped memory updates
- Add structural maintenance scenario coverage
- Add UI integration and scenario coverage
- Implement cross-file next-step synthesis

## Recommended Upload Order

Create the Linear project first, then the milestones, then the issues in this order:

1. Scoped Vault Foundations
2. Agent Identity And Persistent Memory Access
3. Event-Driven Memory Updates
4. Structural Maintenance
5. Native Memory UI
6. Runtime Integration And Scheduled Upkeep

The clearest parallel work opportunities are:

- Milestone 1 issues 3, 4, 5, and 6 after the schema and storage direction are set
- Milestone 2 issues 10 and 12 after the agent registry exists
- Milestone 3 issues 19, 20, and 21 after the event contract exists
- Milestone 5 issues 35, 36, and 37 after the Memory route shell exists

## Suggested Linear Setup

Create:

- one project: `Kodi Memory`
- six milestones matching the milestones in this document
- 43 issues matching the issues in this document

If the team approves this plan, the next step can be creating the project, milestones, and issues directly in Linear from this document.
