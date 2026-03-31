import { z } from 'zod'

const envSchema = z.object({
  PORT: z.coerce.number().int().positive().default(3010),
  API_URL: z.string().url().default('http://localhost:3002'),
  ZOOM_GATEWAY_INTERNAL_TOKEN: z.string().optional(),
  ZOOM_GATEWAY_POLL_INTERVAL_MS: z.coerce.number().int().min(0).default(10),
  ZOOM_GATEWAY_JOIN_TIMEOUT_MS: z.coerce.number().int().default(5000),
  ZOOM_GATEWAY_MAX_RETRIES: z.coerce.number().int().min(0).default(2),
  ZOOM_GATEWAY_RETRY_DELAY_MS: z.coerce.number().int().min(0).default(3000),
  ZM_RTMS_CLIENT: z.string().optional(),
  ZM_RTMS_SECRET: z.string().optional(),
  ZM_RTMS_CA: z.string().optional(),
  ZM_RTMS_LOG_ENABLED: z.coerce.boolean().default(true),
  ZM_RTMS_LOG_LEVEL: z
    .enum(['error', 'warn', 'info', 'debug', 'trace'])
    .default('info'),
  ZM_RTMS_LOG_FORMAT: z.enum(['progressive', 'json']).default('progressive'),
})

const parsed = envSchema.safeParse(process.env)

if (!parsed.success) {
  console.error('❌ Invalid zoom gateway environment variables:')
  console.error(parsed.error.flatten().fieldErrors)
  throw new Error('Invalid zoom gateway environment variables.')
}

export const env = parsed.data
