import { z } from 'zod'

const envSchema = z.object({
  // Database
  DATABASE_URL: z.string().url(),

  // Auth
  BETTER_AUTH_URL: z.string().url(),
  BETTER_AUTH_SECRET: z.string().min(32),
  GOOGLE_CLIENT_ID: z.string(),
  GOOGLE_CLIENT_SECRET: z.string(),

  // Stripe
  STRIPE_SECRET_KEY: z.string().startsWith('sk_'),
  STRIPE_WEBHOOK_SECRET: z.string().startsWith('whsec_'),

  // AWS
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

  // Encryption (generate: openssl rand -hex 32)
  ENCRYPTION_KEY: z.string().length(64, 'ENCRYPTION_KEY must be 64 hex chars (32 bytes)'),
})

// Skip validation at Docker build time — env vars are injected at runtime by Railway.
// SKIP_ENV_VALIDATION=1 is set in the Dockerfile build step.
if (process.env.SKIP_ENV_VALIDATION !== '1') {
  const _env = envSchema.safeParse(process.env)
  if (!_env.success) {
    console.error('❌ Invalid environment variables:')
    console.error(_env.error.flatten().fieldErrors)
    throw new Error('Invalid environment variables — see above for details')
  }
}

export const env = envSchema.parse(
  process.env.SKIP_ENV_VALIDATION === '1' ? _buildTimeEnv() : process.env
)

function _buildTimeEnv(): z.infer<typeof envSchema> {
  // During Docker build, return stubs so the module loads without crashing.
  // At runtime these will never be used — real env vars take over.
  return {
    DATABASE_URL: 'postgresql://build:build@localhost/build',
    BETTER_AUTH_URL: 'http://localhost:3001',
    BETTER_AUTH_SECRET: 'build-time-placeholder-secret-min32chars!!',
    GOOGLE_CLIENT_ID: 'build',
    GOOGLE_CLIENT_SECRET: 'build',
    STRIPE_SECRET_KEY: 'sk_build',
    STRIPE_WEBHOOK_SECRET: 'whsec_build',
    AWS_ACCESS_KEY_ID: 'build',
    AWS_SECRET_ACCESS_KEY: 'build',
    AWS_REGION: 'us-east-1',
    AWS_SECURITY_GROUP_ID: 'build',
    AWS_SUBNET_ID: 'build',
    AWS_AMI_ID: 'build',
    CLOUDFLARE_API_TOKEN: 'build',
    CLOUDFLARE_ZONE_ID: 'build',
    LITELLM_PROXY_URL: 'http://localhost:4000',
    LITELLM_MASTER_KEY: 'build',
    ENCRYPTION_KEY: '0'.repeat(64),
  }
}
