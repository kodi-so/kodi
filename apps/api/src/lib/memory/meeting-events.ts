import type { MeetingProviderEvent } from '../meetings/events'
import { scheduleMemoryUpdateEvent, type MemoryUpdateEvent } from './events'

type MeetingSessionLike = {
  id: string
  orgId: string
  provider: string
  hostUserId: string | null
  title: string | null
  status: string
}

type PersistedMeetingEventLike = {
  id: string
  sequence: number
}

type MeetingMemoryTrigger = 'completed' | 'state_changed' | 'transcript_updated'

type MeetingMemoryScheduler = (
  event: Extract<MemoryUpdateEvent, { source: 'meeting' }>
) => Promise<unknown>

export function buildMeetingMemoryUpdateEvent(input: {
  orgId: string
  meetingSession: MeetingSessionLike
  persistedEvent: PersistedMeetingEventLike
  event: MeetingProviderEvent
}) {
  const trigger = resolveMeetingMemoryTrigger(input.event)
  if (!trigger) return null

  return {
    id: crypto.randomUUID(),
    orgId: input.orgId,
    source: 'meeting',
    occurredAt: input.event.occurredAt,
    visibility: 'shared',
    summary: buildMeetingMemorySummary(input.event, trigger, input.meetingSession),
    actor: input.meetingSession.hostUserId
      ? {
          userId: input.meetingSession.hostUserId,
        }
      : undefined,
    metadata: {
      provider: input.meetingSession.provider,
      meetingSessionId: input.meetingSession.id,
      meetingTitle: input.meetingSession.title,
      meetingStatus: input.meetingSession.status,
      eventKind: input.event.kind,
      eventAction: input.event.kind === 'lifecycle' ? input.event.action : null,
      persistedEventId: input.persistedEvent.id,
      persistedEventSequence: input.persistedEvent.sequence,
    },
    payload: {
      meetingSessionId: input.meetingSession.id,
      eventId: input.persistedEvent.id,
      lastEventSequence: input.persistedEvent.sequence,
      trigger,
    },
  } satisfies Extract<MemoryUpdateEvent, { source: 'meeting' }>
}

export async function emitMeetingMemoryUpdateEvent(
  input: {
    orgId: string
    meetingSession: MeetingSessionLike
    persistedEvent: PersistedMeetingEventLike
    event: MeetingProviderEvent
  },
  schedule: MeetingMemoryScheduler = scheduleMemoryUpdateEvent
) {
  const event = buildMeetingMemoryUpdateEvent(input)
  if (!event) return null

  await schedule(event)
  return event
}

function resolveMeetingMemoryTrigger(event: MeetingProviderEvent) {
  if (event.kind === 'transcript') {
    if (event.transcript.isPartial) return null
    if (!event.transcript.content.trim()) return null
    return 'transcript_updated' satisfies MeetingMemoryTrigger
  }

  if (event.kind !== 'lifecycle') {
    return null
  }

  switch (event.action) {
    case 'meeting.ended':
    case 'meeting.stopped':
      return 'completed'
    case 'meeting.admitted':
    case 'meeting.started':
    case 'meeting.paused':
    case 'meeting.resumed':
    case 'meeting.failed':
      return 'state_changed'
    default:
      return null
  }
}

function buildMeetingMemorySummary(
  event: MeetingProviderEvent,
  trigger: MeetingMemoryTrigger,
  meetingSession: MeetingSessionLike
) {
  if (trigger === 'transcript_updated') {
    return meetingSession.title
      ? `Meeting "${meetingSession.title}" has new transcript evidence.`
      : 'Meeting has new transcript evidence.'
  }

  if (event.kind === 'lifecycle') {
    switch (event.action) {
      case 'meeting.ended':
      case 'meeting.stopped':
        return meetingSession.title
          ? `Meeting "${meetingSession.title}" completed.`
          : 'Meeting completed.'
      case 'meeting.started':
        return meetingSession.title
          ? `Meeting "${meetingSession.title}" started.`
          : 'Meeting started.'
      case 'meeting.admitted':
        return meetingSession.title
          ? `Meeting "${meetingSession.title}" admitted the bot.`
          : 'Meeting admitted the bot.'
      case 'meeting.paused':
        return meetingSession.title
          ? `Meeting "${meetingSession.title}" paused.`
          : 'Meeting paused.'
      case 'meeting.resumed':
        return meetingSession.title
          ? `Meeting "${meetingSession.title}" resumed.`
          : 'Meeting resumed.'
      case 'meeting.failed':
        return meetingSession.title
          ? `Meeting "${meetingSession.title}" failed.`
          : 'Meeting failed.'
    }
  }

  return 'Meeting state changed.'
}
