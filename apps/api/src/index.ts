import { Hono, type Context } from 'hono'
import { cors } from 'hono/cors'
import { logger } from 'hono/logger'
import { trpcServer } from '@hono/trpc-server'
import { appRouter } from './routers'
import { createContext } from './context'
import { registerMeetingRoutes } from './routes/meeting'
import { registerRecallRoutes } from './routes/recall'
import { registerComposioRoutes } from './routes/composio'
import { getVoiceAudio } from './lib/meetings/voice-audio-store'
import { ensureApiSchemaReadiness } from './lib/startup/schema-readiness'
import {
  getVoiceOutputMediaPlaybackState,
  renderVoiceOutputMediaPage,
  verifyVoiceOutputMediaSessionToken,
} from './lib/meetings/voice-output-media'

const app = new Hono()

await ensureApiSchemaReadiness()

app.use('*', logger())
registerMeetingRoutes(app)
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

app.get('/voice-agent/:token', (c) => {
  const token = c.req.param('token') ?? ''
  const session = verifyVoiceOutputMediaSessionToken(token)

  if (!session) {
    return c.json({ error: 'Invalid or expired voice session token.' }, 404)
  }

  return c.html(renderVoiceOutputMediaPage(token))
})

app.get('/voice-agent/:token/state', async (c) => {
  const token = c.req.param('token') ?? ''
  const session = verifyVoiceOutputMediaSessionToken(token)

  if (!session) {
    return c.json({ error: 'Invalid or expired voice session token.' }, 404)
  }

  const currentToken = c.req.query('currentToken') ?? null
  const state = await getVoiceOutputMediaPlaybackState({
    meetingSessionId: session.meetingSessionId,
    currentToken,
  })

  return c.json({
    interruptCurrent: state.interruptCurrent,
    nextToken: state.nextToken,
    nextAudioUrl: state.nextToken ? `/voice-output/${state.nextToken}` : null,
    pollAfterMs: 900,
  })
})

// Serve short-lived persisted TTS audio blobs for Recall Output Media consumption.
// Tokens are durable for a short TTL so Recall can retry and probe with HEAD.
async function buildVoiceAudioResponse(token: string, method: 'GET' | 'HEAD') {
  const audio = await getVoiceAudio(token)

  if (!audio) {
    return new Response(JSON.stringify({ error: 'Not found or expired' }), {
      status: 404,
      headers: {
        'Content-Type': 'application/json',
      },
    })
  }

  const headers = new Headers({
    'Content-Type': audio.contentType,
    'Cache-Control': 'no-store',
    'Content-Length': String(audio.buffer.byteLength),
    'Accept-Ranges': 'bytes',
  })

  if (method === 'HEAD') {
    return new Response(null, {
      headers,
    })
  }

  return new Response(new Uint8Array(audio.buffer), {
    headers,
  })
}

app.on('HEAD', '/voice-output/:token', (c: Context) => {
  const token = c.req.param('token') ?? ''
  return buildVoiceAudioResponse(token, 'HEAD')
})

app.get('/voice-output/:token', (c: Context) => {
  const token = c.req.param('token') ?? ''
  return buildVoiceAudioResponse(token, 'GET')
})

export type AppRouter = typeof appRouter

export default {
  port: process.env.PORT ?? 3002,
  fetch: app.fetch,
}
