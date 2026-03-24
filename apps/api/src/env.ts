import { z } from 'zod'

const envSchema = z.object({
  // Database
  DATABASE_URL: z.string().url(),

  // Auth
  BETTER_AUTH_URL: z.string().url(),
  BETTER_AUTH_SECRET: z.string().min(32),

  // Encryption (generate: openssl rand -hex 32)
  ENCRYPTION_KEY: z.string().length(64, 'ENCRYPTION_KEY must be 64 hex chars (32 bytes)'),

  // AWS (needed by provisioning logic in Phase 1)
  AWS_ACCESS_KEY_ID: z.string(),
  AWS_SECRET_ACCESS_KEY: z.string(),
  AWS_REGION: z.string().default('us-east-1'),
  AWS_SECURITY_GROUP_ID: z.string(),
  AWS_SUBNET_ID: z.string(),
  AWS_AMI_ID: z.string(),

  // Cloudflare
  CLOUDFLARE_API_TOKEN: z.string(),
  CLOUDFLARE_ZONE_ID: z.string(),

  // LiteLLM
  LITELLM_PROXY_URL: z.string().url(),
  LITELLM_MASTER_KEY: z.string(),
})

const _env = envSchema.safeParse(process.env)

if (!_env.success) {
  console.error('❌ Invalid environment variables:')
  console.error(_env.error.flatten().fieldErrors)
  throw new Error('Invalid environment variables — see above for details')
}

export const env = _env.data
