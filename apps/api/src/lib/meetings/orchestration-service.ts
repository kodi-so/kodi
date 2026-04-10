import { and, db, eq, meetingSessions, or } from '@kodi/db'
import {
  appendNormalizedMeetingEvent,
  type MeetingIngestionSource,
  updateMeetingSessionRuntimeState,
} from './ingestion'
import { processMeetingDraftActions } from './openclaw-draft-actions'
import { processMeetingCandidateTasks } from './openclaw-candidate-tasks'
import { forwardMeetingEventToOpenClaw } from './openclaw-forwarder'
import { processMeetingRollingNotes } from './openclaw-rolling-notes'
import type {
  MeetingBotIdentity,
  MeetingProviderActorIdentity,
  MeetingProviderJoinTarget,
} from './provider-adapter'
import { MeetingProviderGateway } from './provider-gateway'
import { RecallMeetingJoinError } from '../providers/recall/client'
import type {
  MeetingChatMessageEvent,
  MeetingAdapterLifecycleState,
  MeetingProviderEvent,
  MeetingProviderEventEnvelope,
  MeetingProviderSessionRef,
  MeetingProviderSlug,
} from './events'
import {
  normalizeMeetingStatus,
  transitionMeetingStatus,
  type MeetingSessionStatus,
} from './status'

type MeetingSessionRecord = typeof meetingSessions.$inferSelect

type EnsureMeetingSessionInput = {
  orgId: string
  provider: MeetingProviderSlug
  session?: MeetingProviderSessionRef | null
  providerInstallationId?: string | null
  hostUserId?: string | null
  title?: string | null
  status?: MeetingSessionStatus
  metadata?: Record<string, unknown> | null
}

type IngestNormalizedEventInput = Omit<EnsureMeetingSessionInput, 'provider'> & {
  event: MeetingProviderEvent
  source?: MeetingIngestionSource
}

type IngestProviderEnvelopeInput = EnsureMeetingSessionInput & {
  envelope: MeetingProviderEventEnvelope
  source?: MeetingIngestionSource
}

type RequestBotJoinInput = {
  orgId: string
  provider: MeetingProviderSlug
  actor?: MeetingProviderActorIdentity | null
  meeting: MeetingProviderJoinTarget
  botIdentity?: MeetingBotIdentity | null
  providerInstallationId?: string | null
  hostUserId?: string | null
  metadata?: Record<string, unknown> | null
}

function lifecycleStateToMeetingStatus(
  state: MeetingAdapterLifecycleState
): MeetingSessionStatus | undefined {
  if (state === 'failed') return 'failed'
  if (state === 'stopped') return 'ended'
  if (state === 'listening') return 'listening'
  if (state === 'waiting_for_admission') return 'admitted'
  if (state === 'joining') return 'joining'
  if (state === 'preparing') return 'preparing'

  return undefined
}

function meetingStatusFromEvent(
  event: MeetingProviderEvent
): MeetingSessionStatus | undefined {
  if (event.kind !== 'lifecycle') return undefined
  return lifecycleStateToMeetingStatus(event.state)
}

export class MeetingOrchestrationService {
  constructor(
    private readonly gateway: MeetingProviderGateway,
    private readonly database = db
  ) {}

  private async runPostIngestionWork(input: {
    orgId: string
    meetingSession: MeetingSessionRecord
    persistedEvent: NonNullable<
      Awaited<ReturnType<typeof appendNormalizedMeetingEvent>>['persistedEvent']
    >
    event: MeetingProviderEvent
    source: MeetingIngestionSource
  }) {
    const forwardResult = await forwardMeetingEventToOpenClaw({
      orgId: input.orgId,
      meetingSession: input.meetingSession,
      persistedEvent: input.persistedEvent,
      event: input.event,
      source: input.source,
    })

    if (
      !forwardResult.ok &&
      'reason' in forwardResult &&
      forwardResult.reason !== 'missing-instance'
    ) {
      console.warn('[meetings] openclaw forward failed', {
        orgId: input.orgId,
        meetingSessionId: input.meetingSession.id,
        eventId: input.persistedEvent.id,
        reason: forwardResult.reason,
        error: 'error' in forwardResult ? forwardResult.error ?? null : null,
      })
    }

    if (input.event.kind === 'transcript' && !input.event.transcript.isPartial) {
      const rollingNotesResult = await processMeetingRollingNotes({
        orgId: input.orgId,
        meetingSession: input.meetingSession,
        lastEventSequence: input.persistedEvent.sequence,
      })

      if (
        !rollingNotesResult.ok &&
        'reason' in rollingNotesResult &&
        rollingNotesResult.reason !== 'missing-instance'
      ) {
        console.warn('[meetings] openclaw rolling notes failed', {
          orgId: input.orgId,
          meetingSessionId: input.meetingSession.id,
          eventId: input.persistedEvent.id,
          reason: rollingNotesResult.reason,
          error:
            'error' in rollingNotesResult ? rollingNotesResult.error ?? null : null,
        })
      }

      const candidateTasksResult = await processMeetingCandidateTasks({
        orgId: input.orgId,
        meetingSession: input.meetingSession,
        lastEventSequence: input.persistedEvent.sequence,
      })

      if (
        !candidateTasksResult.ok &&
        'reason' in candidateTasksResult &&
        candidateTasksResult.reason !== 'missing-instance'
      ) {
        console.warn('[meetings] openclaw candidate tasks failed', {
          orgId: input.orgId,
          meetingSessionId: input.meetingSession.id,
          eventId: input.persistedEvent.id,
          reason: candidateTasksResult.reason,
          error:
            'error' in candidateTasksResult
              ? candidateTasksResult.error ?? null
              : null,
        })
      }

      const draftActionsResult = await processMeetingDraftActions({
        orgId: input.orgId,
        meetingSession: input.meetingSession,
        lastEventSequence: input.persistedEvent.sequence,
      })

      if (
        !draftActionsResult.ok &&
        'reason' in draftActionsResult &&
        draftActionsResult.reason !== 'missing-instance'
      ) {
        console.warn('[meetings] openclaw draft actions failed', {
          orgId: input.orgId,
          meetingSessionId: input.meetingSession.id,
          eventId: input.persistedEvent.id,
          reason: draftActionsResult.reason,
          error:
            'error' in draftActionsResult
              ? draftActionsResult.error ?? null
              : null,
        })
      }
    }
  }

  private async findMeetingSession(
    orgId: string,
    provider: MeetingProviderSlug,
    session?: MeetingProviderSessionRef | null
  ) {
    const internalMeetingSessionId = session?.internalMeetingSessionId

    if (internalMeetingSessionId) {
      const byId = await this.database.query.meetingSessions.findFirst({
        where: (fields, { and, eq }) =>
          and(
            eq(fields.id, internalMeetingSessionId),
            eq(fields.orgId, orgId)
          ),
      })

      if (byId) return byId
    }

    const externalMeetingInstanceId = session?.externalMeetingInstanceId
    const externalMeetingId = session?.externalMeetingId
    const externalBotSessionId = session?.externalBotSessionId

    if (
      !externalMeetingInstanceId &&
      !externalMeetingId &&
      !externalBotSessionId
    ) {
      return null
    }

    return this.database.query.meetingSessions.findFirst({
      where: (fields, { and, eq, or }) =>
        and(
          eq(fields.orgId, orgId),
          eq(fields.provider, provider as never),
          or(
            externalMeetingInstanceId
              ? eq(
                  fields.providerMeetingInstanceId,
                  externalMeetingInstanceId
                )
              : undefined,
            externalMeetingId
              ? eq(fields.providerMeetingId, externalMeetingId)
              : undefined,
            externalBotSessionId
              ? eq(fields.providerBotSessionId, externalBotSessionId)
              : undefined
          )
        ),
    })
  }

  async createOrUpdateMeetingSession(
    input: EnsureMeetingSessionInput
  ): Promise<MeetingSessionRecord> {
    const existing = await this.findMeetingSession(
      input.orgId,
      input.provider,
      input.session
    )

    if (existing) {
      const [updated] = await this.database
        .update(meetingSessions)
        .set({
          providerInstallationId:
            input.providerInstallationId ?? existing.providerInstallationId,
          providerMeetingId:
            input.session?.externalMeetingId ?? existing.providerMeetingId,
          providerMeetingInstanceId:
            input.session?.externalMeetingInstanceId ??
            existing.providerMeetingInstanceId,
          providerBotSessionId:
            input.session?.externalBotSessionId ?? existing.providerBotSessionId,
          hostUserId: input.hostUserId ?? existing.hostUserId,
          title: input.title ?? existing.title,
          status: input.status
            ? transitionMeetingStatus(
                existing.status as MeetingSessionStatus,
                input.status
              )
            : existing.status,
          metadata:
            input.metadata === undefined
              ? existing.metadata
              : {
                  ...(existing.metadata ?? {}),
                  ...(input.metadata ?? {}),
                },
          updatedAt: new Date(),
        })
        .where(eq(meetingSessions.id as never, existing.id as never) as never)
        .returning()

      if (updated) return updated
    }

    const [created] = await this.database
      .insert(meetingSessions)
      .values({
        id: input.session?.internalMeetingSessionId,
        orgId: input.orgId,
        provider: input.provider as never,
        providerInstallationId: input.providerInstallationId ?? null,
        providerMeetingId: input.session?.externalMeetingId ?? null,
        providerMeetingInstanceId:
          input.session?.externalMeetingInstanceId ?? null,
        providerBotSessionId: input.session?.externalBotSessionId ?? null,
        hostUserId: input.hostUserId ?? null,
        title: input.title ?? null,
        status: normalizeMeetingStatus(input.status ?? 'scheduled'),
        metadata: input.metadata ?? null,
      })
      .returning()

    if (!created) {
      throw new Error('Failed to create meeting session')
    }

    return created
  }

  async endMeetingSession(input: {
    orgId: string
    provider: MeetingProviderSlug
    session?: MeetingProviderSessionRef | null
    status?: Extract<MeetingSessionStatus, 'ended' | 'failed'>
    endedAt?: Date
    metadata?: Record<string, unknown> | null
  }) {
    const meetingSession = await this.createOrUpdateMeetingSession({
      orgId: input.orgId,
      provider: input.provider,
      session: input.session,
      status: input.status ?? 'ended',
      metadata: input.metadata ?? null,
    })

    await updateMeetingSessionRuntimeState(meetingSession.id, {
      status: input.status ?? 'ended',
      endedAt: input.endedAt ?? new Date(),
      metadataPatch: input.metadata ?? undefined,
    })

    const updated = await this.database.query.meetingSessions.findFirst({
      where: (fields, { eq }) => eq(fields.id, meetingSession.id),
    })

    if (!updated) {
      throw new Error('Failed to load updated meeting session')
    }

    return updated
  }

  async requestBotJoin(input: RequestBotJoinInput) {
    const preparedSession = await this.createOrUpdateMeetingSession({
      orgId: input.orgId,
      provider: input.provider,
      session: {
        externalMeetingId: input.meeting.externalMeetingId ?? null,
      },
      providerInstallationId: input.providerInstallationId,
      hostUserId: input.hostUserId,
      title: input.meeting.title ?? null,
      status: 'preparing',
      metadata: {
        transportRequestedAt: new Date().toISOString(),
        ...(input.metadata ?? {}),
      },
    })

    let joinResult
    try {
      joinResult = await this.gateway.join({
        orgId: input.orgId,
        provider: input.provider,
        providerInstallationId: input.providerInstallationId,
        actor: input.actor ?? null,
        meeting: input.meeting,
        botIdentity: input.botIdentity ?? null,
        session: {
          internalMeetingSessionId: preparedSession.id,
          externalMeetingId:
            preparedSession.providerMeetingId ??
            input.meeting.externalMeetingId ??
            null,
          externalMeetingInstanceId:
            preparedSession.providerMeetingInstanceId ?? null,
          externalBotSessionId: preparedSession.providerBotSessionId ?? null,
        },
        metadata: input.metadata ?? null,
      })
    } catch (error) {
      if (error instanceof RecallMeetingJoinError) {
        const lastAttempt = error.attempts[error.attempts.length - 1] ?? null
        await updateMeetingSessionRuntimeState(preparedSession.id, {
          status: 'failed',
          metadataPatch: {
            transport: 'recall',
            failure: error.failure,
            lastErrorMessage: error.message,
            retryCount: Math.max(0, error.attempts.length - 1),
            retryHistory: error.attempts,
            lastJoinAttemptAt:
              lastAttempt?.completedAt ?? new Date().toISOString(),
          },
        })
      }

      throw error
    }

    const meetingSession = await this.createOrUpdateMeetingSession({
      orgId: input.orgId,
      provider: input.provider,
      session: joinResult.session,
      providerInstallationId: input.providerInstallationId,
      hostUserId: input.hostUserId,
      title: input.meeting.title ?? null,
      status:
        lifecycleStateToMeetingStatus(joinResult.lifecycleState) ?? 'joining',
      metadata: {
        transport: 'recall',
        transportRequestedAt: new Date().toISOString(),
        ...(joinResult.metadata ?? {}),
        ...(input.metadata ?? {}),
      },
    })

    return {
      meetingSession,
      joinResult,
    }
  }

  async sendChatMessage(input: {
    orgId: string
    meetingSessionId: string
    message: string
    to?: string | null
  }) {
    const meetingSession = await this.database.query.meetingSessions.findFirst({
      where: (fields, { and, eq }) =>
        and(eq(fields.id, input.meetingSessionId), eq(fields.orgId, input.orgId)),
    })

    if (!meetingSession) {
      throw new Error('Meeting session not found.')
    }

    const sendResult = await this.gateway.sendChatMessage({
      orgId: input.orgId,
      provider: meetingSession.provider,
      session: {
        internalMeetingSessionId: meetingSession.id,
        externalMeetingId: meetingSession.providerMeetingId ?? null,
        externalMeetingInstanceId:
          meetingSession.providerMeetingInstanceId ?? null,
        externalBotSessionId: meetingSession.providerBotSessionId ?? null,
      },
      message: input.message,
      to: input.to ?? 'everyone',
    })

    const normalizedEvent: MeetingChatMessageEvent = {
      kind: 'chat_message',
      provider: meetingSession.provider,
      occurredAt: sendResult.acceptedAt,
      session: sendResult.session ?? null,
      action: 'meeting.chat_message.sent',
      message: {
        content: input.message,
        to: sendResult.recipient,
        sender: {
          displayName: 'Kodi',
          isInternal: true,
        },
      },
      metadata: {
        ...(sendResult.metadata ?? {}),
        origin: 'kodi_ui',
      },
    }

    const appendResult = await appendNormalizedMeetingEvent(
      meetingSession.id,
      normalizedEvent,
      'kodi_ui'
    )

    const updatedMeetingSession = await this.database.query.meetingSessions.findFirst({
      where: (fields, { eq }) => eq(fields.id, meetingSession.id),
    })

    if (
      updatedMeetingSession &&
      appendResult.persistedEvent &&
      appendResult.shouldFanOut
    ) {
      await this.runPostIngestionWork({
        orgId: input.orgId,
        meetingSession: updatedMeetingSession,
        persistedEvent: appendResult.persistedEvent,
        event: normalizedEvent,
        source: 'kodi_ui',
      })
    }

    return {
      meetingSession: updatedMeetingSession ?? meetingSession,
      sendResult,
      persistedEvent: appendResult.persistedEvent,
    }
  }

  async ingestNormalizedEvent(input: IngestNormalizedEventInput) {
    const meetingSession = await this.createOrUpdateMeetingSession({
      orgId: input.orgId,
      provider: input.event.provider,
      session: input.event.session ?? input.session,
      providerInstallationId: input.providerInstallationId,
      hostUserId: input.hostUserId,
      title: input.title,
      status: input.status ?? meetingStatusFromEvent(input.event),
      metadata: input.metadata ?? input.event.metadata ?? null,
    })

    const persistedEvent = await appendNormalizedMeetingEvent(
      meetingSession.id,
      input.event,
      input.source ?? 'worker'
    )

    if (!persistedEvent.shouldFanOut || !persistedEvent.persistedEvent) {
      return {
        meetingSession,
        event: input.event,
      }
    }

    const persistedEventRecord = persistedEvent.persistedEvent

    const updated = await this.database.query.meetingSessions.findFirst({
      where: (fields, { eq }) => eq(fields.id, meetingSession.id),
    })

    const resolvedMeetingSession = updated ?? meetingSession

    const postIngestionWork = this.runPostIngestionWork({
      orgId: input.orgId,
      meetingSession: resolvedMeetingSession,
      persistedEvent: persistedEventRecord,
      event: input.event,
      source: input.source ?? 'worker',
    })

    if (input.source === 'recall_webhook') {
      void postIngestionWork.catch((error) => {
        console.warn('[meetings] deferred post-ingestion work failed', {
          orgId: input.orgId,
          meetingSessionId: resolvedMeetingSession.id,
          eventId: persistedEventRecord.id,
          error: error instanceof Error ? error.message : String(error),
        })
      })
    } else {
      await postIngestionWork
    }

    return {
      meetingSession: resolvedMeetingSession,
      event: input.event,
    }
  }

  async ingestProviderEnvelope(input: IngestProviderEnvelopeInput) {
    const normalizedEvents = await this.gateway.normalizeEvent(input.envelope)

    let meetingSession: MeetingSessionRecord | null = null

    if (normalizedEvents.length === 0) {
      meetingSession = await this.createOrUpdateMeetingSession({
        orgId: input.orgId,
        provider: input.provider,
        session: input.envelope.session ?? input.session,
        providerInstallationId: input.providerInstallationId,
        hostUserId: input.hostUserId,
        title: input.title,
        status: input.status,
        metadata: input.metadata ?? null,
      })
    }

    for (const event of normalizedEvents) {
      const result = await this.ingestNormalizedEvent({
        ...input,
        event,
      })
      meetingSession = result.meetingSession
    }

    return {
      meetingSession,
      normalizedEvents,
    }
  }
}
