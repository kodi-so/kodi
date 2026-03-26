import { z } from 'zod'

const envSchema = z.object({
  // ── Required now ──────────────────────────────────────────────────────────

  // Database
  DATABASE_URL: z.string().url(),

  // Auth
  BETTER_AUTH_URL: z.string().url(),
  BETTER_AUTH_SECRET: z.string().min(32),
  GOOGLE_CLIENT_ID: z.string().optional(),
  GOOGLE_CLIENT_SECRET: z.string().optional(),

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

  // LiteLLM
  LITELLM_PROXY_URL: z.string().optional(),
  LITELLM_MASTER_KEY: z.string().optional(),

  // ── Required in Phase 2 (billing) ─────────────────────────────────────────

  // Stripe
  STRIPE_SECRET_KEY: z.string().startsWith('sk_').optional(),
  STRIPE_WEBHOOK_SECRET: z.string().startsWith('whsec_').optional(),
})

const _env = envSchema.safeParse(process.env)

if (!_env.success) {
  console.error('❌ Invalid environment variables:')
  console.error(_env.error.flatten().fieldErrors)
  throw new Error('Invalid environment variables — see above for details')
}

export const env = _env.data

// ── Typed accessors for optional vars ─────────────────────────────────────
// These throw at call-time (not startup) when a feature tries to use a
// var that hasn't been configured yet. Add to these as phases are built.

export function requireAws() {
  const { AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY, AWS_SECURITY_GROUP_ID, AWS_SUBNET_ID, AWS_AMI_ID } = env
  if (!AWS_ACCESS_KEY_ID || !AWS_SECRET_ACCESS_KEY || !AWS_SECURITY_GROUP_ID || !AWS_SUBNET_ID || !AWS_AMI_ID) {
    throw new Error('AWS environment variables are not configured. Set AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY, AWS_SECURITY_GROUP_ID, AWS_SUBNET_ID, and AWS_AMI_ID.')
  }
  return { AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY, AWS_REGION: env.AWS_REGION, AWS_SECURITY_GROUP_ID, AWS_SUBNET_ID, AWS_AMI_ID }
}

export function requireCloudflare() {
  const { CLOUDFLARE_API_TOKEN, CLOUDFLARE_ZONE_ID } = env
  if (!CLOUDFLARE_API_TOKEN || !CLOUDFLARE_ZONE_ID) {
    throw new Error('Cloudflare environment variables are not configured. Set CLOUDFLARE_API_TOKEN and CLOUDFLARE_ZONE_ID.')
  }
  return { CLOUDFLARE_API_TOKEN, CLOUDFLARE_ZONE_ID }
}

export function requireLiteLLM() {
  const { LITELLM_PROXY_URL, LITELLM_MASTER_KEY } = env
  if (!LITELLM_PROXY_URL || !LITELLM_MASTER_KEY) {
    throw new Error('LiteLLM environment variables are not configured. Set LITELLM_PROXY_URL and LITELLM_MASTER_KEY.')
  }
  return { LITELLM_PROXY_URL, LITELLM_MASTER_KEY }
}

export function requireStripe() {
  const { STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET } = env
  if (!STRIPE_SECRET_KEY || !STRIPE_WEBHOOK_SECRET) {
    throw new Error('Stripe environment variables are not configured. Set STRIPE_SECRET_KEY and STRIPE_WEBHOOK_SECRET.')
  }
  return { STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET }
}
