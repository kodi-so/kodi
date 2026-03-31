# Zoom App Setup Contract

This document defines the setup contract for the Kodi Zoom copilot integration through Phase 1.

## Goal

Establish the environment, callback, webhook, and RTMS gateway prerequisites needed to run the full Zoom install and live transcript ingestion flow.

## Required Environment Variables

API settings live in `apps/api/.env` and are optional until the Zoom copilot feature is enabled.

- `KODI_FEATURE_ZOOM_COPILOT`
- `ZOOM_CLIENT_ID`
- `ZOOM_CLIENT_SECRET`
- `ZOOM_WEBHOOK_SECRET`
- `ZOOM_REDIRECT_URI`
- `ZOOM_APP_ID`
- `ZOOM_ACCOUNT_ID` optional
- `ZOOM_GATEWAY_URL`
- `ZOOM_GATEWAY_INTERNAL_TOKEN` recommended

Gateway settings live in `apps/zoom-gateway/.env`.

- `API_URL`
- `ZOOM_GATEWAY_INTERNAL_TOKEN`
- `ZOOM_GATEWAY_POLL_INTERVAL_MS`
- `ZOOM_GATEWAY_JOIN_TIMEOUT_MS`
- `ZOOM_GATEWAY_MAX_RETRIES`
- `ZOOM_GATEWAY_RETRY_DELAY_MS`
- `ZM_RTMS_CLIENT` optional if Zoom webhook payload does not include a signature
- `ZM_RTMS_SECRET` optional if Zoom webhook payload does not include a signature
- `ZM_RTMS_CA` optional
- `ZM_RTMS_LOG_ENABLED`
- `ZM_RTMS_LOG_LEVEL`
- `ZM_RTMS_LOG_FORMAT`

## Callback and Webhook Contract

- OAuth callback should terminate at the API service.
- `ZOOM_REDIRECT_URI` should point to the future OAuth callback route.
- Webhook delivery should target the API service and use `ZOOM_WEBHOOK_SECRET` for validation.
- RTMS-related meeting events should be enabled in the Zoom app configuration.
- `meeting.rtms_started` must reach the API so it can hand the join payload to `apps/zoom-gateway`.

## Install Prerequisites

- Create a Zoom app for Kodi.
- Enable OAuth for the app.
- Register the production and development redirect URIs.
- Configure webhook delivery and save the secret in the API environment.
- Confirm the Zoom app has the scopes and event subscriptions needed for meeting presence and RTMS-driven session startup.
- Run the `apps/zoom-gateway` service on Node so the native RTMS SDK can load.

## Implementation Notes

- The API exposes `zoom.getInstallStatus` as the current control-plane status entrypoint.
- Feature gating should keep Zoom functionality off until the app is configured.
- The full install and callback flow is implemented in Phase 1.
- Real transcript ingestion depends on the RTMS gateway successfully joining the stream after `meeting.rtms_started`.
