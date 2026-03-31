import { Hono } from 'hono'
import { logger } from 'hono/logger'
import { env } from './env'

type RtmsSessionState = {
  meetingSessionId: string
  startedAt: string
  lastPayloadAt: string
}

const rtmsSessions = new Map<string, RtmsSessionState>()
const app = new Hono()

function isAuthorized(authorization: string | undefined) {
  if (!env.ZOOM_GATEWAY_INTERNAL_TOKEN) return true
  return authorization === `Bearer ${env.ZOOM_GATEWAY_INTERNAL_TOKEN}`
}

async function proxyToApi(path: string, body: unknown) {
  const res = await fetch(`${env.API_URL}${path}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(env.ZOOM_GATEWAY_INTERNAL_TOKEN
        ? { Authorization: `Bearer ${env.ZOOM_GATEWAY_INTERNAL_TOKEN}` }
        : {}),
    },
    body: JSON.stringify(body),
  })

  if (!res.ok) {
    const message = await res.text().catch(() => '')
    throw new Error(`API proxy failed (${res.status}): ${message}`)
  }

  const contentType = res.headers.get('content-type') ?? ''
  if (!contentType.includes('application/json')) {
    return null
  }

  return res.json().catch(() => null)
}

app.use('*', logger())

app.get('/health', (c) => {
  return c.json({
    ok: true,
    activeSessions: rtmsSessions.size,
  })
})

app.post('/internal/rtms/start', async (c) => {
  if (!isAuthorized(c.req.header('authorization'))) {
    return c.json({ error: 'Unauthorized' }, 401)
  }

  const body = (await c.req.json()) as Record<string, unknown>
  const meetingSessionId =
    typeof body.meetingSessionId === 'string' ? body.meetingSessionId : null

  if (!meetingSessionId) {
    return c.json({ error: 'meetingSessionId is required' }, 400)
  }

  const timestamp = new Date().toISOString()
  rtmsSessions.set(meetingSessionId, {
    meetingSessionId,
    startedAt: timestamp,
    lastPayloadAt: timestamp,
  })

  const forwarded = await proxyToApi(`/internal/meetings/${meetingSessionId}/events`, {
    eventType: 'meeting.rtms.gateway_started',
    source: 'rtms',
    payload: {
      ...body,
      startedAt: timestamp,
    },
  })

  return c.json({
    ok: true,
    activeSessions: rtmsSessions.size,
    forwarded,
  })
})

app.post('/internal/rtms/:meetingSessionId/participants', async (c) => {
  if (!isAuthorized(c.req.header('authorization'))) {
    return c.json({ error: 'Unauthorized' }, 401)
  }

  const meetingSessionId = c.req.param('meetingSessionId')
  const body = (await c.req.json()) as { participants?: Array<Record<string, unknown>> }
  const existing = rtmsSessions.get(meetingSessionId)
  if (existing) {
    rtmsSessions.set(meetingSessionId, {
      ...existing,
      lastPayloadAt: new Date().toISOString(),
    })
  }

  const forwarded = await proxyToApi(
    `/internal/meetings/${meetingSessionId}/participants`,
    body
  )

  return c.json({
    ok: true,
    forwarded,
  })
})

app.post('/internal/rtms/:meetingSessionId/transcript', async (c) => {
  if (!isAuthorized(c.req.header('authorization'))) {
    return c.json({ error: 'Unauthorized' }, 401)
  }

  const meetingSessionId = c.req.param('meetingSessionId')
  const body = (await c.req.json()) as { segments?: Array<Record<string, unknown>> }
  const existing = rtmsSessions.get(meetingSessionId)
  if (existing) {
    rtmsSessions.set(meetingSessionId, {
      ...existing,
      lastPayloadAt: new Date().toISOString(),
    })
  }

  const forwarded = await proxyToApi(
    `/internal/meetings/${meetingSessionId}/transcript`,
    body
  )

  return c.json({
    ok: true,
    forwarded,
  })
})

app.post('/internal/rtms/:meetingSessionId/stop', async (c) => {
  if (!isAuthorized(c.req.header('authorization'))) {
    return c.json({ error: 'Unauthorized' }, 401)
  }

  const meetingSessionId = c.req.param('meetingSessionId')
  const body = (await c.req.json().catch(() => ({}))) as Record<string, unknown>
  const existing = rtmsSessions.get(meetingSessionId)
  rtmsSessions.delete(meetingSessionId)

  const timestamp = new Date().toISOString()
  const forwarded = await proxyToApi(`/internal/meetings/${meetingSessionId}/events`, {
    eventType: 'meeting.rtms.gateway_stopped',
    source: 'rtms',
    payload: {
      ...body,
      stoppedAt: timestamp,
      previousSession: existing ?? null,
    },
  })

  return c.json({
    ok: true,
    activeSessions: rtmsSessions.size,
    forwarded,
  })
})

export default {
  port: env.PORT,
  fetch: app.fetch,
}
