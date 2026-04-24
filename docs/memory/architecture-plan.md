# Kodi Memory Architecture Plan

For build details, see [implementation-spec.md](./implementation-spec.md).

## Purpose

Kodi needs durable memory for both organizations and the people inside them.

That memory should help Kodi:

- remember shared organizational context
- remember user-specific preferences, responsibilities, and working context
- keep current state and next steps up to date
- answer and act from maintained context
- expose that context clearly in the product

The system should be built as scoped Kodi-managed markdown vaults.

## Memory Model

Kodi memory has three layers:

1. OpenClaw internal memory
2. Kodi org memory
3. Kodi member memory

OpenClaw internal memory belongs to the OpenClaw runtime. It is useful for agent-local state, sessions, and execution continuity.

Kodi org memory is shared durable memory for an organization. It stores projects, customers, processes, decisions, current state, and other facts that members of the org should be able to rely on.

Kodi member memory is durable memory for one org member inside one org. It stores user-specific preferences, responsibilities, personal working context, private commitments, and other information that should not become org-wide truth.

The layers should stay separate in storage and permissions. They should feel unified at runtime through a single memory tool surface that retrieves from the right scopes.

## Product Shape

Each org gets one OpenClaw deployment.

Inside that deployment, Kodi should maintain multiple OpenClaw agents:

- one shared org agent
- one member agent for each org member

Kodi should route each interaction based on both the actor and the visibility of the conversation.

The actor is the user or system that initiated the interaction. Conversation visibility determines who can see the response.

Private conversations should route to the actor's member agent. A member agent can use:

- OpenClaw internal memory
- that member's Kodi member memory vault for the current org
- the shared Kodi org memory vault
- the current request context, such as the active chat thread, Slack thread, meeting, or work item

Shared conversations should route to the org agent by default. The org agent can use org memory and current request context. Kodi may keep the actor identity for audit, permissions, and attribution, but the org agent should not use a member's private memory in a shared response.

Kodi owns the durable memory vaults. OpenClaw reasons with them through memory tools.

## Design Principles

### Scoped by default

Memory should always have an explicit scope. Shared organizational facts belong in org memory. User-specific facts belong in member memory.

Agent routing should also have an explicit scope. Private surfaces use member agents. Shared surfaces use the org agent unless a product flow explicitly narrows visibility to one member.

### Vault-first

The primary durable memory surface is markdown files and directories.

### Layered retrieval

Agents should access memory through one tool surface that understands org and member scopes. OpenClaw should not need to know storage layout details.

### Persistent runtime access

OpenClaw agents should have persistent access to Kodi memory tools across web app chat, Slack, background work, and other agent interactions.

### Selective memory

Only durable, reusable information should enter memory. Raw chatter should only affect memory when it changes something that matters later.

### Update over accumulate

Kodi should usually revise existing files instead of creating endless new ones. Memory should stay concise.

### Event-driven updates

New evidence should trigger memory work immediately. The worker then decides whether durable memory actually needs to change.

### Flexible structure

Different orgs and members organize knowledge differently. Kodi should be able to create, rename, move, split, merge, and delete files and directories as memory evolves.

### Native visibility

Memory should be visible inside Kodi as a browseable product surface, with chat-based correction built in.

## Current Foundations In The Codebase

Kodi already has the main ingredients this system needs.

### Org-scoped runtime

Org membership and runtime routing already provide a boundary for org memory and member memory.

### OpenClaw deployment model

Kodi provisions one OpenClaw deployment per org. OpenClaw supports multiple agents in one deployment, so Kodi can add org and member agents without changing the core provisioning shape.

### Meeting evidence

Kodi already persists meeting sessions, transcripts, participants, artifacts, and work items. Meetings are a rich source of durable memory updates.

### Conversation evidence

Kodi already has app chat and dashboard assistant threads. Slack is also available through integrations and can become another memory input.

### Execution layer

Kodi already supports tool access policy, approvals, work item sync, and external actions. The missing layer is durable scoped memory and persistent memory access for OpenClaw agents.

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

### 2. Scoped memory vaults

Each org has one shared org vault and one member vault per org member.

Recommended logical paths:

- `memory/<orgId>/org/`
- `memory/<orgId>/members/<orgMemberId>/`

Each vault is made of markdown files and directories.

Example org vault shape:

- `MEMORY.md`
- `Projects/`
- `Customers/`
- `Processes/`
- `Current State/`
- `Indexes/`

Example member vault shape:

- `MEMORY.md`
- `Preferences/`
- `Responsibilities/`
- `Current Work/`
- `Relationships/`

These are starting points. Kodi should adapt each vault over time.

### 3. Root manifest

Every vault includes `MEMORY.md`.

It should explain:

- what scope the vault represents
- how the vault is organized
- what major directories exist
- what files are important entry points
- how Kodi should add, update, move, rename, and delete memory

`MEMORY.md` is the agent-facing guide to that vault.

### 4. Directory indexes

Important directories should include compact local index files such as:

- `Projects/PROJECTS.md`
- `Customers/CUSTOMERS.md`
- `Preferences/PREFERENCES.md`
- `Current Work/CURRENT-WORK.md`

Indexes help Kodi narrow retrieval and keep each area legible.

### 5. Lightweight metadata

The vaults need a small support layer in Postgres:

- one vault record per memory scope
- one path index for files and directories
- one agent registry that maps OpenClaw agent ids to org or member scopes

This is enough to make memory manageable without turning the vault content into a database-heavy system.

### 6. Maintenance system

Kodi needs a maintenance system that can:

- process new evidence
- decide whether memory should change
- decide whether a change belongs in org memory or member memory
- update the right files
- keep manifests and indexes current
- reorganize vaults when structure stops being useful

### 7. `memory` module inside `kodi-bridge`

Kodi and OpenClaw should access memory through explicit tools.

Persistent memory access should be implemented as a `memory` module inside the required native `kodi-bridge` plugin described in [docs/openclaw-bridge/](../openclaw-bridge/).

The bridge-hosted memory module should be available in each org's OpenClaw deployment and should call Kodi's authenticated Memory API through the bridge transport. Kodi remains the source of truth for vault storage, scope authorization, retrieval, and writes.

The memory module should derive trusted agent identity from OpenClaw runtime hook context, not from model-provided tool parameters. For tool calls, it should capture `agentId`, `sessionKey`, and `toolCallId` from trusted runtime context before execution and send that identity context to Kodi through the bridge's authenticated request path. If trusted identity context is missing, the module should fail closed.

Kodi-triggered calls may add current context and action tools, while durable memory access remains available to the agent across interactions inside the same runtime.

The memory module should provide explicit tools for lookup and update proposals. Agents should decide what memory to read, start from manifests and indexes when helpful, and iterate if they need more context.

Examples:

- get the vault manifest
- get a directory index
- search memory
- read a path
- read related files
- get recent changes
- propose a memory update

Writes should go through Kodi's memory maintenance path. OpenClaw should propose or request durable memory changes; Kodi should apply them through the same workers that handle other evidence.

### 8. Native Memory UI

The Memory experience should be one continuous vault browser with clear scope switching.

The UI should support:

- shared org memory
- the current user's member memory
- root views for each vault
- directory views
- rendered markdown file views
- last edited times
- chat-based correction tied to the current scope and path

The first implementation should optimize for Kodi-maintained memory plus AI-mediated human correction, not direct manual markdown editing.

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
- OpenClaw proposes a memory update through the bridge-hosted `memory` module

When a trigger happens:

1. Kodi starts the memory worker.
2. The worker inspects the new evidence.
3. The worker decides whether the evidence changes durable memory.
4. The worker chooses org scope, member scope, or both.
5. Kodi updates the relevant files and indexes.

Not every event should rewrite memory. The worker should only write when the evidence changes durable context.

## OpenClaw's Role

OpenClaw should remain the reasoning and execution runtime.

Kodi should own:

- durable vault storage
- manifests and indexes
- path metadata
- memory scope authorization
- agent-to-scope registry
- maintenance flows
- Memory UI

OpenClaw should use memory for:

- retrieval
- answering
- planning
- proposing memory updates
- acting with the right user and org context

In short:

- Kodi owns durable memory
- OpenClaw owns reasoning
- every OpenClaw agent gets persistent access to the Kodi memory scopes it is allowed to use

## Delivery Shape

This should be built in complete vertical workstreams.

The main work areas are:

1. Scoped vault foundations
2. Agent identity and persistent memory access
3. Event-driven memory maintenance
4. Structural maintenance
5. Native Memory UI
6. Runtime integration and scheduled upkeep

Each work area should deliver a complete feature surface that teammates can review and build on.

## Summary

Kodi should build memory as scoped markdown vaults with:

- shared org memory
- per-member memory inside each org
- root manifests
- directory indexes
- lightweight metadata
- an OpenClaw agent registry
- a bridge-hosted `memory` module inside the required `kodi-bridge` plugin
- event-driven selective updates
- structural maintenance
- a native vault-browser UI

That gives Kodi durable context that stays concise, respects identity boundaries, and is available whenever OpenClaw reasons.
