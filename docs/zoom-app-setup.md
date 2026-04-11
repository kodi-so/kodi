# Zoom Pilot Setup Contract

This document defines the production-facing setup contract for the Phase 0 and
Phase 1 Kodi Zoom copilot path.

## Goal

Establish the environment contract, OAuth and webhook assumptions, Recall
transport prerequisites, and pilot go or no-go checks required before Kodi is
used as a visible Zoom copilot in real meetings.

## Production Path

- Zoom is the meeting surface and workspace installation.
- Recall is the production transport for join, participant presence, transcript
  delivery, meeting chat, and voice output.
- Kodi owns the meeting runtime, meeting state, reasoning pipeline, policy, and
  approvals.
- Native RTMS or `apps/zoom-gateway` work is not part of the pilot launch path.

## Required Environment Variables

API settings live in `apps/api/.env` and remain optional until the Zoom copilot
feature is enabled.

Feature flags:

- `KODI_FEATURE_ZOOM_COPILOT`
- `KODI_FEATURE_MEETING_INTELLIGENCE`

Recall transport:

- `RECALL_API_KEY`
- `RECALL_API_REGION` or `RECALL_API_BASE_URL`
- `RECALL_REALTIME_WEBHOOK_URL` recommended when Kodi ingests bot events
- `RECALL_REALTIME_AUTH_TOKEN` recommended for internal webhook auth
- `RECALL_WEBHOOK_SECRET` recommended
- `RECALL_BOT_STATUS_WEBHOOK_SECRET` recommended

Zoom installation and callbacks:

- `ZOOM_CLIENT_ID`
- `ZOOM_CLIENT_SECRET`
- `ZOOM_WEBHOOK_SECRET`
- `ZOOM_REDIRECT_URI`
- `ZOOM_APP_ID`
- `ZOOM_ACCOUNT_ID` optional

Shared meeting runtime:

- `MEETING_INTERNAL_TOKEN` recommended for internal meeting callbacks

## OAuth and Webhook Contract

- OAuth callback terminates at the API service.
- `ZOOM_REDIRECT_URI` points to the Zoom OAuth callback route exposed by the
  API.
- Zoom webhook delivery targets the API service and is validated with
  `ZOOM_WEBHOOK_SECRET`.
- Recall bot and realtime events target the API service and should be protected
  by the configured Recall auth token and webhook secrets.
- Zoom app scopes must support the visible meeting participant flow Kodi uses,
  including the ZAK scope when the workspace needs signed-in bot joins.

## Workspace Install Prerequisites

- Create the Zoom app Kodi will use for workspace installs.
- Enable OAuth and register both development and production redirect URIs.
- Configure webhook delivery and store the secret in the API environment.
- Confirm the Zoom app has the scopes and event subscriptions needed for
  meeting lifecycle callbacks and signed-in bot support.
- Connect the Zoom account at the workspace level from the Meetings page in
  Kodi.

## Pilot Go Or No-Go Checklist

- Recall credentials are present and the target region or API base URL is
  configured.
- Zoom OAuth and webhook settings are configured in the API environment.
- The workspace has a connected Zoom installation.
- The workspace installation has the ZAK scope before depending on
  sign-in-required meetings.
- A real Zoom validation call has confirmed waiting-room admission, recording
  or transcription consent handling, and the operator guidance shown in product.
- The workspace has reviewed the default participation mode, disclosure
  behavior, and transcript or artifact retention settings before inviting Kodi
  into external meetings.

## Product Notes

- `meeting.getCopilotSettings` is the current Phase 0 control-plane entrypoint
  for workspace meeting identity, participation defaults, retention defaults,
  and the pilot checklist.
- `zoom.getInstallStatus` remains the Zoom-specific install and scope status
  entrypoint.
- The Meetings page is the operational home for Zoom installation, meeting
  start, and pilot readiness checks.
