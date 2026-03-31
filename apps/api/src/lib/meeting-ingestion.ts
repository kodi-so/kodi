import { eq } from 'drizzle-orm'
import {
  db,
  meetingEvents,
  meetingParticipants,
  meetingSessions,
  transcriptSegments,
} from '@kodi/db'
import { logActivity } from './activity'
import { env } from '../env'

type ZoomWebhookEnvelope = {
  event?: string
  event_ts?: number
  account_id?: string
  payload?: {
    account_id?: string
    operator?: string
    object?: Record<string, unknown>
  }
}

type ParticipantInput = {
  providerParticipantId?: string | null
  displayName?: string | null
  email?: string | null
  isHost?: boolean
  isInternal?: boolean | null
  joinedAt?: Date | null
  leftAt?: Date | null
  metadata?: Record<string, unknown> | null
}

type TranscriptSegmentInput = {
  speakerName?: string | null
  providerParticipantId?: string | null
  content: string
  startOffsetMs?: number | null
  endOffsetMs?: number | null
  confidence?: number | null
  isPartial?: boolean
}

function asDate(value: unknown) {
  if (!value || typeof value !== 'string') return null
  const parsed = new Date(value)
  return Number.isNaN(parsed.getTime()) ? null : parsed
}

function extractMeetingObject(event: ZoomWebhookEnvelope) {
  const object = event.payload?.object ?? {}
  const providerMeetingId =
    object.id != null ? String(object.id) : null
  const providerMeetingUuid =
    object.uuid != null ? String(object.uuid) : null

  return {
    providerMeetingId,
    providerMeetingUuid,
    title: typeof object.topic === 'string' ? object.topic : null,
    actualStartAt: asDate(object.start_time),
    endedAt: asDate(object.end_time),
    metadata: object,
  }
}

export async function resolveZoomInstallation(accountId: string | null) {
  if (!accountId) return null

  return db.query.providerInstallations.findFirst({
    where: (fields, { and, eq }) =>
      and(eq(fields.provider, 'zoom'), eq(fields.externalAccountId, accountId)),
  })
}

export async function upsertMeetingSessionFromZoomEvent(
  installation: NonNullable<Awaited<ReturnType<typeof resolveZoomInstallation>>>,
  event: ZoomWebhookEnvelope
) {
  const { providerMeetingId, providerMeetingUuid, title, actualStartAt, endedAt, metadata } =
    extractMeetingObject(event)

  if (!providerMeetingId && !providerMeetingUuid) return null

  const existing = await db.query.meetingSessions.findFirst({
    where: (fields, { and, eq, or }) =>
      and(
        eq(fields.orgId, installation.orgId),
        eq(fields.provider, 'zoom'),
        or(
          providerMeetingUuid ? eq(fields.providerMeetingUuid, providerMeetingUuid) : undefined,
          providerMeetingId ? eq(fields.providerMeetingId, providerMeetingId) : undefined
        )
      ),
  })

  const nextStatus =
    event.event === 'meeting.ended'
      ? 'completed'
      : event.event === 'meeting.rtms_started'
        ? 'joining'
        : 'live'

  if (existing) {
    await db
      .update(meetingSessions)
      .set({
        providerMeetingId: providerMeetingId ?? existing.providerMeetingId,
        providerMeetingUuid: providerMeetingUuid ?? existing.providerMeetingUuid,
        title: title ?? existing.title,
        actualStartAt: actualStartAt ?? existing.actualStartAt,
        endedAt: endedAt ?? existing.endedAt,
        status: nextStatus,
        metadata: metadata ?? existing.metadata,
        updatedAt: new Date(),
      })
      .where(eq(meetingSessions.id as never, existing.id as never) as never)

    return db.query.meetingSessions.findFirst({
      where: (fields, { eq }) => eq(fields.id, existing.id),
    })
  }

  const createdRows = await db
    .insert(meetingSessions)
    .values({
      orgId: installation.orgId,
      provider: 'zoom',
      providerInstallationId: installation.id,
      providerMeetingId,
      providerMeetingUuid,
      title,
      actualStartAt: actualStartAt ?? new Date(),
      endedAt,
      status: nextStatus,
      metadata,
    })
    .returning()
  const created = createdRows[0]
  if (!created) {
    throw new Error('Failed to create meeting session for Zoom event')
  }

  await logActivity(
    db,
    installation.orgId,
    'meeting.session.created',
    {
      provider: 'zoom',
      meetingSessionId: created.id,
      providerMeetingId: created.providerMeetingId,
    },
    null
  )

  return created
}

export async function appendMeetingEvent(
  meetingSessionId: string,
  eventType: string,
  source: 'zoom_webhook' | 'rtms' | 'kodi_ui' | 'agent' | 'worker',
  payload?: Record<string, unknown> | null
) {
  const lastEvent = await db.query.meetingEvents.findFirst({
    where: (fields, { eq }) => eq(fields.meetingSessionId, meetingSessionId),
    orderBy: (fields, { desc }) => desc(fields.sequence),
    columns: { sequence: true },
  })

  const [created] = await db
    .insert(meetingEvents)
    .values({
      meetingSessionId,
      sequence: (lastEvent?.sequence ?? 0) + 1,
      eventType,
      source,
      payload: payload ?? null,
      occurredAt: new Date(),
    })
    .returning()

  return created
}

export async function upsertMeetingParticipant(
  meetingSessionId: string,
  input: ParticipantInput
) {
  const existing = await db.query.meetingParticipants.findFirst({
    where: (fields, { and, eq, or }) =>
      and(
        eq(fields.meetingSessionId, meetingSessionId),
        or(
          input.providerParticipantId
            ? eq(fields.providerParticipantId, input.providerParticipantId)
            : undefined,
          input.email ? eq(fields.email, input.email) : undefined
        )
      ),
  })

  if (existing) {
    const [updated] = await db
      .update(meetingParticipants)
      .set({
        providerParticipantId:
          input.providerParticipantId ?? existing.providerParticipantId,
        displayName: input.displayName ?? existing.displayName,
        email: input.email ?? existing.email,
        isHost: input.isHost ?? existing.isHost,
        isInternal:
          input.isInternal === undefined ? existing.isInternal : input.isInternal,
        joinedAt: input.joinedAt ?? existing.joinedAt,
        leftAt: input.leftAt ?? existing.leftAt,
        metadata: input.metadata ?? existing.metadata,
      })
      .where(
        eq(meetingParticipants.id as never, existing.id as never) as never
      )
      .returning()

    return updated
  }

  const [created] = await db
    .insert(meetingParticipants)
    .values({
      meetingSessionId,
      providerParticipantId: input.providerParticipantId ?? null,
      displayName: input.displayName ?? null,
      email: input.email ?? null,
      isHost: input.isHost ?? false,
      isInternal: input.isInternal ?? null,
      joinedAt: input.joinedAt ?? null,
      leftAt: input.leftAt ?? null,
      metadata: input.metadata ?? null,
    })
    .returning()

  return created
}

export async function appendTranscriptSegments(
  meetingSessionId: string,
  segments: TranscriptSegmentInput[]
) {
  if (segments.length === 0) return []

  const persisted = []
  for (const segment of segments) {
    let participantId: string | null = null

    if (segment.providerParticipantId) {
      const participant = await db.query.meetingParticipants.findFirst({
        where: (fields, { and, eq }) =>
          and(
            eq(fields.meetingSessionId, meetingSessionId),
            eq(fields.providerParticipantId, segment.providerParticipantId!)
          ),
        columns: { id: true },
      })
      participantId = participant?.id ?? null
    }

    const [created] = await db
      .insert(transcriptSegments)
      .values({
        meetingSessionId,
        speakerParticipantId: participantId,
        speakerName: segment.speakerName ?? null,
        content: segment.content,
        startOffsetMs: segment.startOffsetMs ?? null,
        endOffsetMs: segment.endOffsetMs ?? null,
        confidence: segment.confidence ?? null,
        isPartial: segment.isPartial ?? false,
        source: 'rtms',
      })
      .returning()

    persisted.push(created)
  }

  return persisted
}

export async function processZoomWebhookEvent(event: ZoomWebhookEnvelope) {
  const accountId =
    event.account_id ??
    event.payload?.account_id ??
    (typeof event.payload?.object?.account_id === 'string'
      ? event.payload.object.account_id
      : null)

  const installation = await resolveZoomInstallation(accountId)
  if (!installation) {
    return { ok: true as const, ignored: 'unmapped-account' as const }
  }

  const meeting = await upsertMeetingSessionFromZoomEvent(installation, event)
  if (!meeting) {
    return { ok: true as const, ignored: 'missing-meeting-identity' as const }
  }

  await appendMeetingEvent(meeting.id, event.event ?? 'zoom.unknown', 'zoom_webhook', {
    accountId,
    payload: event.payload ?? null,
  })

  if (event.event === 'meeting.participant_joined' || event.event === 'meeting.participant_left') {
    const participant = (event.payload?.object?.participant ?? {}) as Record<
      string,
      unknown
    >

    await upsertMeetingParticipant(meeting.id, {
      providerParticipantId:
        participant.id != null ? String(participant.id) : null,
      displayName:
        typeof participant.user_name === 'string'
          ? participant.user_name
          : typeof participant.name === 'string'
            ? participant.name
            : null,
      email:
        typeof participant.email === 'string' ? participant.email : null,
      joinedAt:
        event.event === 'meeting.participant_joined' ? new Date() : null,
      leftAt: event.event === 'meeting.participant_left' ? new Date() : null,
    })
  }

  return { ok: true as const, meetingSessionId: meeting.id }
}

export async function notifyZoomGatewayOfRtmsStart(meetingSessionId: string) {
  if (!env.ZOOM_GATEWAY_URL) return

  await fetch(`${env.ZOOM_GATEWAY_URL}/internal/rtms/start`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(env.ZOOM_GATEWAY_INTERNAL_TOKEN
        ? { Authorization: `Bearer ${env.ZOOM_GATEWAY_INTERNAL_TOKEN}` }
        : {}),
    },
    body: JSON.stringify({ meetingSessionId }),
  }).catch(() => null)
}
