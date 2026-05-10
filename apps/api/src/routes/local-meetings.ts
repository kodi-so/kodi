import type { Hono } from 'hono'
import {
  db,
  eq,
  localMeetingSessions,
  meetingParticipants,
  meetingSessions,
} from '@kodi/db'
import { appendNormalizedMeetingEvent } from '../lib/meetings/ingestion'
import { getLocalMeetingForToken } from '../lib/meetings/local-session'
import {
  browserSpeechRecognitionAdapter,
  type LocalTranscriptionResult,
} from '../lib/meetings/local-transcription'
import { isSttAvailable, transcribeAudio } from '../lib/providers/stt/client'

type IngestMessage =
  | {
      type: 'heartbeat'
      sequence: number
      captureState?: 'capturing' | 'paused' | 'reconnecting'
      transcriptionState?: 'connecting' | 'transcribing' | 'degraded'
    }
  | {
      type: 'audio_chunk'
      sequence: number
      byteLength?: number
      durationMs?: number
    }
  | {
      type: 'transcript'
      sequence: number
      transcript: LocalTranscriptionResult
    }
  | {
      type: 'failure'
      sequence: number
      failureReason: string
      failureKind?: 'capture' | 'transcription' | 'network'
    }
  | {
      type: 'close'
      sequence: number
    }

function bearerToken(header: string | null) {
  if (!header?.startsWith('Bearer ')) return null
  return header.slice('Bearer '.length).trim() || null
}

function asIngestMessage(value: unknown): IngestMessage | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const record = value as Record<string, unknown>
  if (typeof record.type !== 'string') return null
  if (typeof record.sequence !== 'number' || !Number.isFinite(record.sequence)) {
    return null
  }
  return record as IngestMessage
}

async function resolveHostIdentity(meetingSessionId: string) {
  const participant = await db.query.meetingParticipants.findFirst({
    where: (fields, { and, eq }) =>
      and(
        eq(fields.meetingSessionId, meetingSessionId),
        eq(fields.isHost, true)
      ),
  })

  return {
    providerParticipantId:
      participant?.providerParticipantId ?? `local-host:${meetingSessionId}`,
    displayName: participant?.displayName ?? 'Meeting host',
  }
}

export function registerLocalMeetingRoutes(app: Hono) {
  app.post('/meetings/local-ingest', async (c) => {
    const token = bearerToken(c.req.header('authorization') ?? null)
    if (!token) {
      return c.json({ error: 'Missing local ingest token.' }, 401)
    }

    const session = await getLocalMeetingForToken(token)
    if (!session) {
      return c.json({ error: 'Invalid or expired local ingest token.' }, 401)
    }

    if (session.meeting.status === 'completed' || session.meeting.endedAt) {
      return c.json({ error: 'Local meeting has already ended.' }, 409)
    }

    let message: IngestMessage | null = null
    try {
      message = asIngestMessage(await c.req.json())
    } catch {
      return c.json({ error: 'Request body must be a JSON ingest message.' }, 400)
    }

    if (!message) {
      return c.json({ error: 'Invalid local ingest message.' }, 400)
    }

    if (message.sequence <= session.localSession.lastSequence) {
      return c.json({
        ok: true,
        ignored: 'stale-sequence',
        lastSequence: session.localSession.lastSequence,
      })
    }

    const now = new Date()
    const statePatch: Partial<typeof localMeetingSessions.$inferInsert> = {
      lastSequence: message.sequence,
      lastHeartbeatAt: now,
      updatedAt: now,
    }

    if (message.type === 'heartbeat') {
      statePatch.captureState =
        message.captureState ?? session.localSession.captureState
      statePatch.transcriptionState =
        message.transcriptionState ?? session.localSession.transcriptionState
    }

    if (message.type === 'audio_chunk') {
      statePatch.lastAudioChunkAt = now
      if (session.localSession.captureState === 'reconnecting') {
        statePatch.captureState = 'capturing'
      }
    }

    if (message.type === 'transcript') {
      const host = await resolveHostIdentity(session.meeting.id)
      const event = browserSpeechRecognitionAdapter.normalizeResult({
        meetingSessionId: session.meeting.id,
        mode: session.localSession.mode,
        hostParticipantId: host.providerParticipantId,
        hostDisplayName: host.displayName,
        result: {
          ...message.transcript,
          occurredAt: message.transcript.occurredAt
            ? new Date(message.transcript.occurredAt)
            : now,
        },
      })

      if (event) {
        await appendNormalizedMeetingEvent(
          session.meeting.id,
          event,
          'kodi_ui',
          `local-transcript:${session.meeting.id}:${message.sequence}`
        )
        statePatch.lastTranscriptAt = now
        statePatch.transcriptionState = event.transcript.isPartial
          ? 'transcribing'
          : 'transcribing'
      }
    }

    if (message.type === 'failure') {
      statePatch.failureReason = message.failureReason
      statePatch.captureState =
        message.failureKind === 'capture' ? 'failed' : session.localSession.captureState
      statePatch.transcriptionState =
        message.failureKind === 'transcription'
          ? 'failed'
          : session.localSession.transcriptionState
      console.warn('[local-meetings] ingest failure', {
        orgId: session.localSession.orgId,
        meetingSessionId: session.meeting.id,
        failureKind: message.failureKind ?? null,
        failureReason: message.failureReason,
      })
    }

    if (message.type === 'close') {
      statePatch.captureState = 'ended'
      statePatch.transcriptionState = 'ended'
      statePatch.endedAt = now
      statePatch.ingestTokenRevokedAt = now
      await db
        .update(meetingSessions)
        .set({ status: 'ended', endedAt: now, updatedAt: now })
        .where(eq(meetingSessions.id, session.meeting.id))
    }

    await db
      .update(localMeetingSessions)
      .set(statePatch)
      .where(eq(localMeetingSessions.id, session.localSession.id))

    return c.json({ ok: true, lastSequence: message.sequence })
  })

  // Audio → text endpoint. Browser MediaRecorder produces ~4s webm/opus
  // chunks, posts each chunk here as multipart, we call OpenAI Whisper and
  // persist the result via the same event pipeline as any other transcript.
  app.post('/meetings/local-transcribe', async (c) => {
    const token = bearerToken(c.req.header('authorization') ?? null)
    if (!token) {
      return c.json({ error: 'Missing local ingest token.' }, 401)
    }
    const session = await getLocalMeetingForToken(token)
    if (!session) {
      return c.json({ error: 'Invalid or expired local ingest token.' }, 401)
    }
    if (session.meeting.status === 'completed' || session.meeting.endedAt) {
      return c.json({ error: 'Local meeting has already ended.' }, 409)
    }
    if (!isSttAvailable()) {
      return c.json(
        { error: 'Server-side transcription is not configured (STT_OPENAI_API_KEY missing).' },
        503
      )
    }

    let form: FormData
    try {
      form = await c.req.formData()
    } catch {
      return c.json({ error: 'Request body must be multipart form-data.' }, 400)
    }

    // FormDataEntryValue is `string | Blob` (with File extending Blob), so a
    // single Blob check covers both the browser-File and raw-Blob cases.
    const file = form.get('audio')
    if (!file || typeof file === 'string') {
      return c.json({ error: 'Missing audio file in form data.' }, 400)
    }
    const audioBlob = file as Blob
    if (audioBlob.size === 0) {
      return c.json({ ok: true, text: '', skipped: 'empty-chunk' })
    }
    const sequenceRaw = form.get('sequence')
    const sequence =
      typeof sequenceRaw === 'string' ? Number(sequenceRaw) : NaN
    if (!Number.isFinite(sequence)) {
      return c.json({ error: 'Missing or invalid sequence number.' }, 400)
    }
    const language =
      typeof form.get('language') === 'string'
        ? (form.get('language') as string)
        : undefined

    const result = await transcribeAudio({
      audio: audioBlob,
      contentType: audioBlob.type || 'audio/webm',
      language,
    })
    if (!result.ok) {
      console.warn('[local-meetings] whisper transcribe failed', {
        orgId: session.localSession.orgId,
        meetingSessionId: session.meeting.id,
        reason: result.reason,
        error: result.error,
      })
      return c.json(
        { ok: false, reason: result.reason, error: result.error ?? null },
        502
      )
    }

    const now = new Date()
    const trimmedText = result.text.trim()
    if (!trimmedText) {
      // Empty transcription is a normal outcome for silence — still bump
      // heartbeat/transcriptionState so the UI stays in 'transcribing'.
      await db
        .update(localMeetingSessions)
        .set({
          lastHeartbeatAt: now,
          updatedAt: now,
          transcriptionState: 'transcribing',
        })
        .where(eq(localMeetingSessions.id, session.localSession.id))
      return c.json({ ok: true, text: '' })
    }

    const host = await resolveHostIdentity(session.meeting.id)
    const event = browserSpeechRecognitionAdapter.normalizeResult({
      meetingSessionId: session.meeting.id,
      mode: session.localSession.mode,
      hostParticipantId: host.providerParticipantId,
      hostDisplayName: host.displayName,
      result: {
        text: trimmedText,
        isPartial: false,
        occurredAt: now,
      },
    })

    if (event) {
      await appendNormalizedMeetingEvent(
        session.meeting.id,
        event,
        'kodi_ui',
        `local-whisper:${session.meeting.id}:${sequence}`
      )
    }

    await db
      .update(localMeetingSessions)
      .set({
        lastHeartbeatAt: now,
        lastTranscriptAt: now,
        updatedAt: now,
        transcriptionState: 'transcribing',
      })
      .where(eq(localMeetingSessions.id, session.localSession.id))

    return c.json({
      ok: true,
      text: trimmedText,
      transcriptEventId: event?.transcriptEventId ?? null,
    })
  })
}
