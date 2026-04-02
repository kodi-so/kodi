# Meeting Intelligence Linear Breakdown

## Project

**Project name**

`Meeting Intelligence Platform: Meet MVP via Recall`

**Working title**

`Meeting Intelligence Platform: Google Meet MVP via Recall + Provider Adapter Foundation`

**Goal**

Enable a workspace-level agent to join meetings, listen in real time, extract notes and tasks, and draft actions against connected tools, starting with Google Meet and expanding to additional providers later.

**Success criteria**

- A connected workspace can get its meeting agent into a Google Meet without manual engineering intervention.
- Recall bot events are normalized into Kodi's meeting domain model.
- Transcript chunks stream into the workspace's OpenClaw runtime in real time.
- OpenClaw produces rolling notes, candidate tasks, and draft actions.
- Users can see clear meeting lifecycle state in Kodi.
- The core architecture supports additional meeting providers without rewriting the ingestion and reasoning pipeline.

## Milestones

### Phase 0: Architecture + Foundation

Milestone focus:

- provider-agnostic meeting domain
- adapter contracts
- persistence and orchestration foundations

### Phase 1: Recall-Powered Google Meet Join + Listen

Milestone focus:

- Recall-backed Google Meet join flow
- transcript and participant ingestion
- live session persistence

### Phase 2: OpenClaw Realtime Intelligence

Milestone focus:

- transcript forwarding
- rolling notes
- candidate tasks
- draft actions

### Phase 3: Discovery + Scheduling + Invite UX

Milestone focus:

- invite-by-email onboarding
- Google Calendar OAuth
- discovery and scheduling

### Phase 4: Review + Approval + Action Drafts

Milestone focus:

- reviewable outputs
- tool draft generation
- approval workflow

### Phase 5: Hardening + Multi-Provider Expansion Readiness

Milestone focus:

- security
- observability
- reliability
- portability

## Epics

### EPIC A: Provider Adapter Abstraction

- Define meeting provider adapter interface
- Implement adapter registry and provider resolution
- Define normalized realtime event schema
- Add provider simulation harness/tests

### EPIC B: Shared Meeting Domain Model + Persistence

- Extend schema for meeting providers, sessions, and source metadata
- Add meeting state model for rolling notes and candidate tasks
- Add ingestion/event append APIs
- Add meeting orchestration service

### EPIC C: Recall.ai Integration

- Add Recall credentials/env contract
- Implement Recall adapter: create bot for Google Meet
- Implement Recall webhook/websocket ingestion
- Persist participant events from Recall
- Persist transcript chunks from Recall
- Recall integration end-to-end test
- Recall failure taxonomy and retries

### EPIC D: Meeting Session Lifecycle + State UI

- Add meeting status state machine
- Build live meeting status card in Kodi
- Build meeting detail realtime console
- Add polling/subscription refresh strategy
- Add admin diagnostics panel

### EPIC E: OpenClaw Realtime Transcript Pipeline

- Define transcript forwarding protocol to OpenClaw
- Stream transcript chunks from meeting ingestion to workspace OpenClaw instance
- Build OpenClaw rolling notes processor
- Build OpenClaw candidate task extractor
- Build OpenClaw draft action generator
- Add transcript backpressure and idempotency handling
- End-to-end intelligence validation

### EPIC F: Google Meet Onboarding: Invite-by-Email

- Define workspace bot identity/email model
- Build invite-by-email setup UX
- Support meeting creation from explicit Meet URL
- Invite-by-email operational flow

### EPIC G: Google Calendar OAuth + Meeting Discovery

- Build Google OAuth/account connection for Calendar access
- Persist connected calendars and org/user ownership
- Build meeting discovery for events with Meet links
- Add auto-join rules
- Build meeting preparation scheduler
- Calendar sync and backfill reliability

### EPIC H: Task Drafting + Tool Action Review

- Persist draft tasks and draft external actions
- Build meeting outputs review UI
- Integrate draft actions with existing tool access layer
- Approval workflow for external writes
- First supported downstream actions

### EPIC I: Reliability, Security, and Observability

- Provider event audit log
- Meeting consent/disclosure UX
- Metrics and alerting
- Security review for Recall + Google OAuth data handling
- Provider portability review

## Full Ticket Breakdown

### EPIC A: Provider Adapter Abstraction

#### A1. Define meeting provider adapter interface

Dependencies:

- none

Acceptance criteria:

- Contract covers join, stop, transcript events, participant events, lifecycle events, and health/state.
- Adapter contract is provider-agnostic and does not mention Recall or Google Meet in core types.

#### A2. Implement adapter registry and provider resolution

Dependencies:

- A1

Acceptance criteria:

- Kodi can select an adapter by provider slug.
- Meeting orchestration code calls the adapter interface only.

#### A3. Define normalized realtime event schema

Dependencies:

- A1

Acceptance criteria:

- Transcript, participant, join, failure, and meeting-ended events map into shared internal event types.
- Schema supports future providers without migration churn.

#### A4. Add provider simulation harness/tests

Dependencies:

- A1
- A3

Acceptance criteria:

- Local/dev harness can replay synthetic provider events into the pipeline.
- Core orchestration is testable without a live provider.

### EPIC B: Shared Meeting Domain Model + Persistence

#### B1. Extend schema for meeting providers, sessions, and source metadata

Dependencies:

- A3

Acceptance criteria:

- Tables support provider, external meeting identity, bot session identity, source payloads, and runtime status.

#### B2. Add meeting state model for rolling notes and candidate tasks

Dependencies:

- B1

Acceptance criteria:

- Live state supports rolling notes, candidate tasks, draft actions, and processing timestamps.

#### B3. Add ingestion/event append APIs

Dependencies:

- B1

Acceptance criteria:

- Internal APIs accept normalized meeting events and transcript chunks.

#### B4. Add meeting orchestration service

Dependencies:

- A2
- B3

Acceptance criteria:

- Service can create/update/end meeting sessions from provider callbacks and internal events.

### EPIC C: Recall.ai Integration

#### C1. Add Recall credentials/env contract

Dependencies:

- none

Acceptance criteria:

- API validates required Recall config.
- Secrets are isolated from provider-agnostic layers.

#### C2. Implement Recall adapter: create bot for Google Meet

Dependencies:

- A1
- C1

Acceptance criteria:

- Kodi can request a bot join using a Meet URL.
- Bot session identity is persisted and associated with a meeting session.

#### C3. Implement Recall webhook/websocket ingestion

Dependencies:

- C2
- A3
- B3

Acceptance criteria:

- Transcript events, participant events, join/leave states, and failure states are ingested in real time.

#### C4. Persist participant events from Recall

Dependencies:

- C3

Acceptance criteria:

- Participant joins/leaves update the meeting session and UI-facing state.

#### C5. Persist transcript chunks from Recall

Dependencies:

- C3

Acceptance criteria:

- Transcript chunks are stored with timestamps, speaker identity when available, and provider source metadata.

#### C6. Recall integration end-to-end test

Dependencies:

- C2
- C3
- C4
- C5

Acceptance criteria:

- A test meeting can produce a joined bot, transcript flow, participant events, and meeting completion state.

#### C7. Recall failure taxonomy and retries

Dependencies:

- C3

Acceptance criteria:

- Lobby denial, bad URL, meeting not started, auth failure, and provider timeout are surfaced as distinct states.

### EPIC D: Meeting Session Lifecycle + State UI

#### D1. Add meeting status state machine

Dependencies:

- B4
- C7

Acceptance criteria:

- Statuses include scheduled, preparing, joining, admitted, listening, processing, failed, ended.

#### D2. Build live meeting status card in Kodi

Dependencies:

- D1

Acceptance criteria:

- Users can see the workspace meeting agent is joining, listening, failed, or ended, with reason text.

#### D3. Build meeting detail realtime console

Dependencies:

- B2
- C4
- C5

Acceptance criteria:

- Users can see transcript stream, participants, provider source, and runtime state.

#### D4. Add polling/subscription refresh strategy

Dependencies:

- D2
- D3

Acceptance criteria:

- UI updates within acceptable latency during live meetings.

#### D5. Add admin diagnostics panel

Dependencies:

- C7
- D2

Acceptance criteria:

- Internal state includes provider event timestamps, bot ID, failure reason, and retry history.

### EPIC E: OpenClaw Realtime Transcript Pipeline

#### E1. Define transcript forwarding protocol to OpenClaw

Dependencies:

- B3

Acceptance criteria:

- Protocol supports ordered transcript chunks, participants, meeting metadata, and lifecycle markers.

#### E2. Stream transcript chunks from meeting ingestion to workspace OpenClaw instance

Dependencies:

- E1
- C5

Acceptance criteria:

- Transcript chunks are delivered to the provisioned org runtime in near real time.

#### E3. Build OpenClaw rolling notes processor

Dependencies:

- E2

Acceptance criteria:

- Runtime outputs rolling notes during the meeting and persists them back to Kodi.

#### E4. Build OpenClaw candidate task extractor

Dependencies:

- E2

Acceptance criteria:

- Runtime outputs candidate tasks with title, owner hint, confidence, and source evidence.

#### E5. Build OpenClaw draft action generator

Dependencies:

- E4

Acceptance criteria:

- Runtime can propose draft actions for connected tools without executing them.

#### E6. Add transcript backpressure and idempotency handling

Dependencies:

- E2

Acceptance criteria:

- Duplicate chunks are handled safely and runtime overload does not corrupt meeting state.

#### E7. End-to-end intelligence validation

Dependencies:

- E3
- E4
- E5
- E6

Acceptance criteria:

- A live meeting produces rolling notes, candidate tasks, and draft actions in a single session.

### EPIC F: Google Meet Onboarding: Invite-by-Email

#### F1. Define workspace bot identity/email model

Dependencies:

- B1

Acceptance criteria:

- Each workspace has a recognizable meeting agent identity and invite instructions.

#### F2. Build invite-by-email setup UX

Dependencies:

- D2

Acceptance criteria:

- Users can copy the bot invite email/address and understand how to invite the meeting agent into a meeting.

#### F3. Support meeting creation from explicit Meet URL

Dependencies:

- C2
- F2

Acceptance criteria:

- A user can paste a Meet link or trigger a join from a manually-invited meeting flow.

#### F4. Invite-by-email operational flow

Dependencies:

- F1
- F2
- F3

Acceptance criteria:

- If the meeting agent is invited to a meeting, Kodi can associate the provider bot session with the correct workspace meeting session.

### EPIC G: Google Calendar OAuth + Meeting Discovery

#### G1. Build Google OAuth/account connection for Calendar access

Dependencies:

- none

Acceptance criteria:

- Users can connect Google accounts and Kodi can read eligible calendar events.

#### G2. Persist connected calendars and org/user ownership

Dependencies:

- G1

Acceptance criteria:

- Kodi knows which user and calendar a meeting came from.

#### G3. Build meeting discovery for events with Meet links

Dependencies:

- G1
- G2

Acceptance criteria:

- Upcoming meetings with Meet URLs are ingested into Kodi.

#### G4. Add auto-join rules

Dependencies:

- G3

Acceptance criteria:

- Users and admins can define which meetings the workspace meeting agent should prepare to join.

#### G5. Build meeting preparation scheduler

Dependencies:

- G4
- C2

Acceptance criteria:

- Kodi can queue bot join attempts around meeting start time.

#### G6. Calendar sync and backfill reliability

Dependencies:

- G3
- G4
- G5

Acceptance criteria:

- New, updated, and cancelled meetings reconcile cleanly.

### EPIC H: Task Drafting + Tool Action Review

#### H1. Persist draft tasks and draft external actions

Dependencies:

- E4
- E5

Acceptance criteria:

- Candidate tasks and actions are stored with source evidence and review status.

#### H2. Build meeting outputs review UI

Dependencies:

- H1

Acceptance criteria:

- Users can review notes, tasks, and draft actions from a meeting.

#### H3. Integrate draft actions with existing tool access layer

Dependencies:

- H1

Acceptance criteria:

- Drafts can target connected tools already available in the workspace.

#### H4. Approval workflow for external writes

Dependencies:

- H3

Acceptance criteria:

- No action executes without explicit approval in the MVP.

#### H5. First supported downstream actions

Dependencies:

- H4

Acceptance criteria:

- At minimum: create Linear ticket, create or update doc draft, post Slack summary draft.

### EPIC I: Reliability, Security, and Observability

#### I1. Provider event audit log

Dependencies:

- B4

Acceptance criteria:

- All provider events and internal state transitions are audit logged.

#### I2. Meeting consent/disclosure UX

Dependencies:

- D2
- F2
- G4

Acceptance criteria:

- Users understand when the meeting agent is joining or listening, and what data is captured.

#### I3. Metrics and alerting

Dependencies:

- C6
- E7

Acceptance criteria:

- Metrics exist for join success, transcript latency, runtime latency, and action generation.

#### I4. Security review for Recall + Google OAuth data handling

Dependencies:

- C1
- G1

Acceptance criteria:

- Data flow, retention, secrets handling, and least-privilege scopes are documented and approved.

#### I5. Provider portability review

Dependencies:

- A2
- C6

Acceptance criteria:

- The team can add a second provider adapter without reworking the core meeting pipeline.

## Suggested Phase Mapping

### Phase 0

- A1
- A2
- A3
- A4
- B1
- B2
- B3
- B4
- C1

### Phase 1

- C2
- C3
- C4
- C5
- C6
- C7
- D1
- D2
- D3
- D4
- D5
- F1
- F2
- F3
- F4

### Phase 2

- E1
- E2
- E3
- E4
- E5
- E6
- E7

### Phase 3

- G1
- G2
- G3
- G4
- G5
- G6

### Phase 4

- H1
- H2
- H3
- H4
- H5

### Phase 5

- I1
- I2
- I3
- I4
- I5

## Critical Dependency Chains

- `A1 -> A2/A3 -> B1/B3 -> C2/C3 -> C4/C5 -> E2 -> E3/E4/E5 -> H1/H3/H4`
- `F1/F2/F3/F4` should ship before Calendar automation becomes mandatory.
- Invite-by-email should prove the core loop before Google Calendar OAuth becomes a blocker.

## Notes

- The existing Linear project should remain the source of execution status.
- This file is the durable in-repo version of the planning structure used to create the Linear project, milestones, and tickets.
