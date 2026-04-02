import { and, eq, or } from 'drizzle-orm'
import { db, meetingSessions } from '@kodi/db'
import {
  appendNormalizedMeetingEvent,
  type MeetingIngestionSource,
  updateMeetingSessionRuntimeState,
} from './meeting-ingestion'
import { MeetingProviderGateway } from './meeting-provider-gateway'
import type {
  MeetingAdapterLifecycleState,
  MeetingProviderEvent,
  MeetingProviderEventEnvelope,
  MeetingProviderSessionRef,
  MeetingProviderSlug,
} from './meeting-events'

type MeetingSessionStatus = 'scheduled' | 'joining' | 'live' | 'completed' | 'failed'

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

function lifecycleStateToMeetingStatus(
  state: MeetingAdapterLifecycleState
): MeetingSessionStatus | undefined {
  if (state === 'failed') return 'failed'
  if (state === 'stopped') return 'completed'
  if (state === 'listening') return 'live'
  if (
    state === 'preparing' ||
    state === 'joining' ||
    state === 'waiting_for_admission'
  ) {
    return 'joining'
  }

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

  private async findMeetingSession(
    orgId: string,
    provider: MeetingProviderSlug,
    session?: MeetingProviderSessionRef | null
  ) {
    if (session?.internalMeetingSessionId) {
      const byId = await this.database.query.meetingSessions.findFirst({
        where: (fields, { and, eq }) =>
          and(
            eq(fields.id, session.internalMeetingSessionId),
            eq(fields.orgId, orgId)
          ),
      })

      if (byId) return byId
    }

    return this.database.query.meetingSessions.findFirst({
      where: (fields, { and, eq, or }) =>
        and(
          eq(fields.orgId, orgId),
          eq(fields.provider, provider as never),
          or(
            session?.externalMeetingInstanceId
              ? eq(
                  fields.providerMeetingInstanceId,
                  session.externalMeetingInstanceId
                )
              : undefined,
            session?.externalMeetingId
              ? eq(fields.providerMeetingId, session.externalMeetingId)
              : undefined,
            session?.externalBotSessionId
              ? eq(fields.providerBotSessionId, session.externalBotSessionId)
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
          status: input.status ?? existing.status,
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
        status: input.status ?? 'scheduled',
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
    status?: Extract<MeetingSessionStatus, 'completed' | 'failed'>
    endedAt?: Date
    metadata?: Record<string, unknown> | null
  }) {
    const meetingSession = await this.createOrUpdateMeetingSession({
      orgId: input.orgId,
      provider: input.provider,
      session: input.session,
      status: input.status ?? 'completed',
      metadata: input.metadata ?? null,
    })

    await updateMeetingSessionRuntimeState(meetingSession.id, {
      status: input.status ?? 'completed',
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

    await appendNormalizedMeetingEvent(
      meetingSession.id,
      input.event,
      input.source ?? 'worker'
    )

    const updated = await this.database.query.meetingSessions.findFirst({
      where: (fields, { eq }) => eq(fields.id, meetingSession.id),
    })

    return {
      meetingSession: updated ?? meetingSession,
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
