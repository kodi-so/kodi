import {
  db,
  desc,
  eq,
  meetingEvents,
  meetingParticipants,
  meetingSessions,
  transcriptSegments,
} from '@kodi/db'
import { logActivity } from '../activity'
import { env } from '../../env'
import type {
  MeetingHealthEvent,
  MeetingLifecycleEvent,
  MeetingParticipantEvent,
  MeetingProviderEvent,
  MeetingTranscriptEvent,
} from './events'
import {
  meetingStatusFromLifecycleEvent,
  transitionMeetingStatus,
  type MeetingSessionStatus,
} from './status'

type PersistedTranscriptSegment = typeof transcriptSegments.$inferSelect

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

type TranscriptPersistenceResult = {
  operation: 'created' | 'updated' | 'ignored'
  segment: PersistedTranscriptSegment
}

export type AppendNormalizedMeetingEventResult = {
  persistedEvent: Awaited<ReturnType<typeof appendMeetingEvent>> | null
  transcriptOperation?: TranscriptPersistenceResult['operation']
  shouldFanOut: boolean
}

export type MeetingIngestionSource =
  | 'zoom_webhook'
  | 'recall_webhook'
  | 'rtms'
  | 'kodi_ui'
  | 'agent'
  | 'worker'

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
    providerMeetingInstanceId: providerMeetingUuid,
    providerBotSessionId:
      typeof payload.session_id === 'string'
        ? payload.session_id
        : typeof payload.rtms_stream_id === 'string'
          ? payload.rtms_stream_id
          : null,
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
    status?: MeetingSessionStatus
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
      status: input.status
        ? transitionMeetingStatus(
            existing.status as MeetingSessionStatus,
            input.status
          )
        : existing.status,
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
  const {
    providerMeetingId,
    providerMeetingUuid,
    providerMeetingInstanceId,
    providerBotSessionId,
    title,
    actualStartAt,
    endedAt,
    metadata,
  } = extractMeetingObject(event)

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
      ? 'ended'
      : event.event === 'meeting.rtms_started'
        ? 'joining'
        : event.event === 'meeting.rtms_stopped'
          ? 'failed'
          : 'listening'

  if (existing) {
    await db
      .update(meetingSessions)
      .set({
        providerMeetingId: providerMeetingId ?? existing.providerMeetingId,
        providerMeetingUuid: providerMeetingUuid ?? existing.providerMeetingUuid,
        providerMeetingInstanceId:
          providerMeetingInstanceId ?? existing.providerMeetingInstanceId,
        providerBotSessionId:
          providerBotSessionId ?? existing.providerBotSessionId,
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
      providerMeetingInstanceId,
      providerBotSessionId,
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
  source: MeetingIngestionSource,
  payload?: Record<string, unknown> | null,
  dedupeKey?: string | null
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
      dedupeKey: dedupeKey ?? null,
      payload: payload ?? null,
      occurredAt: new Date(),
    })
    .onConflictDoNothing()
    .returning()

  // null means the row was silently deduplicated (same dedupeKey already exists)
  return created ?? null
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
  segments: TranscriptSegmentInput[],
  source: MeetingIngestionSource = 'rtms'
) {
  if (segments.length === 0) return []

  const persisted: TranscriptPersistenceResult[] = []
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

    const recentSegments = await db.query.transcriptSegments.findMany({
      where: (fields, { and, eq }) =>
        and(
          eq(fields.meetingSessionId, meetingSessionId),
          eq(fields.source, source)
        ),
      orderBy: (fields, { desc }) => desc(fields.createdAt),
      limit: 5,
    })

    const normalizeContent = (value: string) =>
      value.trim().replace(/\s+/g, ' ').toLowerCase()

    const currentSpeakerName = segment.speakerName ?? null
    const normalizedContent = normalizeContent(segment.content)
    const recentPartial = recentSegments.find((existing) => {
      if (!existing.isPartial) return false

      const sameParticipant =
        participantId != null &&
        existing.speakerParticipantId != null &&
        existing.speakerParticipantId === participantId

      const sameSpeakerName =
        currentSpeakerName != null &&
        existing.speakerName != null &&
        existing.speakerName === currentSpeakerName

      if (!sameParticipant && !sameSpeakerName) return false

      return Date.now() - existing.createdAt.getTime() <= 90_000
    })

    const recentCommittedDuplicate = recentSegments.find((existing) => {
      if (existing.isPartial) return false

      const sameParticipant =
        participantId != null &&
        existing.speakerParticipantId != null &&
        existing.speakerParticipantId === participantId

      const sameSpeakerName =
        currentSpeakerName != null &&
        existing.speakerName != null &&
        existing.speakerName === currentSpeakerName

      if (!sameParticipant && !sameSpeakerName) return false

      const existingContent = normalizeContent(existing.content)
      if (existingContent !== normalizedContent) return false

      return Date.now() - existing.createdAt.getTime() <= 120_000
    })

    if (recentPartial) {
      const [updated] = await db
        .update(transcriptSegments)
        .set({
          speakerParticipantId:
            participantId ?? recentPartial.speakerParticipantId,
          speakerName: currentSpeakerName ?? recentPartial.speakerName,
          content: segment.content,
          startOffsetMs: segment.startOffsetMs ?? recentPartial.startOffsetMs,
          endOffsetMs: segment.endOffsetMs ?? recentPartial.endOffsetMs,
          confidence: segment.confidence ?? recentPartial.confidence,
          isPartial: segment.isPartial ?? false,
        })
        .where(
          eq(transcriptSegments.id as never, recentPartial.id as never) as never
        )
        .returning()

      if (updated) {
        await db
          .update(meetingSessions)
          .set({ updatedAt: new Date() })
          .where(eq(meetingSessions.id as never, meetingSessionId as never) as never)

        persisted.push({
          operation: 'updated',
          segment: updated,
        })
        continue
      }
    }

    if (recentCommittedDuplicate) {
      persisted.push({
        operation: 'ignored',
        segment: recentCommittedDuplicate,
      })
      continue
    }

    const [created] = await db
      .insert(transcriptSegments)
      .values({
        meetingSessionId,
        speakerParticipantId: participantId,
        speakerName: currentSpeakerName,
        content: segment.content,
        startOffsetMs: segment.startOffsetMs ?? null,
        endOffsetMs: segment.endOffsetMs ?? null,
        confidence: segment.confidence ?? null,
        isPartial: segment.isPartial ?? false,
        source,
      })
      .returning()

    if (!created) {
      throw new Error('Failed to append transcript segment')
    }

    await db
      .update(meetingSessions)
      .set({ updatedAt: new Date() })
      .where(eq(meetingSessions.id as never, meetingSessionId as never) as never)

    persisted.push({
      operation: 'created',
      segment: created,
    })
  }

  return persisted
}

function normalizedEventType(event: MeetingProviderEvent) {
  if (event.kind === 'transcript') return 'meeting.transcript.segment_received'
  if (event.kind === 'participant') return event.action
  if (event.kind === 'lifecycle') return event.action
  return 'meeting.health.updated'
}

function normalizedEventPayload(event: MeetingProviderEvent) {
  if (event.kind === 'transcript') {
    const transcriptEvent: MeetingTranscriptEvent = event
    return {
      occurredAt: transcriptEvent.occurredAt.toISOString(),
      transcriptEventId: transcriptEvent.transcriptEventId ?? null,
      transcript: transcriptEvent.transcript,
      session: transcriptEvent.session ?? null,
      metadata: transcriptEvent.metadata ?? null,
    }
  }

  if (event.kind === 'participant') {
    const participantEvent: MeetingParticipantEvent = event
    return {
      occurredAt: participantEvent.occurredAt.toISOString(),
      participant: participantEvent.participant,
      session: participantEvent.session ?? null,
      metadata: participantEvent.metadata ?? null,
    }
  }

  if (event.kind === 'lifecycle') {
    const lifecycleEvent: MeetingLifecycleEvent = event
    return {
      occurredAt: lifecycleEvent.occurredAt.toISOString(),
      state: lifecycleEvent.state,
      errorCode: lifecycleEvent.errorCode ?? null,
      errorMessage: lifecycleEvent.errorMessage ?? null,
      session: lifecycleEvent.session ?? null,
      metadata: lifecycleEvent.metadata ?? null,
    }
  }

  const healthEvent: MeetingHealthEvent = event
  return {
    occurredAt: healthEvent.occurredAt.toISOString(),
    health: healthEvent.health,
    session: healthEvent.session ?? null,
    metadata: healthEvent.metadata ?? null,
  }
}

async function sanitizeLifecycleEventForPersistence(
  meetingSessionId: string,
  event: MeetingLifecycleEvent
): Promise<MeetingLifecycleEvent> {
  if (event.action !== 'meeting.failed' || event.state !== 'failed') {
    return event
  }

  const meetingSession = await db.query.meetingSessions.findFirst({
    where: (fields, { eq }) => eq(fields.id, meetingSessionId),
    columns: {
      status: true,
      endedAt: true,
      actualStartAt: true,
    },
  })

  if (!meetingSession) return event

  const currentStatus = meetingSession.status as MeetingSessionStatus
  const shouldTreatAsEnded =
    ['admitted', 'listening', 'processing', 'ended'].includes(currentStatus) ||
    meetingSession.endedAt != null ||
    meetingSession.actualStartAt != null

  if (!shouldTreatAsEnded) {
    return event
  }

  return {
    ...event,
    action: 'meeting.ended',
    state: 'stopped',
    errorCode: null,
    errorMessage: null,
    metadata: {
      ...(event.metadata ?? {}),
      normalizedFromFailure: true,
    },
  }
}

export async function appendNormalizedMeetingEvent(
  meetingSessionId: string,
  event: MeetingProviderEvent,
  source: MeetingIngestionSource = 'worker',
  dedupeKey?: string | null
): Promise<AppendNormalizedMeetingEventResult> {
  const normalizedEvent =
    event.kind === 'lifecycle'
      ? await sanitizeLifecycleEventForPersistence(meetingSessionId, event)
      : event
  let transcriptOperation: TranscriptPersistenceResult['operation'] | undefined

  if (normalizedEvent.kind === 'participant') {
    await upsertMeetingParticipant(meetingSessionId, {
      providerParticipantId:
        normalizedEvent.participant.providerParticipantId ?? null,
      displayName: normalizedEvent.participant.displayName ?? null,
      email: normalizedEvent.participant.email ?? null,
      joinedAt:
        normalizedEvent.action === 'participant.joined'
          ? normalizedEvent.occurredAt
          : null,
      leftAt:
        normalizedEvent.action === 'participant.left'
          ? normalizedEvent.occurredAt
          : null,
      metadata: normalizedEvent.metadata ?? null,
    })
  }

  if (normalizedEvent.kind === 'transcript') {
    const [persistedTranscript] = await appendTranscriptSegments(meetingSessionId, [
      {
        providerParticipantId:
          normalizedEvent.transcript.speaker?.providerParticipantId ?? null,
        speakerName: normalizedEvent.transcript.speaker?.displayName ?? null,
        content: normalizedEvent.transcript.content,
        startOffsetMs: normalizedEvent.transcript.startOffsetMs ?? null,
        endOffsetMs: normalizedEvent.transcript.endOffsetMs ?? null,
        confidence: normalizedEvent.transcript.confidence ?? null,
        isPartial: normalizedEvent.transcript.isPartial ?? false,
      },
    ], source)

    transcriptOperation = persistedTranscript?.operation ?? 'ignored'

    const shouldFanOut =
      transcriptOperation !== 'ignored' && !normalizedEvent.transcript.isPartial

    if (!shouldFanOut) {
      return {
        persistedEvent: null,
        transcriptOperation,
        shouldFanOut: false,
      }
    }
  }

  if (normalizedEvent.kind === 'lifecycle') {
    const nextStatus = meetingStatusFromLifecycleEvent(normalizedEvent)
    if (nextStatus) {
      await updateMeetingSessionRuntimeState(meetingSessionId, {
        status: nextStatus,
        actualStartAt:
          normalizedEvent.action === 'meeting.started'
            ? normalizedEvent.occurredAt
            : undefined,
        endedAt:
          normalizedEvent.action === 'meeting.ended' ||
          normalizedEvent.action === 'meeting.stopped'
            ? normalizedEvent.occurredAt
            : undefined,
        metadataPatch: normalizedEvent.metadata ?? undefined,
      })
    }
  }

  const persistedEvent = await appendMeetingEvent(
    meetingSessionId,
    normalizedEventType(normalizedEvent),
    source,
    normalizedEventPayload(normalizedEvent),
    dedupeKey ?? null
  )

  if (!persistedEvent) {
    // Row was silently deduplicated — skip fan-out for this delivery
    return {
      persistedEvent: null,
      transcriptOperation,
      shouldFanOut: false,
    }
  }

  return {
    persistedEvent,
    transcriptOperation,
    shouldFanOut: true,
  }
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
  finalStatus?: 'ended' | 'failed'
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
      finalStatus: input.finalStatus ?? 'ended',
    }),
  }).catch(() => null)
}
