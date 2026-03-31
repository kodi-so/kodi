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
    operator_id?: string | number
    meeting_id?: string | number
    meeting_uuid?: string
    webinar_uuid?: string
    session_id?: string
    rtms_stream_id?: string
    server_urls?: string
    signature?: string
    participant?: Record<string, unknown>
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

export type ZoomRtmsJoinPayload = {
  meeting_uuid?: string
  webinar_uuid?: string
  session_id?: string
  rtms_stream_id: string
  server_urls: string
  signature?: string
}

function asDate(value: unknown) {
  if (!value || typeof value !== 'string') return null
  const parsed = new Date(value)
  return Number.isNaN(parsed.getTime()) ? null : parsed
}

function extractMeetingObject(event: ZoomWebhookEnvelope) {
  const payload = event.payload ?? {}
  const object = payload.object ?? {}
  const providerMeetingId = object.id != null
    ? String(object.id)
    : payload.meeting_id != null
      ? String(payload.meeting_id)
      : null
  const providerMeetingUuid =
    object.uuid != null
      ? String(object.uuid)
      : typeof payload.meeting_uuid === 'string'
        ? payload.meeting_uuid
        : null

  return {
    providerMeetingId,
    providerMeetingUuid,
    title: typeof object.topic === 'string' ? object.topic : null,
    actualStartAt:
      asDate(object.start_time) ??
      asDate((payload as Record<string, unknown>).start_time),
    endedAt:
      asDate(object.end_time) ??
      asDate((payload as Record<string, unknown>).end_time),
    metadata:
      payload && Object.keys(payload).length > 0
        ? (payload as Record<string, unknown>)
        : object,
  }
}

function extractOperatorId(event: ZoomWebhookEnvelope) {
  const operatorId =
    event.payload?.operator_id ?? event.payload?.operator ?? null
  return operatorId != null ? String(operatorId) : null
}

function extractRtmsJoinPayload(
  event: ZoomWebhookEnvelope
): ZoomRtmsJoinPayload | null {
  if (event.event !== 'meeting.rtms_started') return null

  const payload = event.payload ?? {}
  const rtmsStreamId =
    typeof payload.rtms_stream_id === 'string' ? payload.rtms_stream_id : null
  const serverUrls =
    typeof payload.server_urls === 'string' ? payload.server_urls : null

  if (!rtmsStreamId || !serverUrls) return null

  const joinPayload: ZoomRtmsJoinPayload = {
    rtms_stream_id: rtmsStreamId,
    server_urls: serverUrls,
  }

  if (typeof payload.meeting_uuid === 'string') {
    joinPayload.meeting_uuid = payload.meeting_uuid
  }
  if (typeof payload.webinar_uuid === 'string') {
    joinPayload.webinar_uuid = payload.webinar_uuid
  }
  if (typeof payload.session_id === 'string') {
    joinPayload.session_id = payload.session_id
  }
  if (typeof payload.signature === 'string') {
    joinPayload.signature = payload.signature
  }

  return joinPayload
}

export async function resolveZoomInstallation(
  accountId: string | null,
  operatorId: string | null
) {
  if (accountId) {
    const installationByAccount = await db.query.providerInstallations.findFirst({
      where: (fields, { and, eq }) =>
        and(eq(fields.provider, 'zoom'), eq(fields.externalAccountId, accountId)),
    })

    if (installationByAccount) return installationByAccount
  }

  if (!operatorId) return null

  const zoomInstallations = await db.query.providerInstallations.findMany({
    where: (fields, { eq }) => eq(fields.provider, 'zoom'),
    columns: {
      id: true,
      orgId: true,
      installerUserId: true,
      externalAccountId: true,
      externalAccountEmail: true,
      status: true,
      accessTokenEncrypted: true,
      refreshTokenEncrypted: true,
      tokenExpiresAt: true,
      scopes: true,
      metadata: true,
      errorMessage: true,
      createdAt: true,
      updatedAt: true,
    },
  })

  return (
    zoomInstallations.find((installation) => {
      const zoomUserId = installation.metadata?.zoomUserId
      return zoomUserId != null && String(zoomUserId) === operatorId
    }) ?? null
  )
}

export async function updateMeetingSessionRuntimeState(
  meetingSessionId: string,
  input: {
    status?: 'joining' | 'live' | 'completed' | 'failed'
    actualStartAt?: Date | null
    endedAt?: Date | null
    metadataPatch?: Record<string, unknown> | null
  }
) {
  const existing = await db.query.meetingSessions.findFirst({
    where: (fields, { eq }) => eq(fields.id, meetingSessionId),
    columns: {
      id: true,
      metadata: true,
      status: true,
      actualStartAt: true,
      endedAt: true,
    },
  })

  if (!existing) return null

  const metadata =
    input.metadataPatch === undefined
      ? existing.metadata
      : {
          ...(existing.metadata ?? {}),
          ...(input.metadataPatch ?? {}),
        }

  await db
    .update(meetingSessions)
    .set({
      status: input.status ?? existing.status,
      actualStartAt:
        input.actualStartAt === undefined
          ? existing.actualStartAt
          : input.actualStartAt,
      endedAt:
        input.endedAt === undefined ? existing.endedAt : input.endedAt,
      metadata,
      updatedAt: new Date(),
    })
    .where(eq(meetingSessions.id as never, meetingSessionId as never) as never)

  return db.query.meetingSessions.findFirst({
    where: (fields, { eq }) => eq(fields.id, meetingSessionId),
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
        : event.event === 'meeting.rtms_stopped'
          ? 'failed'
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
  const operatorId = extractOperatorId(event)

  const installation = await resolveZoomInstallation(accountId, operatorId)
  if (!installation) {
    return { ok: true as const, ignored: 'unmapped-account' as const }
  }

  const meeting = await upsertMeetingSessionFromZoomEvent(installation, event)
  if (!meeting) {
    return { ok: true as const, ignored: 'missing-meeting-identity' as const }
  }

  await appendMeetingEvent(meeting.id, event.event ?? 'zoom.unknown', 'zoom_webhook', {
    accountId,
    operatorId,
    payload: event.payload ?? null,
  })

  if (event.event === 'meeting.participant_joined' || event.event === 'meeting.participant_left') {
    const participant = (
      event.payload?.object?.participant ?? event.payload?.participant ?? {}
    ) as Record<string, unknown>

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

  const rtmsJoinPayload = extractRtmsJoinPayload(event)

  return {
    ok: true as const,
    meetingSessionId: meeting.id,
    rtmsJoinPayload,
    gatewayAction:
      event.event === 'meeting.rtms_started'
        ? ('start' as const)
        : event.event === 'meeting.rtms_stopped' || event.event === 'meeting.ended'
          ? ('stop' as const)
          : null,
  }
}

export async function notifyZoomGatewayOfRtmsStart(input: {
  meetingSessionId: string
  joinPayload: ZoomRtmsJoinPayload | null
}) {
  if (!env.ZOOM_GATEWAY_URL) return

  await fetch(`${env.ZOOM_GATEWAY_URL}/internal/rtms/start`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(env.ZOOM_GATEWAY_INTERNAL_TOKEN
        ? { Authorization: `Bearer ${env.ZOOM_GATEWAY_INTERNAL_TOKEN}` }
        : {}),
    },
    body: JSON.stringify(input),
  }).catch(() => null)
}

export async function notifyZoomGatewayOfRtmsStop(input: {
  meetingSessionId: string
  reason: string
  finalStatus?: 'completed' | 'failed'
}) {
  if (!env.ZOOM_GATEWAY_URL) return

  const url = `${env.ZOOM_GATEWAY_URL}/internal/rtms/${input.meetingSessionId}/stop`

  await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(env.ZOOM_GATEWAY_INTERNAL_TOKEN
        ? { Authorization: `Bearer ${env.ZOOM_GATEWAY_INTERNAL_TOKEN}` }
        : {}),
    },
    body: JSON.stringify({
      reason: input.reason,
      finalStatus: input.finalStatus ?? 'completed',
    }),
  }).catch(() => null)
}
