# Org Memory Architecture Plan

For build details, see [implementation-spec.md](./implementation-spec.md).

## Purpose

Kodi needs a durable memory layer for each org.

That memory should help Kodi:

- remember important organizational context
- keep current state and next steps up to date
- answer and act from shared context
- expose that context clearly in the product

The system should be built as a Kodi-managed markdown vault for each org.

## Product Shape

Each org gets its own memory vault made of markdown files and directories.

Kodi owns that vault. It decides:

- what information deserves durable memory
- where that information belongs
- when existing memory should be revised
- when the vault structure should be reorganized
- when outdated information should be removed

The vault is not a notes app. It is a Kodi-maintained organizational wiki.

## Design Principles

### Vault-first

The primary memory surface is a markdown vault.

### Selective memory

Only durable, reusable information should enter memory. Raw chatter should only affect memory when it changes something that matters later.

### Update over accumulate

Kodi should usually revise existing files instead of creating endless new ones. Memory should stay concise.

### Event-driven updates

New evidence should trigger memory work immediately. The worker then decides whether durable memory actually needs to change.

### Flexible structure

Different orgs organize knowledge differently. Kodi should be able to create, rename, move, split, merge, and delete files and directories as the org evolves.

### Native visibility

The vault should be visible inside Kodi as a browseable product surface, with chat-based correction built in.

## Current Foundations In The Codebase

Kodi already has the main ingredients this system needs.

### Org-scoped runtime

Org membership and runtime routing are already org-scoped. That gives us a clean boundary for per-org memory.

### Meeting evidence

Kodi already persists meeting sessions, transcripts, participants, artifacts, and work items. Meetings are the richest current source of durable memory updates.

### Conversation evidence

Kodi already has app chat and dashboard assistant threads. Slack is also available through integrations and can become another memory input.

### Execution layer

Kodi already supports tool access policy, approvals, work item sync, and external actions. The missing layer is durable shared memory, not the ability to take action.

## Target Architecture

### 1. Raw evidence

Raw evidence stays in the systems that already own it, including:

- meetings and transcripts
- app chat
- dashboard assistant conversations
- Slack conversations made available through integrations
- work items
- activity and integration state
- future connected systems

These systems are inputs to memory maintenance. They are not memory themselves.

### 2. Per-org memory vault

Each org gets a vault of markdown files and directories.

Example shape:

- `MEMORY.md`
- `Projects/`
- `Customers/`
- `Processes/`
- `Current State/`
- `Indexes/`

This is only a starting point. Kodi should adapt the structure to each org over time.

### 3. Root manifest

Every vault includes `MEMORY.md`.

It should explain:

- how the vault is organized
- what major directories exist
- what files are important entry points
- how Kodi should add, update, move, rename, and delete memory

`MEMORY.md` is the agent-facing guide to the vault.

### 4. Directory indexes

Important directories should include compact local index files such as:

- `Projects/PROJECTS.md`
- `Customers/CUSTOMERS.md`
- `Processes/PROCESSES.md`

These indexes help Kodi narrow retrieval and keep each area legible.

### 5. Lightweight metadata

The vault needs a small support layer in Postgres:

- one vault record per org
- one path index for files and directories

This is enough to make the vault manageable without turning memory into a database-heavy system.

### 6. Maintenance system

Kodi needs a maintenance system that can:

- process new evidence
- decide whether memory should change
- update the right files
- keep manifests and indexes current
- reorganize the vault when the structure stops being useful

### 7. Retrieval tools

Kodi and OpenClaw should access memory through explicit tools, not by blindly crawling storage.

Examples:

- `memory.get_manifest`
- `memory.get_index`
- `memory.search`
- `memory.read_path`
- `memory.update_content`
- `memory.create_path`
- `memory.rename_path`
- `memory.move_path`
- `memory.delete_path`

### 8. Native Memory UI

The Memory experience should be one continuous vault browser:

- root view at the top of the vault
- directory view when browsing folders
- file view when opening markdown files

The root view should feel like browsing a repo from the top level:

- directories
- files
- last edited times

Users should be able to drill down naturally from there.

The Memory surface should also include a chat panel so users can ask Kodi questions, correct memory, and request changes without editing files directly.

## How Updates Should Work

The main memory update path should be event-driven.

Typical triggers include:

- a meeting completes
- a meeting transcript changes meaningfully
- a Slack conversation changes
- an app chat or dashboard assistant thread changes
- a work item changes
- an integration sync brings in meaningful new information
- a user explicitly asks Kodi to change memory

When a trigger happens:

1. Kodi starts the memory worker.
2. The worker inspects the new evidence.
3. The worker decides whether the evidence changes durable memory.
4. If yes, Kodi updates the relevant files and indexes.

Not every event should rewrite memory. The worker should only write when the evidence changes durable context.

## OpenClaw's Role

OpenClaw should remain the reasoning and execution runtime.

Kodi should own the memory system itself:

- vault storage
- manifests and indexes
- path metadata
- maintenance flows
- Memory UI

OpenClaw should use that memory for:

- retrieval
- answering
- planning
- updating memory when appropriate

In short:

- Kodi owns memory
- OpenClaw reasons with memory

## Delivery Shape

This should be built in complete vertical workstreams, not thin MVP slices.

The main work areas are:

1. Vault foundations
2. Event-driven memory maintenance
3. Structural maintenance
4. Native Memory UI
5. Runtime integration

Each work area should deliver a complete feature surface that teammates can review and build on.

## Summary

Kodi should build org memory as a per-org markdown vault with:

- a root manifest
- directory indexes
- lightweight metadata
- event-driven selective updates
- structural maintenance
- a native vault-browser UI

That gives Kodi a memory system that stays concise, adapts to each org, and gives the assistant durable context to reason from.
