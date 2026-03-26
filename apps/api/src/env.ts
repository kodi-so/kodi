import { z } from 'zod'

const envSchema = z.object({
  // ── Required now ──────────────────────────────────────────────────────────

  // Database
  DATABASE_URL: z.string().url(),

  // Auth
  BETTER_AUTH_URL: z.string().url(),
  BETTER_AUTH_SECRET: z.string().min(32),

  // Encryption (generate: openssl rand -hex 32)
  ENCRYPTION_KEY: z.string().length(64, 'ENCRYPTION_KEY must be 64 hex chars (32 bytes)'),

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
  LITELLM_PROXY_URL: z.string().url().optional(),
  LITELLM_MASTER_KEY: z.string().optional(),
})

const _env = envSchema.safeParse(process.env)

if (!_env.success) {
  console.error('❌ Invalid environment variables:')
  console.error(_env.error.flatten().fieldErrors)
  throw new Error('Invalid environment variables — see above for details')
}

export const env = _env.data

// ── Typed accessors for optional vars ─────────────────────────────────────

export function requireAws() {
  const { AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY, AWS_SECURITY_GROUP_ID, AWS_SUBNET_ID, AWS_AMI_ID } = env
  if (!AWS_ACCESS_KEY_ID || !AWS_SECRET_ACCESS_KEY || !AWS_SECURITY_GROUP_ID || !AWS_SUBNET_ID || !AWS_AMI_ID) {
    throw new Error('AWS environment variables are not configured.')
  }
  return { AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY, AWS_REGION: env.AWS_REGION, AWS_SECURITY_GROUP_ID, AWS_SUBNET_ID, AWS_AMI_ID }
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
  return { ADMIN_SSH_PRIVATE_KEY, ADMIN_SSH_PUBLIC_KEY: env.ADMIN_SSH_PUBLIC_KEY }
}

export function requireLiteLLM() {
  const { LITELLM_PROXY_URL, LITELLM_MASTER_KEY } = env
  if (!LITELLM_PROXY_URL || !LITELLM_MASTER_KEY) {
    throw new Error('LiteLLM environment variables are not configured.')
  }
  return { LITELLM_PROXY_URL, LITELLM_MASTER_KEY }
}
