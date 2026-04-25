import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { logger } from 'hono/logger'
import { trpcServer } from '@hono/trpc-server'
import { appRouter } from './routers'
import { createContext } from './context'
import { registerMeetingRoutes } from './routes/meeting'
import { registerRecallRoutes } from './routes/recall'
import { registerComposioRoutes } from './routes/composio'
import { registerPluginVersionsRoutes } from './routes/plugin-versions'
import { ensureApiSchemaReadiness } from './lib/startup/schema-readiness'

const app = new Hono()

await ensureApiSchemaReadiness()

app.use('*', logger())
registerMeetingRoutes(app)
registerRecallRoutes(app)
registerComposioRoutes(app)
registerPluginVersionsRoutes(app)
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

export type AppRouter = typeof appRouter

export default {
  port: process.env.PORT ?? 3002,
  fetch: app.fetch,
}
