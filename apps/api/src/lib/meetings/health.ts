import {
  eq,
  meetingSessionHealth,
  type MeetingSession,
  type MeetingSessionHealth,
} from '@kodi/db'
import type { MeetingProviderHealthSnapshot } from './events'
import type { MeetingProviderGateway } from './provider-gateway'
import { appendMeetingEvent } from './ingestion'

const DEFAULT_HEALTH_CACHE_MS = 15_000

function toSnapshot(
  record: MeetingSessionHealth | null | undefined
): MeetingProviderHealthSnapshot | null {
  if (!record) return null

  return {
    status: record.status,
    observedAt: record.observedAt,
    lifecycleState:
      record.lifecycleState === 'idle' ||
      record.lifecycleState === 'preparing' ||
      record.lifecycleState === 'joining' ||
      record.lifecycleState === 'waiting_for_admission' ||
      record.lifecycleState === 'listening' ||
      record.lifecycleState === 'stopping' ||
      record.lifecycleState === 'stopped' ||
      record.lifecycleState === 'failed'
        ? record.lifecycleState
        : null,
    detail: record.detail,
    metadata: record.metadata ?? null,
  }
}

function snapshotChanged(
  previous: MeetingProviderHealthSnapshot | null,
  next: MeetingProviderHealthSnapshot
) {
  if (!previous) return true

  return (
    previous.status !== next.status ||
    previous.lifecycleState !== next.lifecycleState ||
    previous.detail !== next.detail ||
    JSON.stringify(previous.metadata ?? null) !==
      JSON.stringify(next.metadata ?? null)
  )
}

function buildHealthLookupErrorSnapshot(error: unknown) {
  return {
    status: 'degraded',
    observedAt: new Date(),
    lifecycleState: null,
    detail: 'Kodi could not refresh the current Recall bot health.',
    metadata: {
      transport: 'recall',
      healthProbeError:
        error instanceof Error ? error.message : 'Unknown health probe error',
    },
  } satisfies MeetingProviderHealthSnapshot
}

export async function resolveMeetingHealthSnapshot(
  database: typeof import('@kodi/db').db,
  gateway: MeetingProviderGateway,
  input: {
    orgId: string
    meetingSession: MeetingSession
    maxAgeMs?: number
    forceRefresh?: boolean
  }
) {
  const cachedRecord = await database.query.meetingSessionHealth.findFirst({
    where: (fields, { eq }) => eq(fields.meetingSessionId, input.meetingSession.id),
  })
  const cachedSnapshot = toSnapshot(cachedRecord)

  const isTerminalMeetingStatus = ['ended', 'failed', 'completed'].includes(
    input.meetingSession.status
  )
  const cacheMaxAgeMs = input.maxAgeMs ?? DEFAULT_HEALTH_CACHE_MS

  if (
    !input.forceRefresh &&
    cachedSnapshot &&
    (isTerminalMeetingStatus ||
      Date.now() - cachedSnapshot.observedAt.getTime() <= cacheMaxAgeMs)
  ) {
    return cachedSnapshot
  }

  if (!input.meetingSession.providerBotSessionId) {
    return cachedSnapshot
  }

  let nextSnapshot: MeetingProviderHealthSnapshot
  try {
    nextSnapshot = await gateway.getHealth({
      orgId: input.orgId,
      provider: input.meetingSession.provider,
      session: {
        internalMeetingSessionId: input.meetingSession.id,
        externalMeetingId: input.meetingSession.providerMeetingId,
        externalMeetingInstanceId:
          input.meetingSession.providerMeetingInstanceId ??
          input.meetingSession.providerMeetingUuid,
        externalBotSessionId: input.meetingSession.providerBotSessionId,
      },
    })
  } catch (error) {
    return cachedSnapshot ?? buildHealthLookupErrorSnapshot(error)
  }

  const values = {
    provider: input.meetingSession.provider as MeetingSessionHealth['provider'],
    status: nextSnapshot.status,
    lifecycleState: nextSnapshot.lifecycleState ?? null,
    detail: nextSnapshot.detail ?? null,
    metadata: nextSnapshot.metadata ?? null,
    observedAt: nextSnapshot.observedAt,
    updatedAt: new Date(),
  }

  if (cachedRecord) {
    await database
      .update(meetingSessionHealth)
      .set(values)
      .where(eq(meetingSessionHealth.id, cachedRecord.id))
  } else {
    await database.insert(meetingSessionHealth).values({
      meetingSessionId: input.meetingSession.id,
      ...values,
    })
  }

  if (snapshotChanged(cachedSnapshot, nextSnapshot)) {
    await appendMeetingEvent(
      input.meetingSession.id,
      'meeting.health.updated',
      'worker',
      {
        observedAt: nextSnapshot.observedAt.toISOString(),
        health: nextSnapshot,
        previous: cachedSnapshot,
      }
    )
  }

  return nextSnapshot
}
