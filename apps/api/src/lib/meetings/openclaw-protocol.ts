import { z } from 'zod'
import type {
  MeetingEvent,
  MeetingParticipant,
  MeetingSession,
} from '@kodi/db'
import type {
  MeetingChatEvent,
  MeetingLifecycleEvent,
  MeetingParticipantEvent,
  MeetingProviderEvent,
  MeetingTranscriptEvent,
} from './events'
import type { MeetingIngestionSource } from './ingestion'

export const OPENCLAW_MEETING_PROTOCOL_VERSION = 'kodi.meeting.v1'

type BuildOpenClawMeetingEnvelopeInput = {
  orgId: string
  meetingSession: MeetingSession
  persistedEvent: MeetingEvent
  event: MeetingProviderEvent
  participants: MeetingParticipant[]
  source: MeetingIngestionSource
}

const openClawMeetingAckSchema = z
  .object({
    protocolVersion: z.string().optional(),
    accepted: z.boolean().optional(),
    processedEventId: z.string().nullish(),
    receivedKind: z.string().nullish(),
    notes: z.string().nullish(),
  })
  .passthrough()

export type OpenClawMeetingAck = z.infer<typeof openClawMeetingAckSchema>

function buildMeetingContext(meetingSession: MeetingSession) {
  return {
    orgId: meetingSession.orgId,
    meetingSessionId: meetingSession.id,
    provider: meetingSession.provider,
    title: meetingSession.title,
    status: meetingSession.status,
    scheduledStartAt: meetingSession.scheduledStartAt?.toISOString() ?? null,
    actualStartAt: meetingSession.actualStartAt?.toISOString() ?? null,
    endedAt: meetingSession.endedAt?.toISOString() ?? null,
    external: {
      providerMeetingId: meetingSession.providerMeetingId,
      providerMeetingUuid: meetingSession.providerMeetingUuid,
      providerMeetingInstanceId: meetingSession.providerMeetingInstanceId,
      providerBotSessionId: meetingSession.providerBotSessionId,
    },
  }
}

function buildParticipantSnapshot(participants: MeetingParticipant[]) {
  return participants.map((participant) => ({
    participantId: participant.id,
    providerParticipantId: participant.providerParticipantId,
    displayName: participant.displayName,
    email: participant.email,
    isHost: participant.isHost,
    isInternal: participant.isInternal,
    resolvedIdentity:
      participant.metadata &&
      typeof participant.metadata === 'object' &&
      !Array.isArray(participant.metadata)
        ? (participant.metadata as Record<string, unknown>).resolvedIdentity ?? null
        : null,
    joinedAt: participant.joinedAt?.toISOString() ?? null,
    leftAt: participant.leftAt?.toISOString() ?? null,
  }))
}

function buildTranscriptPayload(event: MeetingTranscriptEvent) {
  return {
    kind: 'transcript' as const,
    transcript: {
      chunks: [
        {
          content: event.transcript.content,
          speaker: {
            providerParticipantId:
              event.transcript.speaker?.providerParticipantId ?? null,
            displayName: event.transcript.speaker?.displayName ?? null,
            email: event.transcript.speaker?.email ?? null,
          },
          startOffsetMs: event.transcript.startOffsetMs ?? null,
          endOffsetMs: event.transcript.endOffsetMs ?? null,
          confidence: event.transcript.confidence ?? null,
          isPartial: event.transcript.isPartial ?? false,
          occurredAt: event.occurredAt.toISOString(),
        },
      ],
    },
  }
}

function buildParticipantPayload(event: MeetingParticipantEvent) {
  return {
    kind: 'participant' as const,
    participant: {
      action: event.action,
      occurredAt: event.occurredAt.toISOString(),
      subject: {
        providerParticipantId: event.participant.providerParticipantId ?? null,
        externalUserId: event.participant.externalUserId ?? null,
        displayName: event.participant.displayName ?? null,
        email: event.participant.email ?? null,
      },
    },
  }
}

function buildLifecyclePayload(event: MeetingLifecycleEvent) {
  return {
    kind: 'lifecycle' as const,
    lifecycle: {
      action: event.action,
      state: event.state,
      occurredAt: event.occurredAt.toISOString(),
      errorCode: event.errorCode ?? null,
      errorMessage: event.errorMessage ?? null,
    },
  }
}

function buildChatPayload(event: MeetingChatEvent) {
  return {
    kind: 'chat' as const,
    chat: {
      action: event.action,
      occurredAt: event.occurredAt.toISOString(),
      message: {
        content: event.message.content,
        to: event.message.to ?? null,
        sender: {
          providerParticipantId:
            event.message.sender?.providerParticipantId ?? null,
          externalUserId: event.message.sender?.externalUserId ?? null,
          displayName: event.message.sender?.displayName ?? null,
          email: event.message.sender?.email ?? null,
        },
      },
    },
  }
}

function buildEventPayload(event: MeetingProviderEvent) {
  if (event.kind === 'transcript') return buildTranscriptPayload(event)
  if (event.kind === 'participant') return buildParticipantPayload(event)
  if (event.kind === 'chat') return buildChatPayload(event)
  if (event.kind === 'lifecycle') return buildLifecyclePayload(event)

  return {
    kind: 'health' as const,
    health: {
      observedAt: event.health.observedAt.toISOString(),
      status: event.health.status,
      lifecycleState: event.health.lifecycleState ?? null,
      detail: event.health.detail ?? null,
    },
  }
}

export function buildOpenClawMeetingEnvelope(
  input: BuildOpenClawMeetingEnvelopeInput
) {
  return {
    protocolVersion: OPENCLAW_MEETING_PROTOCOL_VERSION,
    source: 'kodi',
    sentAt: new Date().toISOString(),
    meeting: buildMeetingContext(input.meetingSession),
    delivery: {
      source: input.source,
      eventId: input.persistedEvent.id,
      sequence: input.persistedEvent.sequence,
      eventType: input.persistedEvent.eventType,
      occurredAt: input.persistedEvent.occurredAt.toISOString(),
    },
    participants: buildParticipantSnapshot(input.participants),
    event: buildEventPayload(input.event),
  }
}

export function buildOpenClawMeetingMessages(
  envelope: ReturnType<typeof buildOpenClawMeetingEnvelope>
) {
  return [
    {
      role: 'system' as const,
      content:
        'You are Kodi meeting ingress for an OpenClaw runtime. Consume the JSON envelope exactly as written. Treat delivery.sequence as the ordering key, transcript chunks as append-only inputs, participants as the latest snapshot, chat as append-only meeting activity, and lifecycle markers as state transitions. Reply with JSON only and no prose using this shape: {"protocolVersion":"kodi.meeting.v1","accepted":true,"processedEventId":"...","receivedKind":"transcript|participant|chat|lifecycle|health","notes":null}.',
    },
    {
      role: 'user' as const,
      content: JSON.stringify(envelope),
    },
  ]
}

export function parseOpenClawMeetingAck(
  content: string
): OpenClawMeetingAck | null {
  const normalized = content
    .trim()
    .replace(/^```json\s*/i, '')
    .replace(/^```\s*/i, '')
    .replace(/\s*```$/i, '')

  try {
    return openClawMeetingAckSchema.parse(JSON.parse(normalized))
  } catch {
    return null
  }
}
