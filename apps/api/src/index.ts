import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { logger } from 'hono/logger'
import { trpcServer } from '@hono/trpc-server'
import { appRouter } from './routers'
import { createContext } from './context'
import { registerMeetingRoutes } from './routes/meeting'
import { registerLocalMeetingRoutes } from './routes/local-meetings'
import { registerVoiceAudioRoutes } from './routes/voice-audio'
import { registerRecallRoutes } from './routes/recall'
import { registerComposioRoutes } from './routes/composio'
import { ensureApiSchemaReadiness } from './lib/startup/schema-readiness'
import { db, instances, eq } from '@kodi/db'

const app = new Hono()

await ensureApiSchemaReadiness()

app.use('*', logger())
registerMeetingRoutes(app)
registerLocalMeetingRoutes(app)
registerVoiceAudioRoutes(app)
registerRecallRoutes(app)
registerComposioRoutes(app)
app.use(
  '/trpc/*',
  cors({
    origin: [
      process.env.WEB_URL ?? 'http://localhost:3000',
      process.env.APP_URL ?? 'http://localhost:3001',
    ],
    credentials: true,
  })
)

app.use(
  '/trpc/*',
  trpcServer({
    router: appRouter,
    createContext,
  })
)

app.get('/health', (c) => c.json({ ok: true }))

// Internal: auto-provision an OpenClaw instance after billing completes.
// Called by the Stripe webhook handler in apps/app. Returns 202 immediately;
// provisioning runs in the background so the webhook can respond to Stripe quickly.
app.post('/internal/provision', async (c) => {
  const { env } = await import('./env')
  const secret = env.INTERNAL_PROVISION_SECRET
  const authHeader = c.req.header('Authorization')

  if (!secret || authHeader !== `Bearer ${secret}`) {
    return c.json({ error: 'Unauthorized' }, 401)
  }

  let orgId: string
  try {
    const body = await c.req.json()
    orgId = body?.orgId
    if (!orgId || typeof orgId !== 'string') throw new Error('missing orgId')
  } catch {
    return c.json({ error: 'Request body must be JSON with { orgId: string }' }, 400)
  }

  // Idempotency: skip if a non-deleted instance already exists
  const existing = await db.query.instances.findFirst({
    where: eq(instances.orgId, orgId),
  })
  if (existing && existing.status !== 'deleted') {
    console.log(`[internal/provision] org=${orgId} already has instance=${existing.id} status=${existing.status} — skipping`)
    return c.json({ skipped: true, reason: 'instance already exists' }, 200)
  }

  // Fire-and-forget — provisioning can take 60+ seconds (EC2 IP polling).
  // The API is a persistent process so the background task will complete.
  const { provisionInstance } = await import('./routers/instance/provisioning')
  void provisionInstance(orgId).catch((err: unknown) => {
    console.error(`[internal/provision] failed for org=${orgId}:`, err)
  })

  console.log(`[internal/provision] provisioning started for org=${orgId}`)
  return c.json({ started: true }, 202)
})

// Billing: usage sync endpoint (called by Railway Cron or similar)
app.post('/billing/sync-usage', async (c) => {
  const { requireUsageSync } = await import('./env')
  const { syncAllOrgs } = await import('./services/usage-sync')

  const authHeader = c.req.header('Authorization')
  const { USAGE_SYNC_SECRET } = requireUsageSync()

  if (authHeader !== `Bearer ${USAGE_SYNC_SECRET}`) {
    return c.json({ error: 'Unauthorized' }, 401)
  }

  const results = await syncAllOrgs()
  return c.json({ results, syncedAt: new Date().toISOString() })
})

export type AppRouter = typeof appRouter

export default {
  port: process.env.PORT ?? 3002,
  fetch: app.fetch,
}
