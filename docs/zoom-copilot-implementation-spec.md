# Kodi Zoom Copilot Implementation Spec

## Status

Draft v1

## Last Updated

2026-03-29

## Goal

Build the best Zoom copilot for teams using Kodi.

The first shippable outcome is not "AI everywhere." It is:

- A Zoom-native copilot users can invite into meetings
- Real-time meeting awareness with participant and transcript context
- In-meeting question answering and decision capture
- Automatic conversion of meeting outcomes into draft goals, tickets, and tasks
- Safe execution of follow-up work through connected tools with approval and auditability

This spec is intentionally Zoom-first. It establishes the architecture that later adapters for Google Meet and Slack can reuse.

## Why Zoom First

Zoom currently offers an official RTMS SDK for real-time meeting audio, video, and transcript streams, plus webhook-driven stream startup and an in-client Zoom App surface. That makes Zoom the best path to a real copilot experience instead of a post-meeting summary bot.

Relevant official docs:

- RTMS API reference: https://zoom.github.io/rtms/
- RTMS JS docs: https://zoom.github.io/rtms/js/
- Zoom Apps docs: https://developers.zoom.us/docs/zoom-apps/create/
- Zoom Apps context docs: https://developers.zoom.us/docs/zoom-apps/zoom-app-context/

Notes from current docs:

- The RTMS SDK supports real-time audio, video, and transcript streams from Zoom Meetings.
- The Node.js RTMS package supports `darwin-arm64` and `linux-x64`.
- RTMS webhook examples are triggered by `meeting.rtms_started`.
- Mixed audio does not identify the active speaker by itself; the docs recommend `onActiveSpeakerEvent` for speaker attribution.

## Current Kodi Starting Point

Kodi already has three useful primitives:

- Per-org agent runtime provisioning via dedicated OpenClaw instances
- Org-scoped chat relay from the API into each instance
- Basic org activity logging

Relevant code:

- [README.md](/Users/noahmilberger/Documents/kodi/kodi/README.md)
- [apps/api/src/routers/chat/router.ts](/Users/noahmilberger/Documents/kodi/kodi/apps/api/src/routers/chat/router.ts)
- [apps/api/src/routers/instance/cloud-init.ts](/Users/noahmilberger/Documents/kodi/kodi/apps/api/src/routers/instance/cloud-init.ts)
- [packages/db/src/schema/orgs.ts](/Users/noahmilberger/Documents/kodi/kodi/packages/db/src/schema/orgs.ts)
- [packages/db/src/schema/chat.ts](/Users/noahmilberger/Documents/kodi/kodi/packages/db/src/schema/chat.ts)
- [packages/db/src/schema/activity.ts](/Users/noahmilberger/Documents/kodi/kodi/packages/db/src/schema/activity.ts)

What does not exist yet:

- Zoom installation/auth state
- Meeting session persistence
- Transcript/event storage
- Background workers
- Structured work objects
- Tool connections and execution policies
- Real-time copilot state separate from chat history

## Product Principles

1. Zoom-native first

The product should feel present during the meeting, not bolted on afterward.

2. Observe before acting

The agent should listen, summarize, and answer well before it starts creating tickets or running tools.

3. Execution must be governed

Any action outside Kodi must be attributable, reviewable, and usually approved.

4. Structured meeting memory beats raw transcript dumping

The copilot should reason over turns, decisions, unresolved questions, owners, and deadlines rather than replaying a full transcript into the model each time.

5. Reuse across providers

Zoom-specific ingestion should map into a provider-agnostic internal event model.

## User Experience Vision

### During the Meeting

Users can:

- Invite Kodi to a Zoom meeting
- Open a Zoom side panel or Kodi web console
- See live notes, decisions, risks, and action items accumulate
- Ask Kodi questions like "What did we decide about pricing?" or "What are the blockers so far?"
- Ask Kodi to draft tickets or next steps while the meeting is still live

Kodi can:

- Track speaker turns and meeting phases
- Answer with business context from connected tools
- Highlight unclear ownership, contradictions, and unanswered questions
- Suggest follow-up tasks and draft work items

### Immediately After the Meeting

Kodi produces:

- Meeting summary
- Decisions
- Goals and desired outcomes
- Risks and open questions
- Draft tickets/tasks grouped by team or tool
- Recommended follow-through plan

### After Approval

Kodi can:

- Create tickets in Jira/Linear/GitHub
- Post recap to Slack or Zoom Team Chat
- Open work in Kodi and start executing tool-based follow-up tasks

## Recommended Zoom Product Shape

Build the Zoom copilot as three coordinated surfaces:

### 1. Zoom integration backend

Responsible for OAuth, webhooks, RTMS stream handling, meeting lifecycle, and API calls.

### 2. Zoom in-meeting app surface

Responsible for the user-facing live copilot UI inside Zoom.

Recommended v1 capabilities:

- Live notes
- Ask Kodi
- Decisions and action items
- "Draft follow-up" button

### 3. Kodi web companion

Responsible for deeper controls and post-meeting workflows that are cumbersome inside Zoom:

- Approval queue
- Ticket/task review
- Execution run history
- Tool connection management
- Meeting archive

Inference:

The best product experience likely combines RTMS for live media/transcript ingestion with a Zoom App surface for in-meeting UI. Even if the exact Zoom marketplace packaging changes, Kodi should keep these responsibilities logically separate.

## Scope

### In Scope for v1

- Zoom install and org linking
- Zoom meeting attachment and RTMS ingestion
- Live transcript-driven copilot
- Participant awareness and speaker attribution
- In-meeting ask/answer experience
- End-of-meeting artifact extraction
- Draft work creation
- Approval workflow for external actions
- Audit log for all actions

### Explicitly Out of Scope for v1

- Autonomous external writes without approval by default
- Full voice reply synthesis from the agent into the meeting audio stream
- Universal parity with Google Meet and Slack
- Screen content understanding
- Multi-meeting parallel orchestration per org with hard SLA guarantees

## System Overview

```text
Zoom Meeting
  -> Zoom RTMS/webhooks
  -> Kodi Zoom Gateway
  -> Meeting Session Manager
  -> Realtime Context Builder
  -> Org Agent Runtime (OpenClaw instance)
  -> Meeting Artifact Extractor
  -> Approval + Execution Engine
  -> External Tools

Zoom App UI <-> Kodi App/API
Kodi Web App <-> Kodi App/API
```

## Core Capabilities

### Capability 1: Meeting Presence

Kodi must know:

- Which org the meeting belongs to
- Which Zoom account installed the app
- Which meeting is live
- Which participants are present
- Whether Kodi has consent to process the meeting

### Capability 2: Realtime Understanding

Kodi must continuously maintain:

- Rolling transcript
- Speaker turns
- Active agenda and topic shifts
- Decisions made
- Open questions
- Risks/blockers
- Candidate action items

### Capability 3: In-Meeting Assistance

Kodi should support:

- Direct Q&A
- Retrieval against org context
- "What changed?" and "What remains unresolved?" prompts
- Instant drafts for goals, tickets, and tasks

### Capability 4: Follow-Through

Kodi should convert discussion into:

- Goals
- Outcomes
- Decisions
- Action items
- Tickets
- Tasks
- Execution plans

### Capability 5: Safe Execution

Kodi should only create/update external work after policy checks:

- Is the requested tool connected?
- Does the user have authority?
- Does org policy require approval?
- Is the action idempotent?
- Is the exact payload previewable?

## Proposed Service Architecture

### `apps/api`

Keep as the public API/control plane for:

- Zoom install and callback endpoints
- Zoom webhook ingestion
- Meeting queries and commands
- Approval APIs
- Post-meeting artifact APIs

### New service: `apps/zoom-gateway`

Add a dedicated service for RTMS stream handling and meeting orchestration.

Responsibilities:

- Receive `meeting.rtms_started` and related webhook traffic
- Maintain RTMS clients
- Normalize RTMS events into internal meeting events
- Push low-latency meeting state updates
- Feed structured turns into agent prompts
- Handle reconnection, leave, and cleanup

Reasoning:

- RTMS is a long-lived, stateful, event-driven workload
- It should not share the same operational profile as the existing request/response API
- This separation keeps the Hono API simple and reduces blast radius

### New service: `apps/worker`

Add a background worker for:

- Artifact extraction jobs
- Ticket/task creation jobs
- Retry handling
- delayed follow-up tasks
- notification fanout

### Existing per-org OpenClaw instances

Keep these as the org-specific agent/tool execution runtimes.

Recommended role split:

- `apps/zoom-gateway` owns meeting ingestion and low-latency orchestration
- OpenClaw instance owns reasoning against org tools and execution capabilities

## Data Model

Add the following tables in `packages/db`.

### `provider_installations`

Represents an org-level installation of Zoom.

Fields:

- `id`
- `org_id`
- `provider` = `zoom`
- `external_account_id`
- `installer_user_id`
- `status` = `active | revoked | error`
- `access_token_encrypted`
- `refresh_token_encrypted`
- `token_expires_at`
- `scopes`
- `metadata`
- `created_at`
- `updated_at`

### `provider_webhook_endpoints`

Optional storage for app/webhook configuration and validation state.

### `meeting_sessions`

Primary aggregate for a live or completed meeting.

Fields:

- `id`
- `org_id`
- `provider` = `zoom`
- `provider_installation_id`
- `provider_meeting_id`
- `provider_meeting_uuid`
- `host_user_id`
- `scheduled_start_at`
- `actual_start_at`
- `ended_at`
- `status` = `scheduled | joining | live | summarizing | awaiting_approval | executing | completed | failed`
- `title`
- `agenda`
- `language`
- `consent_state`
- `live_summary`
- `final_summary`
- `metadata`
- `created_at`
- `updated_at`

### `meeting_participants`

Fields:

- `id`
- `meeting_session_id`
- `provider_participant_id`
- `display_name`
- `email`
- `joined_at`
- `left_at`
- `is_host`
- `is_internal`
- `user_id` nullable link to Kodi user when resolvable
- `metadata`

### `meeting_events`

Append-only event stream.

Fields:

- `id`
- `meeting_session_id`
- `sequence`
- `event_type`
- `source` = `zoom_webhook | rtms | kodi_ui | agent | worker`
- `payload`
- `occurred_at`

Examples:

- `meeting.started`
- `meeting.ended`
- `participant.joined`
- `participant.left`
- `transcript.segment.received`
- `speaker.changed`
- `copilot.question.asked`
- `copilot.answer.generated`
- `artifact.generated`
- `approval.requested`
- `tool.action.started`
- `tool.action.completed`

### `transcript_segments`

Normalized transcript store.

Fields:

- `id`
- `meeting_session_id`
- `event_id`
- `speaker_participant_id`
- `speaker_name`
- `content`
- `start_offset_ms`
- `end_offset_ms`
- `confidence`
- `is_partial`
- `source`
- `created_at`

### `meeting_state_snapshots`

Materialized rolling state for fast UI and prompt construction.

Fields:

- `id`
- `meeting_session_id`
- `summary`
- `active_topics`
- `decisions`
- `open_questions`
- `risks`
- `candidate_action_items`
- `last_event_sequence`
- `created_at`

### `meeting_artifacts`

Post-meeting outputs.

Fields:

- `id`
- `meeting_session_id`
- `artifact_type`
- `title`
- `content`
- `structured_data`
- `status`
- `created_by`
- `created_at`

Artifact types:

- `summary`
- `decision_log`
- `goals`
- `action_items`
- `draft_ticket_batch`
- `execution_plan`

### `work_items`

Provider-agnostic work objects.

Fields:

- `id`
- `org_id`
- `meeting_session_id`
- `source_artifact_id`
- `kind` = `goal | outcome | task | ticket | follow_up`
- `title`
- `description`
- `owner_user_id`
- `status` = `draft | approved | synced | executing | done | cancelled | failed`
- `priority`
- `due_at`
- `external_system`
- `external_id`
- `metadata`
- `created_at`
- `updated_at`

### `tool_connections`

Per-org external tool auth/config records.

### `tool_action_runs`

Tracks all external writes and agent executions.

Fields:

- `id`
- `org_id`
- `meeting_session_id`
- `work_item_id`
- `tool`
- `action`
- `status`
- `request_payload`
- `response_payload`
- `error`
- `started_at`
- `completed_at`

### `approval_requests`

Fields:

- `id`
- `org_id`
- `meeting_session_id`
- `requested_by`
- `approval_type`
- `subject_type`
- `subject_id`
- `status` = `pending | approved | rejected | expired`
- `preview_payload`
- `decided_by`
- `decided_at`
- `created_at`

## Internal Domain Model

Kodi should not let raw provider payloads leak through the app.

Normalize into the following internal concepts:

- `ConferenceInstallation`
- `MeetingSession`
- `Participant`
- `MeetingTurn`
- `MeetingState`
- `MeetingArtifact`
- `WorkItem`
- `ApprovalRequest`
- `ToolActionRun`

## Event Flow

### Live Meeting Flow

1. Zoom app is installed and linked to an org.
2. Zoom sends RTMS-related webhook when a stream becomes available.
3. `apps/zoom-gateway` validates the webhook and joins the RTMS stream.
4. Gateway emits normalized meeting lifecycle events into `meeting_events`.
5. Transcript and speaker events are appended and grouped into meaningful turns.
6. A realtime state builder continuously updates `meeting_state_snapshots`.
7. When a user asks Kodi a question, the prompt is built from:
   - current meeting state
   - recent relevant transcript turns
   - org context/tool retrieval
8. Response is returned to Zoom UI and Kodi web UI.
9. Draft artifacts are generated incrementally during the meeting.

### End-of-Meeting Flow

1. Meeting end event is observed.
2. Session moves to `summarizing`.
3. Worker generates final artifact set.
4. Candidate work items are created as `draft`.
5. Required approvals are requested.
6. Approved actions execute through org tool connections or OpenClaw.
7. Activity and audit logs are written.

## Realtime Processing Pipeline

### Input Sources

- Zoom RTMS transcript stream
- Zoom RTMS audio stream
- Zoom participant/session events
- Zoom App UI user prompts
- Kodi web UI user prompts

### Pipeline Stages

#### Stage 1: Ingest

Validate and persist raw-enough normalized events.

#### Stage 2: Turn Builder

Merge segments into speaker turns.

Rules:

- Combine adjacent transcript segments from the same speaker within a short silence window
- mark turns as partial until stabilized
- close turns when speaker changes or silence threshold passes

#### Stage 3: Meeting State Builder

Continuously maintain:

- Current topic
- Decision candidates
- Open questions
- Proposed owners and due dates
- Risks/blockers
- Follow-up candidates

#### Stage 4: Copilot Prompt Builder

Build prompts from:

- compressed meeting state
- last 10-20 important turns
- tool retrieval results
- org/project context
- explicit user intent

#### Stage 5: Artifact Extractor

Run a higher-latency, higher-quality pass for:

- final summary
- decision log
- action-item extraction
- ticket/task drafting

## Prompting and Reasoning Strategy

Do not feed the full transcript to the model on every request.

Use a layered prompt architecture:

### Layer 1: Persistent system instructions

Kodi behavior in meetings:

- concise
- collaborative
- action-oriented
- uncertainty-aware
- explicit about assumptions

### Layer 2: Org context

- company/tool context
- connected system summaries
- user/team preferences

### Layer 3: Meeting state snapshot

- current agenda
- active participants
- decisions so far
- open questions
- unresolved risks

### Layer 4: Relevant turn excerpts

Select only the most relevant recent turns plus any referenced earlier turns.

### Layer 5: User request

Examples:

- "What have we decided so far?"
- "Turn the next steps into Linear tickets"
- "What blockers did engineering raise?"

## Retrieval Strategy

The copilot will be strongest when it can combine live meeting context with org context.

Recommended retrieval categories:

- prior meetings for this org/project
- project docs
- tickets/issues
- CRM/customer context
- code or deployment context where appropriate

Prompt policy:

- Meeting-local state always wins for "what was said"
- external retrieval augments but does not overwrite meeting facts
- when conflict exists, Kodi should surface the discrepancy

## Tool Execution Policy

Every tool action must declare:

- actor
- source meeting
- user intent or policy trigger
- exact payload
- approval requirement
- idempotency key

Default v1 policy:

- Reads allowed without approval if connection exists and user has access
- Draft object creation inside Kodi allowed without approval
- Writes to external systems require approval unless an org admin enables trusted automation for specific action classes

## Security and Privacy Requirements

### Consent

The product must make meeting processing explicit.

Minimum requirements:

- visible notice that Kodi is active in the meeting
- installation/admin consent at org level
- meeting-level host/user consent where required by Zoom policy
- stored record of consent state per meeting

### Data protection

- Encrypt Zoom tokens at rest
- Encrypt sensitive provider metadata where appropriate
- Minimize raw media retention
- Retain transcript and artifacts according to org policy

### Auditability

All important actions must be reconstructible:

- who asked
- what Kodi observed
- what Kodi proposed
- what was approved
- what external action ran
- what result came back

### Isolation

- strict org scoping at query and execution layers
- no cross-org model context bleed
- no use of one org's tool credentials for another org

## Reliability Requirements

### Session resilience

- reconnect RTMS clients on transient failures
- tolerate duplicated webhook deliveries
- dedupe provider events
- resume meeting state from persisted events

### Latency targets

Targets for v1:

- live transcript visible within 2-5 seconds of utterance
- basic ask-Kodi response within 3-8 seconds
- final artifact generation within 1-5 minutes after meeting end

### Degradation modes

If transcript quality drops or RTMS disconnects:

- continue meeting state from last known stable turns
- notify user that live capture is degraded
- fall back to partial post-meeting artifact generation where possible

## Recommended API Additions

Add routers or route groups for:

### `zoom`

- `zoom.getInstallUrl`
- `zoom.oauthCallback`
- `zoom.getInstallationStatus`
- `zoom.disconnect`
- `zoom.handleWebhook`

### `meeting`

- `meeting.list`
- `meeting.getById`
- `meeting.getLiveState`
- `meeting.askCopilot`
- `meeting.getArtifacts`
- `meeting.createDraftTasks`
- `meeting.approveAction`
- `meeting.rejectAction`

### `toolConnections`

- `toolConnections.list`
- `toolConnections.connect`
- `toolConnections.disconnect`
- `toolConnections.test`

### `work`

- `work.list`
- `work.get`
- `work.approveBatch`
- `work.execute`

## Zoom Gateway Interface

The new `apps/zoom-gateway` service should expose internal endpoints only.

Examples:

- `POST /internal/zoom/webhook`
- `POST /internal/meetings/:id/ask`
- `GET /internal/meetings/:id/state`
- `POST /internal/meetings/:id/end`

Internally it should publish domain events such as:

- `MeetingStarted`
- `ParticipantJoined`
- `TranscriptTurnCommitted`
- `MeetingStateUpdated`
- `MeetingEnded`
- `ArtifactsReady`

## UI Surfaces

### Zoom In-Meeting UI

Sections:

- Live notes
- Ask Kodi
- Decisions
- Action items
- Draft follow-up

Interaction design:

- Bias toward glanceable updates
- make changes obvious as they happen
- allow quick correction like "That is not a decision" or "Assign this to Sarah"

### Kodi Web App

Add pages or sections for:

- Meetings list
- Meeting detail
- Live meeting console
- Approval queue
- Work drafts generated from meetings

## Suggested Repo Changes

### New packages or apps

- `apps/zoom-gateway`
- `apps/worker`
- `packages/conferencing` for provider-agnostic meeting domain types and adapters

### New schema files

- `packages/db/src/schema/provider-installations.ts`
- `packages/db/src/schema/meetings.ts`
- `packages/db/src/schema/work-items.ts`
- `packages/db/src/schema/tool-connections.ts`
- `packages/db/src/schema/approvals.ts`

### New API routers

- `apps/api/src/routers/zoom/router.ts`
- `apps/api/src/routers/meeting/router.ts`
- `apps/api/src/routers/work/router.ts`
- `apps/api/src/routers/tool-connections/router.ts`

## Delivery Plan

### Phase 0: Foundations

Ship:

- DB schema for installations, meetings, transcripts, artifacts, work items, approvals
- token encryption helpers extended for provider credentials
- basic meeting and work routers
- feature flags for Zoom copilot

Exit criteria:

- Org can store a Zoom installation
- meeting session records can be created and queried

### Phase 1: Zoom install and meeting ingestion

Ship:

- Zoom OAuth install flow
- Zoom webhook endpoint with validation
- `apps/zoom-gateway`
- RTMS stream join and leave handling
- normalized meeting event persistence
- basic live transcript UI in Kodi web app

Exit criteria:

- Kodi can attach to a live Zoom meeting and persist transcript segments and participants

### Phase 2: Live copilot

Ship:

- realtime meeting state builder
- ask-Kodi during meeting
- live notes, decisions, and risks panel
- meeting artifact drafting during the call

Exit criteria:

- users can ask meaningful questions during a live meeting and get context-aware answers

### Phase 3: Follow-through drafts

Ship:

- final summary generator
- action item extraction
- draft goals/tickets/tasks
- meeting detail page and review flow

Exit criteria:

- every completed meeting can produce structured outputs usable by the team

### Phase 4: Approval and execution

Ship:

- approval queue
- tool connection framework
- first write integrations
- execution audit trail

Suggested first write targets:

- Linear
- GitHub Issues
- Slack recap posting

Exit criteria:

- approved drafts can be created in external tools reliably and audibly

### Phase 5: Zoom-native polish

Ship:

- richer Zoom in-client UI
- better participant resolution
- trust and correction affordances
- meeting templates by function

Examples:

- sales call mode
- weekly team sync mode
- incident review mode
- product planning mode

## Executable Phases and Tickets

This section is the implementation backlog shape the team should execute against.

Each phase below is intended to map cleanly to a Linear milestone, with the tickets under it created as individual issues.

### Phase 0: Foundations

Goal:

Create the shared schema, API, and configuration foundation needed before Zoom can be attached to live meetings.

Tickets:

- `Phase 0.1` Define conferencing and work schemas in `packages/db`
- `Phase 0.2` Extend encrypted credential storage for provider installs and tool connections
- `Phase 0.3` Add initial `zoom`, `meeting`, and `work` API routers plus feature flags
- `Phase 0.4` Define Zoom app configuration, environment contract, and install prerequisites

### Phase 1: Zoom Install and Ingestion

Goal:

Make Kodi installable in Zoom and persist live meeting/session/transcript data end to end.

Tickets:

- `Phase 1.1` Implement Zoom OAuth install, callback, and org mapping flow
- `Phase 1.2` Add Zoom webhook validation and RTMS start event ingestion
- `Phase 1.3` Bootstrap `apps/zoom-gateway` with RTMS client lifecycle management
- `Phase 1.4` Persist meeting sessions, participants, transcript segments, and meeting events
- `Phase 1.5` Build a basic Kodi live meeting console with transcript and participant presence

### Phase 2: Live Copilot

Goal:

Turn raw meeting data into a useful in-meeting copilot with live reasoning and interaction.

Tickets:

- `Phase 2.1` Build transcript turn construction and speaker attribution pipeline
- `Phase 2.2` Implement realtime meeting state snapshots and context compression
- `Phase 2.3` Add live Ask Kodi question answering against meeting state and org context
- `Phase 2.4` Build live notes, decisions, risks, and action items UI
- `Phase 2.5` Add RTMS reliability, replay, dedupe, and health instrumentation

### Phase 3: Follow-through Drafts

Goal:

Generate high-quality post-meeting artifacts and structured work drafts that the team can review.

Tickets:

- `Phase 3.1` Generate final meeting summary, decision log, and action item artifacts
- `Phase 3.2` Convert meeting artifacts into draft goals, tickets, and tasks
- `Phase 3.3` Build meetings list, meeting detail, and artifact review flow in Kodi
- `Phase 3.4` Add artifact correction and override UX for decisions, owners, and due dates

### Phase 4: Approval and Execution

Goal:

Safely turn approved drafts into real work across connected systems.

Tickets:

- `Phase 4.1` Implement approval requests model and approval queue UI
- `Phase 4.2` Build tool connection framework and execution policy enforcement
- `Phase 4.3` Implement approved draft sync to Linear
- `Phase 4.4` Implement approved draft sync to GitHub Issues and Slack/Zoom recap delivery
- `Phase 4.5` Add execution audit trail, idempotency, retries, and operator visibility

### Phase 5: Zoom-native Polish

Goal:

Polish the product into a trustworthy, Zoom-native copilot that feels great to use.

Tickets:

- `Phase 5.1` Build Zoom in-client side panel experience for live copilot workflows
- `Phase 5.2` Improve participant identity resolution and internal/external user mapping
- `Phase 5.3` Add meeting templates and copilot modes by workflow type
- `Phase 5.4` Ship consent, retention, trust, and admin policy controls

## Backlog by Workstream

### Workstream A: Platform and auth

- Design Zoom install flow
- implement token refresh lifecycle
- build webhook validation
- map Zoom account install to Kodi org
- admin UI for installation health

### Workstream B: Meeting domain

- create meeting schema
- define event types
- build transcript segment and turn logic
- build meeting state snapshots
- create meeting detail APIs

### Workstream C: RTMS gateway

- bootstrap dedicated gateway service
- add RTMS client manager
- handle duplicate and late events
- implement speaker attribution strategy
- add heartbeat and health metrics

### Workstream D: Copilot intelligence

- define meeting system prompt
- build context compressor
- build question-answer flow
- implement decision/action extraction
- implement final artifact synthesis

### Workstream E: Work conversion

- define work item schema
- build draft generator
- add approval model
- add external write engine
- add idempotency and retry logic

### Workstream F: UX

- Kodi meetings list and detail pages
- live web console
- approval queue UI
- Zoom side panel UI
- correction and override affordances

### Workstream G: Security and trust

- consent copy and logging
- retention controls
- audit log extensions
- org policy settings
- incident response playbook

## Success Metrics

### Adoption

- percent of installed orgs that run at least one live Kodi-assisted Zoom meeting per week
- average meetings assisted per active org

### In-meeting value

- ask-Kodi usage per meeting
- percent of meetings with at least one accepted decision or action item
- user-rated answer quality

### Follow-through value

- percent of meetings that produce approved work items
- percent of approved work items successfully synced to tools
- time from meeting end to approved follow-up package

### Trust

- correction rate on extracted decisions/action items
- approval rejection rate
- user-reported confidence score

## Open Questions

These should be resolved before build kickoff:

1. Do we require Kodi to appear as a visible participant in the meeting, or is background copilot presence sufficient for v1?
2. Do we want Zoom-side UI in the first launch, or is Kodi web companion plus RTMS enough to validate value?
3. Which external tools are first-class for write actions: Linear, GitHub, Slack, Jira, Notion?
4. What is the default retention policy for transcripts and artifacts?
5. Should meetings for personal orgs behave differently than meetings for multi-user orgs?
6. Do we want one copilot persona for all meetings, or meeting templates by function from day one?

## Recommended First Milestone

If the team wants the fastest path to a genuinely impressive demo and usable product, build this exact slice first:

- Zoom install
- RTMS webhook ingestion
- live transcript and participant capture
- Kodi live meeting page in the web app
- ask-Kodi against live meeting state
- end-of-meeting summary, decisions, and draft action items

Do not start with external task creation. Start with meeting intelligence quality first.

## Recommendation Summary

The best Zoom copilot for Kodi is not just a summarizer. It is a meeting operating system:

- present during the call
- aware of who said what
- grounded in org context
- opinionated about decisions and follow-through
- safe when acting across tools

The architecture should therefore separate:

- Zoom ingestion
- meeting state management
- agent reasoning
- follow-through execution

That separation will make the Zoom product great now and make Meet and Slack adapters much easier later.
