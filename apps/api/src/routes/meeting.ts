import type { Hono } from 'hono'
import { appendNormalizedMeetingEvent } from '../lib/meetings/ingestion'
import { env } from '../env'
import type { MeetingProviderEvent } from '../lib/meetings/events'

function isMeetingRouteAuthorized(headerValue: string | null) {
  const token = env.MEETING_INTERNAL_TOKEN ?? env.ZOOM_GATEWAY_INTERNAL_TOKEN
  if (!token) return true
  return headerValue === `Bearer ${token}`
}

export function registerMeetingRoutes(app: Hono) {
  app.post('/internal/meetings/:meetingSessionId/normalized-events', async (c) => {
    if (!isMeetingRouteAuthorized(c.req.header('authorization') ?? null)) {
      return c.json({ error: 'Unauthorized' }, 401)
    }

    const meetingSessionId = c.req.param('meetingSessionId')
    const body = (await c.req.json()) as {
      source?:
        | 'zoom_webhook'
        | 'recall_webhook'
        | 'rtms'
        | 'kodi_ui'
        | 'agent'
        | 'worker'
      events?: MeetingProviderEvent[]
    }

    let count = 0
    for (const event of body.events ?? []) {
      await appendNormalizedMeetingEvent(
        meetingSessionId,
        event,
        body.source ?? 'worker'
      )
      count += 1
    }

    return c.json({ ok: true, count })
  })
}
