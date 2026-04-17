# Agent Tool Access Auth Contract

Last updated: 2026-04-01

## Purpose

This document is the concrete auth and environment deliverable for Phase 0 ticket `KOD-86`.

It defines:

- which first-wave toolkits use Composio managed auth versus Kodi-owned OAuth apps
- how Kodi should handle connection UX
- which environment variables Phase 1 should wire into the API

## Final Phase 0 decisions

### Composio's role

Composio should be the connected-account and execution substrate for user-linked SaaS tools.

That means:

- users connect their accounts through Composio-backed flows initiated from Kodi
- Composio stores and refreshes the third-party credentials
- Kodi stores only the metadata it needs for UX, policy, and audit

### Kodi's role

Kodi owns:

- the integrations UI
- which toolkits are enabled for the org
- which connected account is selected for a request
- whether a write requires approval
- the audit trail for what the agent proposed and executed

### Connection UX decision

Kodi should manage connections in its own UI rather than relying on in-chat Composio prompts.

Recommended runtime setting:

- `manage_connections_in_chat = false`

Why:

- it keeps the user experience consistent
- it prevents auth prompts from interrupting the agent mid-task
- it keeps connection and approval management in a single trusted surface

## Per-toolkit auth matrix

### Tier 1 / first wave

| Toolkit         | Auth approach         | Phase 0 decision                                                  |
| --------------- | --------------------- | ----------------------------------------------------------------- |
| Gmail           | Custom auth config    | Kodi-owned Google OAuth app via Composio                          |
| Google Calendar | Custom auth config    | Same Google app as Gmail where possible                           |
| Slack           | Custom auth config    | Kodi-owned Slack app via Composio                                 |
| GitHub          | Custom auth config    | Kodi-owned GitHub OAuth app via Composio                          |
| Linear          | Managed auth for beta | Revisit after beta if branding or scope control becomes important |
| Notion          | Managed auth for beta | Revisit after beta if needed                                      |

### Tier 2 / likely next

| Toolkit                      | Auth approach             | Note                                                   |
| ---------------------------- | ------------------------- | ------------------------------------------------------ |
| Jira                         | Likely custom auth config | Enterprise variants and scopes often need more control |
| Google Drive                 | Custom auth config        | Prefer the same Google app family                      |
| HubSpot                      | TBD                       | Decide when it moves into launch consideration         |
| Confluence                   | TBD                       | Likely paired with Jira strategy                       |
| Microsoft Outlook / Calendar | Custom auth config        | High-trust provider and enterprise sensitivity         |

## Why not managed auth for everything

Composio can make many integrations available quickly, but custom auth configs are the recommended production approach for important OAuth toolkits because they give Kodi:

- better consent-screen branding
- dedicated provider quota
- tighter scope control
- clearer incident ownership

Use managed auth only when:

- the toolkit is lower-risk for launch
- the default scopes are acceptable
- we are comfortable revisiting the setup after beta

## Callback and redirect model

When using custom auth configs, provider OAuth apps should point to the Composio callback URL described in their docs.

Composio callback URL:

- `https://backend.composio.dev/api/v3/toolkits/auth/callback`

Kodi should still own:

- the UI action that starts connection
- the post-connection return flow into Kodi
- the internal persistence of connected-account metadata

Recommended Kodi URLs:

- user-facing start point in Kodi settings
- Kodi-side return path such as `/settings/integrations` or a toolkit-specific detail page
- API callback/redirect handlers only if needed for Kodi-local persistence or vendor webhook verification

## Environment contract

Phase 1 should wire the following variables into the API environment.

### Core feature and Composio settings

- `KODI_FEATURE_TOOL_ACCESS`
- `COMPOSIO_API_KEY`
- `COMPOSIO_WEBHOOK_SECRET`
- `COMPOSIO_BASE_URL`
- `COMPOSIO_OAUTH_REDIRECT_URL`
- `COMPOSIO_AUTH_CALLBACK_URL`
- `COMPOSIO_MANAGE_CONNECTIONS_IN_CHAT`

### Auth config ids

- `COMPOSIO_AUTH_CONFIG_GOOGLE`
- `COMPOSIO_AUTH_CONFIG_SLACK`
- `COMPOSIO_AUTH_CONFIG_GITHUB`
- `COMPOSIO_AUTH_CONFIG_LINEAR`
- `COMPOSIO_AUTH_CONFIG_NOTION`

These are optional by environment because some toolkits may use managed auth initially.

### Provider credentials for Kodi-owned OAuth apps

- `GOOGLE_CLIENT_ID`
- `GOOGLE_CLIENT_SECRET`
- `SLACK_CLIENT_ID`
- `SLACK_CLIENT_SECRET`
- `GITHUB_CLIENT_ID`
- `GITHUB_CLIENT_SECRET`

Phase 0 decision:

- document them now
- keep them optional in env validation until the corresponding toolkit is enabled

## Environment ownership

### Development

- may use a subset of first-wave toolkits
- should validate base Composio variables
- may leave some custom auth config ids unset if a toolkit is not being tested locally

### Staging

- should mirror production auth ownership decisions for Tier 1 toolkits
- should test real connection and reconnect flows
- should verify the post-connect return into Kodi

### Production

- should use Kodi-owned OAuth apps for Google, Slack, and GitHub
- should explicitly document which toolkits still rely on managed auth
- should have a clear owner for secret rotation and provider incidents

## Operational ownership

Phase 0 decision:

- product and engineering should know who owns each provider app before Phase 1 implementation begins
- provider secret rotation should be treated as platform work, not hidden setup knowledge
- incidents tied to auth breakage should map to Kodi-owned apps where Kodi chose custom auth

## Questions closed by Phase 0

- Should Kodi rely on Composio for account linking?
  - Yes.
- Should Kodi let the runtime prompt users to connect tools inside chat?
  - No, not by default.
- Should Google, Slack, and GitHub use custom auth configs?
  - Yes.
- Is the Phase 1 env contract now explicit enough to implement?
  - Yes.
