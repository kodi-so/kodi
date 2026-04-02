import { z } from 'zod'

function envBoolean(name: string) {
  return z.preprocess(
    (value) => {
      if (typeof value === 'boolean') return value

      if (typeof value === 'string') {
        const normalized = value.trim().toLowerCase()
        if (normalized === 'true') return true
        if (normalized === 'false') return false
      }

      return value
    },
    z.boolean({ invalid_type_error: `${name} must be "true" or "false".` })
  )
}

const envSchema = z.object({
  // ── Required now ──────────────────────────────────────────────────────────

  // Database
  DATABASE_URL: z.string().url(),

  // Auth
  BETTER_AUTH_URL: z.string().url(),
  BETTER_AUTH_SECRET: z.string().min(32),

  // Encryption (generate: openssl rand -hex 32)
  ENCRYPTION_KEY: z
    .string()
    .length(64, 'ENCRYPTION_KEY must be 64 hex chars (32 bytes)'),

  // Feature flags
  KODI_FEATURE_ZOOM_COPILOT: envBoolean('KODI_FEATURE_ZOOM_COPILOT').default(
    false
  ),
  KODI_FEATURE_TOOL_ACCESS: envBoolean('KODI_FEATURE_TOOL_ACCESS').default(
    false
  ),

  // ── Required in Phase 1 (Zoom copilot) ───────────────────────────────────

  // Zoom
  ZOOM_CLIENT_ID: z.string().optional(),
  ZOOM_CLIENT_SECRET: z.string().optional(),
  ZOOM_WEBHOOK_SECRET: z.string().optional(),
  ZOOM_REDIRECT_URI: z.string().url().optional(),
  ZOOM_APP_ID: z.string().optional(),
  ZOOM_ACCOUNT_ID: z.string().optional(),
  ZOOM_GATEWAY_URL: z.string().url().optional(),
  ZOOM_GATEWAY_INTERNAL_TOKEN: z.string().optional(),
  MEETING_INTERNAL_TOKEN: z.string().optional(),

  // Composio tool access
  COMPOSIO_API_KEY: z.string().optional(),
  COMPOSIO_WEBHOOK_SECRET: z.string().optional(),
  COMPOSIO_BASE_URL: z.string().url().optional(),
  COMPOSIO_OAUTH_REDIRECT_URL: z.string().url().optional(),
  COMPOSIO_AUTH_CALLBACK_URL: z.string().url().optional(),
  COMPOSIO_MANAGE_CONNECTIONS_IN_CHAT: envBoolean(
    'COMPOSIO_MANAGE_CONNECTIONS_IN_CHAT'
  ).default(false),
  COMPOSIO_AUTH_CONFIG_GOOGLE: z.string().optional(),
  COMPOSIO_AUTH_CONFIG_SLACK: z.string().optional(),
  COMPOSIO_AUTH_CONFIG_GITHUB: z.string().optional(),
  COMPOSIO_AUTH_CONFIG_LINEAR: z.string().optional(),
  COMPOSIO_AUTH_CONFIG_NOTION: z.string().optional(),

  // Optional provider credentials for Kodi-owned OAuth apps used via
  // Composio custom auth configs. These remain optional until the
  // corresponding toolkit is enabled in a given environment.
  GOOGLE_CLIENT_ID: z.string().optional(),
  GOOGLE_CLIENT_SECRET: z.string().optional(),
  SLACK_CLIENT_ID: z.string().optional(),
  SLACK_CLIENT_SECRET: z.string().optional(),
  GITHUB_CLIENT_ID: z.string().optional(),
  GITHUB_CLIENT_SECRET: z.string().optional(),

  // ── Required in Phase 1 (provisioning) ────────────────────────────────────

  // AWS
  AWS_ACCESS_KEY_ID: z.string().optional(),
  AWS_SECRET_ACCESS_KEY: z.string().optional(),
  AWS_REGION: z.string().default('us-east-1'),
  AWS_SECURITY_GROUP_ID: z.string().optional(),
  AWS_SUBNET_ID: z.string().optional(),
  AWS_AMI_ID: z.string().optional(),

  // Cloudflare
  CLOUDFLARE_API_TOKEN: z.string().optional(),
  CLOUDFLARE_ZONE_ID: z.string().optional(),

  // SSH (for health checks and debugging)
  ADMIN_SSH_PUBLIC_KEY: z.string().optional(),
  ADMIN_SSH_PRIVATE_KEY: z.string().optional(),

  // LiteLLM
  LITELLM_PROXY_URL: z.string().optional(),
  LITELLM_MASTER_KEY: z.string().optional(),

  // Instance defaults (can be overridden per-org later)
  INSTANCE_TYPE: z.string().default('t4g.small'),
  INSTANCE_VOLUME_GB: z.coerce.number().int().positive().default(20),
  INSTANCE_CREDITS_DOLLARS: z.coerce.number().positive().default(15),

  // Base domain for hostnames
  BASE_DOMAIN: z.string().default('agent.kodi.so'),

  // ── Required in Phase 3 (invite flow) ─────────────────────────────────────

  // JWT secret for signing invite tokens (generate: openssl rand -hex 32)
  INVITE_JWT_SECRET: z.string().min(32).optional(),

  // Public URL of the app (e.g. https://app.kodi.so)
  APP_URL: z.string().url().optional(),

  // Resend API key for sending invite emails (optional — logs to console in dev)
  RESEND_API_KEY: z.string().optional(),
})

const _env = envSchema.safeParse(process.env)

if (!_env.success) {
  console.error('❌ Invalid environment variables:')
  console.error(_env.error.flatten().fieldErrors)
  throw new Error('Invalid environment variables — see above for details')
}

export const env = _env.data

// ── Typed accessors for optional vars ─────────────────────────────────────

export function requireZoom() {
  const {
    ZOOM_CLIENT_ID,
    ZOOM_CLIENT_SECRET,
    ZOOM_WEBHOOK_SECRET,
    ZOOM_REDIRECT_URI,
    ZOOM_APP_ID,
    ZOOM_ACCOUNT_ID,
    ZOOM_GATEWAY_URL,
    ZOOM_GATEWAY_INTERNAL_TOKEN,
  } = env
  if (
    !ZOOM_CLIENT_ID ||
    !ZOOM_CLIENT_SECRET ||
    !ZOOM_WEBHOOK_SECRET ||
    !ZOOM_REDIRECT_URI ||
    !ZOOM_APP_ID
  ) {
    throw new Error(
      'Zoom environment variables are not configured. Set ZOOM_CLIENT_ID, ZOOM_CLIENT_SECRET, ZOOM_WEBHOOK_SECRET, ZOOM_REDIRECT_URI, and ZOOM_APP_ID.'
    )
  }
  return {
    ZOOM_CLIENT_ID,
    ZOOM_CLIENT_SECRET,
    ZOOM_WEBHOOK_SECRET,
    ZOOM_REDIRECT_URI,
    ZOOM_APP_ID,
    ZOOM_ACCOUNT_ID,
    ZOOM_GATEWAY_URL,
    ZOOM_GATEWAY_INTERNAL_TOKEN,
  }
}

export function requireComposio() {
  const {
    COMPOSIO_API_KEY,
    COMPOSIO_WEBHOOK_SECRET,
    COMPOSIO_BASE_URL,
    COMPOSIO_OAUTH_REDIRECT_URL,
    COMPOSIO_AUTH_CALLBACK_URL,
    COMPOSIO_MANAGE_CONNECTIONS_IN_CHAT,
    COMPOSIO_AUTH_CONFIG_GOOGLE,
    COMPOSIO_AUTH_CONFIG_SLACK,
    COMPOSIO_AUTH_CONFIG_GITHUB,
    COMPOSIO_AUTH_CONFIG_LINEAR,
    COMPOSIO_AUTH_CONFIG_NOTION,
  } = env

  if (!COMPOSIO_API_KEY || !COMPOSIO_WEBHOOK_SECRET) {
    throw new Error(
      'Composio environment variables are not configured. Set COMPOSIO_API_KEY and COMPOSIO_WEBHOOK_SECRET.'
    )
  }

  return {
    COMPOSIO_API_KEY,
    COMPOSIO_WEBHOOK_SECRET,
    COMPOSIO_BASE_URL,
    COMPOSIO_OAUTH_REDIRECT_URL,
    COMPOSIO_AUTH_CALLBACK_URL,
    COMPOSIO_MANAGE_CONNECTIONS_IN_CHAT,
    authConfigs: {
      google: COMPOSIO_AUTH_CONFIG_GOOGLE,
      slack: COMPOSIO_AUTH_CONFIG_SLACK,
      github: COMPOSIO_AUTH_CONFIG_GITHUB,
      linear: COMPOSIO_AUTH_CONFIG_LINEAR,
      notion: COMPOSIO_AUTH_CONFIG_NOTION,
    },
  }
}

export function requireAws() {
  const {
    AWS_ACCESS_KEY_ID,
    AWS_SECRET_ACCESS_KEY,
    AWS_SECURITY_GROUP_ID,
    AWS_SUBNET_ID,
    AWS_AMI_ID,
  } = env
  if (
    !AWS_ACCESS_KEY_ID ||
    !AWS_SECRET_ACCESS_KEY ||
    !AWS_SECURITY_GROUP_ID ||
    !AWS_SUBNET_ID ||
    !AWS_AMI_ID
  ) {
    throw new Error('AWS environment variables are not configured.')
  }
  return {
    AWS_ACCESS_KEY_ID,
    AWS_SECRET_ACCESS_KEY,
    AWS_REGION: env.AWS_REGION,
    AWS_SECURITY_GROUP_ID,
    AWS_SUBNET_ID,
    AWS_AMI_ID,
  }
}

export function requireCloudflare() {
  const { CLOUDFLARE_API_TOKEN, CLOUDFLARE_ZONE_ID } = env
  if (!CLOUDFLARE_API_TOKEN || !CLOUDFLARE_ZONE_ID) {
    throw new Error('Cloudflare environment variables are not configured.')
  }
  return { CLOUDFLARE_API_TOKEN, CLOUDFLARE_ZONE_ID }
}

export function requireSsh() {
  const { ADMIN_SSH_PRIVATE_KEY } = env
  if (!ADMIN_SSH_PRIVATE_KEY) {
    throw new Error('ADMIN_SSH_PRIVATE_KEY is not configured.')
  }
  return {
    ADMIN_SSH_PRIVATE_KEY,
    ADMIN_SSH_PUBLIC_KEY: env.ADMIN_SSH_PUBLIC_KEY,
  }
}

export function requireLiteLLM() {
  const { LITELLM_PROXY_URL, LITELLM_MASTER_KEY } = env
  if (!LITELLM_PROXY_URL || !LITELLM_MASTER_KEY) {
    throw new Error('LiteLLM environment variables are not configured.')
  }
  return { LITELLM_PROXY_URL, LITELLM_MASTER_KEY }
}
