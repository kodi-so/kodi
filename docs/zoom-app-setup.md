# Zoom App Setup Contract

This document defines the Kodi Phase 0 setup contract for the Zoom copilot integration.

## Goal

Establish the environment, callback, and webhook prerequisites needed before implementing the full Zoom install and RTMS ingestion flow.

## Required Environment Variables

These live in `apps/api/.env` and are optional until the Zoom copilot feature is enabled.

- `KODI_FEATURE_ZOOM_COPILOT`
- `ZOOM_CLIENT_ID`
- `ZOOM_CLIENT_SECRET`
- `ZOOM_WEBHOOK_SECRET`
- `ZOOM_REDIRECT_URI`
- `ZOOM_APP_ID`
- `ZOOM_ACCOUNT_ID` optional

## Callback and Webhook Contract

- OAuth callback should terminate at the API service.
- `ZOOM_REDIRECT_URI` should point to the future OAuth callback route.
- Webhook delivery should target the API service and use `ZOOM_WEBHOOK_SECRET` for validation.
- RTMS-related meeting events should be enabled in the Zoom app configuration before Phase 1 work starts.

## Install Prerequisites

- Create a Zoom app for Kodi.
- Enable OAuth for the app.
- Register the production and development redirect URIs.
- Configure webhook delivery and save the secret in the API environment.
- Confirm the Zoom app has the scopes and event subscriptions needed for meeting presence and RTMS-driven session startup.

## Implementation Notes

- The API exposes `zoom.getInstallStatus` as the current control-plane status entrypoint.
- Feature gating should keep Zoom functionality off until the app is configured.
- The full install and callback flow is implemented in Phase 1.
