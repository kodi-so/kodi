# Kodi Desktop Product Contract

## Scope

Kodi Desktop V1 is a meetings-first desktop client. It is not browser parity and it is not a separate meeting backend.

The desktop app owns native desktop behavior:

- macOS-first runtime, Windows-ready architecture
- tray/menu bar lifecycle
- system-browser sign-in and desktop token exchange
- OS keychain storage for refresh credentials
- Kodi-owned meeting reminder popups
- one-click scheduled Zoom/Google Meet launch
- side-by-side move-aside behavior
- quick local sessions from the app and tray

The shared backend remains the source of truth for:

- auth identity and org membership
- calendar event candidates
- meeting sessions, transcripts, controls, artifacts, and answers
- external meeting orchestration
- local meeting lifecycle and ingest
- preferences, devices, auditability, and telemetry contracts

## V1 Surfaces

In desktop V1:

- Coming up
- Recent meetings
- Resume live session
- Start local session
- Live meeting handoff
- Desktop settings

Browser-only in V1:

- general chat
- integration management
- approvals administration
- billing
- broad workspace administration

## Launch Rules

- Reminders are enabled by default with a one-minute lead time.
- Desktop opens external meeting URLs only after explicit user action.
- Scheduled launch is idempotent through `meeting.startFromScheduledEvent`.
- Unsupported or linkless events fall back to local notes instead of broken join actions.
- Move-aside is enabled by default and configurable.
- Launch-at-login is user-controlled.

## Cross-Project Alignment

The desktop project consumes the same meeting domain as the web app. Local capture uses shared `local_meeting_sessions` and `meeting_sessions`. Calendar discovery writes durable `calendar_event_candidates`; desktop never talks directly to Google Calendar or Outlook.

## Privacy And Telemetry Rules

Desktop telemetry should record operational events, not meeting content:

- reminder shown, opened, dismissed
- scheduled launch success/failure
- auth callback, token refresh, sign-out success/failure
- local session start/pause/resume/end
- update channel, update check result
- crash/error diagnostics with app version and platform

Desktop caches may store preferences, device identity, and non-secret reminder state. Long-lived credentials must stay in OS keychain storage. Meeting content and transcripts remain server-owned.

## Rollout

Rollout is macOS internal first, beta second, stable later. Windows packaging stays visible in CI and build config, but Windows production launch does not block macOS beta quality.
