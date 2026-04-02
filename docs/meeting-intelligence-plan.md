# Meeting Intelligence Implementation Plan

## Purpose

This document captures the product and engineering plan for Kodi's meeting intelligence system.

The goal is to let a workspace-level agent join meetings, listen in real time, extract useful outputs, and draft actions against the tools already connected in the workspace.

This starts with Google Meet, but the architecture is intentionally provider-agnostic so Zoom, Teams, and future providers can slot into the same core pipeline.

For the ticket-level planning breakdown, see [meeting-intelligence-linear-plan.md](./meeting-intelligence-linear-plan.md).

## Product Goal

The initial product loop is:

1. A workspace authorizes meeting access.
2. The workspace agent joins a meeting.
3. The system ingests transcript and participant activity in real time.
4. The workspace's OpenClaw runtime turns that stream into rolling notes, candidate tasks, and draft actions.
5. Users review and approve actions before anything writes to external tools.

## MVP Scope

The first shippable version should focus on:

- Google Meet first
- Recall.ai as the meeting transport layer
- Invite-by-email before Calendar automation
- Realtime transcript and participant ingestion
- Rolling notes and task extraction through OpenClaw
- Approval-gated external writes

The MVP should not depend on:

- Native Meet add-ons
- Native Google Meet Media API
- Browser automation
- Autonomous writes to third-party tools

## Core Architectural Decisions

### Provider adapter abstraction

Meeting integrations are a first-class platform layer. The product core should not depend directly on Recall, Google Meet, Zoom, or any other provider-specific implementation detail.

Instead, we should define a shared adapter contract that covers:

- join / prepare / stop
- transcript events
- participant events
- lifecycle and failure events
- health and runtime state

All orchestration, persistence, policy checks, and UI should use the normalized adapter contract rather than provider-specific payloads.

### Recall as adapter one

Recall.ai is the recommended first adapter because it gives us the fastest path to a real product across multiple meeting providers.

That means we can build:

- one internal meeting model
- one transcript ingestion path
- one OpenClaw reasoning pipeline
- one set of review and approval surfaces

without making the rest of the product Google Meet-specific.

Recall should still remain isolated behind the adapter boundary so that:

- native provider integrations can be added later
- provider-specific constraints do not leak into core product logic
- vendor lock-in is reduced

### OpenClaw as the reasoning layer

Kodi should own the orchestration and product layer around meetings, but OpenClaw should remain the intelligence layer.

Realtime transcript chunks should be streamed into the workspace's provisioned OpenClaw runtime, where the runtime is responsible for:

- rolling notes
- inferred meeting state
- candidate tasks
- draft external actions

Kodi should remain responsible for:

- meeting transport and ingestion
- persistence
- workspace policy
- approvals
- action execution
- auditability

### Invite-by-email before Calendar OAuth

The lowest-friction onboarding path should come first.

Before building full calendar discovery, users should be able to invite the workspace agent directly into a meeting through a stable bot identity and associated setup flow.

That proves the core loop faster:

- meeting join
- transcript ingestion
- OpenClaw reasoning
- reviewable outputs

Calendar OAuth and meeting auto-discovery should follow once the core loop is reliable.

## System Model

The internal meeting pipeline should look like this:

`provider adapter -> normalized meeting events -> meeting persistence -> OpenClaw realtime transcript pipeline -> notes/tasks/actions -> review + approval -> external execution`

Key internal entities:

- provider account / provider configuration
- meeting session
- bot session
- participant session
- transcript segments
- live meeting state
- generated tasks
- generated action drafts
- execution approvals

## User Experience Shape

### Admin and setup UX

Workspace admins should be able to:

- enable the meeting provider
- configure the workspace meeting agent identity
- understand what data is captured
- control approval and execution policies

### Initial join UX

The first onboarding path should let users:

- see the workspace meeting bot identity
- invite the bot to a meeting
- confirm join and listening state
- view meeting status in Kodi

### Live meeting UX

During a meeting, the product should surface:

- joining
- admitted
- listening
- failed
- ended

It should also expose live transcript and participant state, either directly in Kodi or via polling/subscription-backed meeting pages.

### Post-meeting UX

After or during a meeting, users should be able to review:

- rolling notes
- candidate tasks
- draft actions
- approval state
- execution history

## Phase Plan

### Phase 0: Architecture + Foundation

Define the normalized meeting domain and adapter architecture, plus the minimal persistence and orchestration layers required to support provider-backed meeting ingestion.

### Phase 1: Recall-Powered Google Meet Join + Listen

Implement the first real meeting adapter using Recall so the workspace agent can join a Meet call, emit transcript and participant events, and persist a live session in Kodi.

### Phase 2: OpenClaw Realtime Intelligence

Wire transcript chunks into the workspace's OpenClaw instance so the runtime can produce rolling notes, candidate tasks, and draft actions from the live meeting stream.

### Phase 3: Discovery + Scheduling + Invite UX

Ship the invite-by-email path first, then add Google Calendar OAuth, meeting discovery, auto-join rules, and scheduling behavior.

### Phase 4: Review + Approval + Action Drafts

Turn extracted outputs into structured, reviewable artifacts connected to existing workspace tools and approvals.

### Phase 5: Hardening + Multi-Provider Expansion Readiness

Improve resilience, observability, security, policy handling, and adapter portability so the same system can support additional meeting providers.

## Epics

- Provider Adapter Abstraction
- Shared Meeting Domain Model + Persistence
- Recall.ai Integration
- Meeting Session Lifecycle + State UI
- OpenClaw Realtime Transcript Pipeline
- Google Meet Onboarding: Invite-by-Email
- Google Calendar OAuth + Meeting Discovery
- Task Drafting + Tool Action Review
- Reliability, Security, and Observability

## Key Risks

### Vendor dependency

Recall is the right execution-first choice, but it becomes part of the critical path. The adapter abstraction needs to be real, not theoretical.

### Consent and trust

Users need a clear model for when the workspace agent is joining, listening, and generating outputs. Ambiguity here will create distrust quickly.

### Realtime pipeline reliability

The product experience depends on low-latency transcript ingestion and robust OpenClaw streaming behavior. Backpressure, retries, and idempotency matter early.

### Scope creep

Calendar automation, native in-meeting surfaces, and autonomous execution are all tempting follow-ons. They should not delay the core join-and-reason loop.

## Success Criteria

We should consider the initial initiative successful when:

- a workspace can get its meeting agent into a Google Meet without engineering intervention
- meeting events are normalized into Kodi's meeting model
- transcript chunks stream into the workspace OpenClaw runtime in near real time
- OpenClaw produces rolling notes and candidate tasks during the meeting
- users can review outputs and approve actions
- the architecture is ready for a second meeting provider without reworking the core pipeline
