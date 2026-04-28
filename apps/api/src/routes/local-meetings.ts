import type { Hono } from 'hono'
import { db, eq, localMeetingSessions } from '@kodi/db'
import { appendNormalizedMeetingEvent } from '../lib/meetings/ingestion'
import { getLocalMeetingForToken } from '../lib/meetings/local-session'
import type { MeetingProviderEvent } from '../lib/meetings/events'

function bearerToken(header: string | null) {
  if (!header?.startsWith('Bearer ')) return null
  return header.slice('Bearer '.length).trim() || null
}

export function registerLocalMeetingRoutes(app: Hono) {
  app.post('/meetings/local-ingest', async (c) => {
    const token = bearerToken(c.req.header('authorization') ?? null)
    if (!token) return c.json({ error: 'Missing local ingest token.' }, 401)

    const session = await getLocalMeetingForToken(token)
    if (!session) {
      return c.json({ error: 'Invalid or expired local ingest token.' }, 401)
    }

    const body = await c.req.json().catch(() => null)
    const sequence =
      typeof body?.sequence === 'number' && Number.isFinite(body.sequence)
        ? body.sequence
        : null
    if (!sequence || sequence <= session.localSession.lastSequence) {
      return c.json({
        ok: true,
        ignored: sequence ? 'stale-sequence' : 'invalid-sequence',
        lastSequence: session.localSession.lastSequence,
      })
    }

    const now = new Date()
    if (body?.type === 'transcript' && typeof body?.content === 'string') {
      const event: MeetingProviderEvent = {
        kind: 'transcript',
        provider: 'local',
        occurredAt: now,
        session: { internalMeetingSessionId: session.meeting.id },
        transcript: {
          content: body.content,
          isPartial: Boolean(body.isPartial),
          speaker: {
            providerParticipantId: `local-user:${session.meeting.hostUserId ?? 'host'}`,
            displayName: 'Meeting host',
          },
        },
      }
      await appendNormalizedMeetingEvent(
        session.meeting.id,
        event,
        'kodi_ui',
        `local-transcript:${session.meeting.id}:${sequence}`
      )
    }

    await db
      .update(localMeetingSessions)
      .set({
        lastSequence: sequence,
        lastHeartbeatAt: now,
        lastTranscriptAt:
          body?.type === 'transcript'
            ? now
            : session.localSession.lastTranscriptAt,
        captureState:
          body?.type === 'close' ? 'ended' : session.localSession.captureState,
        transcriptionState:
          body?.type === 'close'
            ? 'ended'
            : session.localSession.transcriptionState,
        updatedAt: now,
      })
      .where(eq(localMeetingSessions.id, session.localSession.id))

    return c.json({ ok: true, lastSequence: sequence })
  })
}
