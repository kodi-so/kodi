import { z } from 'zod'

const envSchema = z.object({
  PORT: z.coerce.number().int().positive().default(3010),
  API_URL: z.string().url().default('http://localhost:3002'),
  ZOOM_GATEWAY_INTERNAL_TOKEN: z.string().optional(),
})

const parsed = envSchema.safeParse(process.env)

if (!parsed.success) {
  console.error('❌ Invalid zoom gateway environment variables:')
  console.error(parsed.error.flatten().fieldErrors)
  throw new Error('Invalid zoom gateway environment variables.')
}

export const env = parsed.data
