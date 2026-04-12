import {
  db,
  desc,
  eq,
  meetingEvents,
  meetingParticipants,
  meetingSessions,
  transcriptSegments,
} from '@kodi/db'
import type {
  MeetingChatEvent,
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
  if (event.kind === 'chat') return event.action
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

  if (event.kind === 'chat') {
    const chatEvent: MeetingChatEvent = event
    return {
      occurredAt: chatEvent.occurredAt.toISOString(),
      message: chatEvent.message,
      session: chatEvent.session ?? null,
      metadata: chatEvent.metadata ?? null,
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

  if (normalizedEvent.kind === 'chat' && normalizedEvent.message.sender) {
    await upsertMeetingParticipant(meetingSessionId, {
      providerParticipantId:
        normalizedEvent.message.sender.providerParticipantId ?? null,
      displayName: normalizedEvent.message.sender.displayName ?? null,
      email: normalizedEvent.message.sender.email ?? null,
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
