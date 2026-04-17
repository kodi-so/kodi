# Org Memory Linear Upload Plan

This document is the team-review and upload-ready version of the Org Memory plan.

Reference docs:

1. [architecture-plan.md](./architecture-plan.md)
2. [implementation-spec.md](./implementation-spec.md)

## Project

### Project Title

Org Memory

### Project Summary

Build Kodi's org memory system as a per-org markdown vault that Kodi maintains over time.

### Project Description

Each org should have a live memory workspace made of markdown files and directories, guided by `MEMORY.md`, backed by lightweight metadata, updated from real org activity, and exposed in the product as a native vault browser with chat-based correction.

This project delivers the complete first version of memory. When complete, Kodi should be able to:

- maintain a memory vault for each org
- decide what deserves durable memory
- update memory from meetings, chat, Slack, and direct user requests
- reorganize the vault as the org changes
- expose memory clearly in the UI
- let OpenClaw retrieve and act from maintained memory

### Project Success Criteria

- every org can have its own memory vault
- Kodi can create and maintain `MEMORY.md` and directory indexes
- Kodi can update memory from real evidence through an event-driven worker
- Kodi can reorganize the vault safely when the structure stops fitting
- users can browse memory in the app and ask Kodi to correct it
- OpenClaw can read and use org memory through explicit tools

## Milestones

### Milestone 1

Title: Vault Foundations

Description:

Build the storage, metadata, bootstrap, and retrieval foundation for per-org vaults.

Outcome:

Kodi can host a real vault for each org, bootstrap `MEMORY.md` and directory indexes, keep `memory_paths` in sync, and expose read, list, and search APIs.

### Milestone 2

Title: Event-Driven Memory Updates

Description:

Build the main memory ingestion path from product evidence into vault updates.

Outcome:

Kodi can respond to meetings, app chat, dashboard assistant activity, Slack activity, and direct correction requests by deciding whether memory should change and then updating the right files.

### Milestone 3

Title: Structural Maintenance

Description:

Build the operations that let Kodi evolve the shape of the vault safely.

Outcome:

Kodi can create, move, rename, split, merge, and delete memory while keeping `MEMORY.md`, directory indexes, and `memory_paths` correct.

### Milestone 4

Title: Native Memory UI

Description:

Build the in-product memory experience as a vault browser with chat-based correction.

Outcome:

Users can browse the vault from the root, drill into directories and files, see last edited details, and ask Kodi to correct or reorganize memory.

### Milestone 5

Title: Runtime Integration And Scheduled Upkeep

Description:

Build the runtime contract that lets OpenClaw operate against memory and add the scheduled upkeep loop that keeps memory current.

Outcome:

Kodi and OpenClaw can retrieve from memory directly, answer with memory-backed context, and run scheduled refresh passes to keep key memory current.

## Issues

Each issue below is written in a Linear-friendly format:

- title
- milestone
- description
- dependencies

## Milestone 1 Issues

### Issue 1

Title: Add org memory schema and migrations

Milestone: Vault Foundations

Description:

Add the initial memory schema in `packages/db` with `memory_vaults` and `memory_paths`, including indexes, relations, and generated client types. This is the persistent foundation for the vault system.

Dependencies:

- None

### Issue 2

Title: Implement vault storage abstraction

Milestone: Vault Foundations

Description:

Create the storage interface for vault operations with local-disk development support and S3-compatible production support. The abstraction should support directory listing, file reads and writes, moves, deletes, directory creation, stat, and search.

Dependencies:

- Add org memory schema and migrations

### Issue 3

Title: Build vault bootstrap and lifecycle services

Milestone: Vault Foundations

Description:

Add services that create a vault for a new org, establish the root path, seed `MEMORY.md`, and create initial directory indexes. This should also define how new orgs are enrolled into the memory system.

Dependencies:

- Add org memory schema and migrations
- Implement vault storage abstraction

### Issue 4

Title: Build path indexing and metadata sync services

Milestone: Vault Foundations

Description:

Keep `memory_paths` aligned with the live vault structure during create, write, move, rename, and delete operations. This includes path normalization and metadata update helpers.

Dependencies:

- Add org memory schema and migrations
- Implement vault storage abstraction

### Issue 5

Title: Implement manifest and directory index parsing

Milestone: Vault Foundations

Description:

Add parsing utilities for `MEMORY.md` and directory index files so the rest of the memory system can navigate the vault consistently.

Dependencies:

- Build vault bootstrap and lifecycle services

### Issue 6

Title: Add memory read, list, and search APIs

Milestone: Vault Foundations

Description:

Create the first memory router and service methods for reading manifests, listing directories, opening files, and running targeted search against the vault.

Dependencies:

- Implement vault storage abstraction
- Build path indexing and metadata sync services
- Implement manifest and directory index parsing

### Issue 7

Title: Add vault foundation scenario coverage

Milestone: Vault Foundations

Description:

Create integration coverage for vault creation, file operations, path indexing, and manifest and index parsing through the real service layer.

Dependencies:

- Add memory read, list, and search APIs

## Milestone 2 Issues

### Issue 8

Title: Define memory event contracts and worker entrypoints

Milestone: Event-Driven Memory Updates

Description:

Define the internal event model for memory updates and wire a worker entrypoint that can be triggered by product events. This is the common ingestion contract for all evidence sources.

Dependencies:

- Add memory read, list, and search APIs

### Issue 9

Title: Connect meeting evidence to memory events

Milestone: Event-Driven Memory Updates

Description:

Emit memory update events from meeting completion and other meaningful meeting state changes so meeting evidence can drive memory updates in near real time.

Dependencies:

- Define memory event contracts and worker entrypoints

### Issue 10

Title: Connect app chat and dashboard assistant evidence to memory events

Milestone: Event-Driven Memory Updates

Description:

Emit memory update events from meaningful app chat and dashboard assistant changes so conversational product activity can update org memory.

Dependencies:

- Define memory event contracts and worker entrypoints

### Issue 11

Title: Connect Slack evidence to memory events

Milestone: Event-Driven Memory Updates

Description:

Use the existing integrations layer to emit memory update events from meaningful Slack thread and conversation changes.

Dependencies:

- Define memory event contracts and worker entrypoints

### Issue 12

Title: Build memory-worthiness evaluation

Milestone: Event-Driven Memory Updates

Description:

Implement the logic that decides whether new evidence should change durable memory. It should be able to ignore non-durable signals and classify meaningful updates into content updates, new files, deletions, or structural follow-up.

Dependencies:

- Define memory event contracts and worker entrypoints

### Issue 13

Title: Build path resolution for content updates

Milestone: Event-Driven Memory Updates

Description:

Implement the logic that decides where a memory update belongs using `MEMORY.md`, directory indexes, targeted search, and `memory_paths`.

Dependencies:

- Build memory-worthiness evaluation
- Implement manifest and directory index parsing

### Issue 14

Title: Build content update execution and metadata sync

Milestone: Event-Driven Memory Updates

Description:

Implement the write path that updates files concisely, repairs affected indexes when needed, and keeps `memory_paths` in sync with the live vault.

Dependencies:

- Build path resolution for content updates
- Build path indexing and metadata sync services

### Issue 15

Title: Add chat-driven memory correction handling

Milestone: Event-Driven Memory Updates

Description:

Allow users to tell Kodi to correct or update memory through chat and route those requests through the same update pipeline as other evidence sources.

Dependencies:

- Build content update execution and metadata sync

### Issue 16

Title: Add end-to-end coverage for event-driven memory updates

Milestone: Event-Driven Memory Updates

Description:

Create scenario coverage that proves Kodi can process meetings, app chat, dashboard assistant activity, Slack evidence, and correction requests into real vault updates.

Dependencies:

- Connect meeting evidence to memory events
- Connect app chat and dashboard assistant evidence to memory events
- Connect Slack evidence to memory events
- Build content update execution and metadata sync
- Add chat-driven memory correction handling

## Milestone 3 Issues

### Issue 17

Title: Implement structural path operations

Milestone: Structural Maintenance

Description:

Add supported structural operations for create, move, rename, and delete across files and directories.

Dependencies:

- Build path indexing and metadata sync services

### Issue 18

Title: Implement file split and merge operations

Milestone: Structural Maintenance

Description:

Allow Kodi to split crowded files and merge overlapping memory files while preserving clean navigation and concise memory.

Dependencies:

- Implement structural path operations

### Issue 19

Title: Build manifest and index repair logic for structural changes

Milestone: Structural Maintenance

Description:

Repair `MEMORY.md` and affected directory indexes as part of structural operations so navigation remains correct after moves, renames, splits, merges, and deletes.

Dependencies:

- Implement structural path operations
- Implement file split and merge operations

### Issue 20

Title: Build the structure-maintenance worker

Milestone: Structural Maintenance

Description:

Add the worker flow that decides when structural maintenance is needed and executes supported operations safely.

Dependencies:

- Implement structural path operations
- Implement file split and merge operations
- Build manifest and index repair logic for structural changes

### Issue 21

Title: Add structural maintenance scenario coverage

Milestone: Structural Maintenance

Description:

Create integration scenarios that cover directory reorganization, file splits, file merges, moves, renames, and deletes across a live vault.

Dependencies:

- Build the structure-maintenance worker

## Milestone 4 Issues

### Issue 22

Title: Create the Memory app route and shell

Milestone: Native Memory UI

Description:

Add the `apps/app/src/app/(app)/memory` route and build the shared shell for the vault-browser experience.

Dependencies:

- Add memory read, list, and search APIs

### Issue 23

Title: Build the root and directory browser views

Milestone: Native Memory UI

Description:

Render the root of the vault and directory drill-down states using live memory metadata and directory index summaries.

Dependencies:

- Create the Memory app route and shell

### Issue 24

Title: Build the memory file view

Milestone: Native Memory UI

Description:

Render markdown files inside the Memory surface, including related links and last edited details.

Dependencies:

- Create the Memory app route and shell

### Issue 25

Title: Build the Memory chat panel

Milestone: Native Memory UI

Description:

Add the chat interface that lets users ask questions about memory, report inaccuracies, and request memory changes from within the Memory surface.

Dependencies:

- Create the Memory app route and shell
- Add chat-driven memory correction handling

### Issue 26

Title: Add UI integration and scenario coverage

Milestone: Native Memory UI

Description:

Create UI-level coverage for vault browsing, file viewing, and chat-based correction across empty and populated vault states.

Dependencies:

- Build the root and directory browser views
- Build the memory file view
- Build the Memory chat panel

## Milestone 5 Issues

### Issue 27

Title: Define the OpenClaw memory tool contract

Milestone: Runtime Integration And Scheduled Upkeep

Description:

Add the memory tool surface that Kodi and OpenClaw will use for manifests, indexes, targeted reads, search, and updates.

Dependencies:

- Add memory read, list, and search APIs

### Issue 28

Title: Implement memory-backed retrieval heuristics

Milestone: Runtime Integration And Scheduled Upkeep

Description:

Teach the runtime how to retrieve from `MEMORY.md`, directory indexes, and target files without reading the whole vault.

Dependencies:

- Define the OpenClaw memory tool contract

### Issue 29

Title: Implement memory-backed answering and update flows

Milestone: Runtime Integration And Scheduled Upkeep

Description:

Use the memory tool contract inside the runtime so answers and follow-up memory changes operate against the maintained vault.

Dependencies:

- Define the OpenClaw memory tool contract
- Implement memory-backed retrieval heuristics
- Build content update execution and metadata sync

### Issue 30

Title: Build the scheduled currentness refresh worker

Milestone: Runtime Integration And Scheduled Upkeep

Description:

Add the scheduled maintenance pass that revisits files that may no longer reflect reality and refreshes them when newer evidence supports it.

Dependencies:

- Build content update execution and metadata sync

### Issue 31

Title: Implement cross-file next-step synthesis

Milestone: Runtime Integration And Scheduled Upkeep

Description:

Add the logic that keeps next-step understanding up to date across related memory files so Kodi can answer clearly about what should happen next.

Dependencies:

- Implement memory-backed answering and update flows
- Build the scheduled currentness refresh worker

### Issue 32

Title: Add final full-system scenario coverage

Milestone: Runtime Integration And Scheduled Upkeep

Description:

Create end-to-end scenarios that prove the full memory system works across multiple org shapes and runtime interactions.

Dependencies:

- Add end-to-end coverage for event-driven memory updates
- Add structural maintenance scenario coverage
- Add UI integration and scenario coverage
- Implement memory-backed answering and update flows
- Build the scheduled currentness refresh worker
- Implement cross-file next-step synthesis

## Recommended Upload Order

Create the Linear project first, then the milestones, then the issues in this order:

1. Vault Foundations
2. Event-Driven Memory Updates
3. Structural Maintenance
4. Native Memory UI
5. Runtime Integration And Scheduled Upkeep

The clearest parallel work opportunities are:

- Milestone 1 issues 2, 4, and 5 after the schema direction is set
- Milestone 2 issues 9, 10, and 11 after the event contract exists
- Milestone 4 issues 23, 24, and 25 after the Memory route shell exists

## Suggested Linear Setup

Create:

- one project: `Org Memory`
- five milestones matching the milestones in this document
- 32 issues matching the issues in this document

If the team approves this plan, the next step can be creating the project, milestones, and issues directly in Linear from this document.
