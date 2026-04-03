import { db } from '@kodi/db'
import type { MeetingEvent, MeetingSession } from '@kodi/db'
import { openClawChatCompletion } from '../openclaw/client'
import type { MeetingProviderEvent } from './events'
import type { MeetingIngestionSource } from './ingestion'
import {
  buildOpenClawMeetingEnvelope,
  buildOpenClawMeetingMessages,
  parseOpenClawMeetingAck,
} from './openclaw-protocol'

type ForwardMeetingEventToOpenClawInput = {
  orgId: string
  meetingSession: MeetingSession
  persistedEvent: MeetingEvent
  event: MeetingProviderEvent
  source: MeetingIngestionSource
}

export async function forwardMeetingEventToOpenClaw(
  input: ForwardMeetingEventToOpenClawInput
) {
  if (input.event.kind === 'health') {
    return { ok: true as const, skipped: 'health-event' as const }
  }

  const participants = await db.query.meetingParticipants.findMany({
    where: (fields, { eq }) => eq(fields.meetingSessionId, input.meetingSession.id),
    orderBy: (fields, { asc }) => asc(fields.createdAt),
  })

  const envelope = buildOpenClawMeetingEnvelope({
    orgId: input.orgId,
    meetingSession: input.meetingSession,
    persistedEvent: input.persistedEvent,
    event: input.event,
    participants,
    source: input.source,
  })

  const response = await openClawChatCompletion({
    orgId: input.orgId,
    messages: buildOpenClawMeetingMessages(envelope),
    timeoutMs: 10_000,
  })

  if (!response.ok) {
    return response
  }

  return {
    ok: true as const,
    ack: parseOpenClawMeetingAck(response.content),
    raw: response.content,
  }
}
