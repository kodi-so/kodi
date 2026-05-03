# OpenClaw Bridge — Infrastructure & Env Reference

This file documents the env vars, AWS resources, and external integrations the
`kodi-bridge` plugin and its Kodi-side counterparts depend on. It's the
counterpart to `architecture-plan.md` for ops / deploy.

## Composio (Kodi side, KOD-388)

The Kodi API uses one master Composio API key + one webhook subscription per
environment. Per-user identity is just the Kodi `user_id` passed as the
Composio `userId` parameter; we don't issue per-user API keys.

### Required

- `COMPOSIO_API_KEY` — master API key. Used for `tools.list`, action
  execution, OAuth-config provisioning, webhook verification. Without it
  the agent loadout builder degrades to `composio_status: 'failed'` and
  no tools are exposed to the agent.

### OAuth + webhooks

- `COMPOSIO_BASE_URL` — overrides the default `https://backend.composio.dev`
  (only set in non-prod or when sharding is in play).
- `COMPOSIO_OAUTH_REDIRECT_URL` / `COMPOSIO_AUTH_CALLBACK_URL` — the URL
  Composio redirects users back to after OAuth. Falls back to
  `${APP_URL}/integrations` when neither is set.
- `COMPOSIO_WEBHOOK_SECRET` — signing secret for inbound Composio
  webhooks at `/integrations/composio/webhook`. KOD-386's rotation
  triggers fire from this handler.

### Per-toolkit auth configs

These hold the Composio-side auth-config IDs Kodi created for our own OAuth
apps. Optional — toolkits without a configured ID fall back to Composio-managed
auth where available. If a toolkit needs custom auth and no ID is set, the
`createConnectLink` mutation surfaces a clear error.

- `COMPOSIO_AUTH_CONFIG_GOOGLE`
- `COMPOSIO_AUTH_CONFIG_SLACK`
- `COMPOSIO_AUTH_CONFIG_GITHUB`
- `COMPOSIO_AUTH_CONFIG_LINEAR`
- `COMPOSIO_AUTH_CONFIG_NOTION`

### Session defaults

- `COMPOSIO_SESSION_DEFAULT_TOOLKITS` — comma-separated toolkit slugs.
  When an org has no `toolkit_policies` rows yet, the agent loadout
  builder uses this list as the default allowlist (intersected with
  whatever the user has actually connected). Once an admin saves any
  policy, the org-level table takes over and this default is ignored.

  Empty / unset preserves the legacy "every active connection is enabled"
  behavior, so existing environments don't change behavior unless the
  variable is explicitly set.

  Example: `COMPOSIO_SESSION_DEFAULT_TOOLKITS=gmail,slack,googlecalendar`

### Behavior matrix

| Org has policy rows | Env default set | Effective allowlist |
|---|---|---|
| Yes | (any) | ACTIVE connections ∩ policies-where-`enabled=true` |
| No | Yes | ACTIVE connections ∩ env default |
| No | No / empty | ACTIVE connections (everything) |

## Plugin bundle distribution

- `PLUGIN_BUNDLE_S3_BUCKET` — private S3 bucket holding `kodi-bridge` plugin
  bundles. Object key convention: `bundles/<version>/kodi-bridge.tgz`.
- `PLUGIN_BUNDLE_S3_REGION` — AWS region for the bucket.
- `PLUGIN_BUNDLE_URL_TTL_SECONDS` — TTL for signed download URLs handed
  to instances. Default 600.

Provisioning of the bucket itself is tracked in KOD-357 and is owned by
the infra ticket; this document covers the env-side wiring only.

## Plugin-instance HMAC

Per-instance shared secret used to sign:

- Outbound (plugin → Kodi): event ingest at `/api/openclaw/events`,
  reconcile fetch at `/api/openclaw/agents`, etc.
- Inbound (Kodi → plugin): admin reload, agent provision/deprovision,
  subscription updates.

The secret is generated at instance provisioning time, stored encrypted
in `instances.plugin_hmac_secret_encrypted`, and baked into cloud-init.
Rotation lives in KOD-412 (M8) and is out of scope here.
