import { describeMeetingLifecycleEvent } from '../../_lib/runtime-state'
import type {
  MeetingEventFeed,
  MeetingParticipantIdentitySummary,
  MeetingParticipants,
} from './types'

export function failureReasonToMessage(reason: string | null): string {
  if (reason === 'openclaw-unavailable')
    return "Kodi's AI instance isn't reachable. Make sure your OpenClaw instance is running."
  if (reason === 'openclaw-failed')
    return "Kodi's AI instance returned an error. Try again in a moment."
  if (reason === 'empty-response')
    return 'Kodi returned an empty response. Try again.'
  return 'Something went wrong. Please try again.'
}

export function asRecord(value: unknown) {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null
}

export function asArray(value: unknown) {
  return Array.isArray(value) ? value : []
}

export function formatDate(value: Date | string | null | undefined) {
  if (!value) return 'Not available'
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return 'Not available'
  return parsed.toLocaleString([], {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
}

export function formatTime(value: Date | string | null | undefined) {
  if (!value) return 'Not available'
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return 'Not available'
  return parsed.toLocaleTimeString([], {
    hour: 'numeric',
    minute: '2-digit',
    second: '2-digit',
  })
}

export function truncateMiddle(value: string | null | undefined, max = 28) {
  if (!value) return 'Not available'
  if (value.length <= max) return value
  const edge = Math.max(6, Math.floor((max - 3) / 2))
  return `${value.slice(0, edge)}...${value.slice(-edge)}`
}

export function pollIntervalForStatus(status: string | null | undefined) {
  switch (status) {
    case 'preparing':
    case 'joining':
    case 'admitted':
    case 'listening':
      return 3000
    case 'processing':
    case 'scheduled':
    case 'summarizing':
      return 5000
    case 'ended':
    case 'completed':
    case 'failed':
      return 15000
    default:
      return 10000
  }
}

export function statusTone(status: string) {
  switch (status) {
    case 'listening':
      return 'success' as const
    case 'admitted':
      return 'info' as const
    case 'processing':
    case 'summarizing':
    case 'joining':
    case 'scheduled':
    case 'preparing':
      return 'warning' as const
    case 'completed':
    case 'ended':
      return 'neutral' as const
    case 'failed':
      return 'destructive' as const
    default:
      return 'neutral' as const
  }
}

export function statusLabel(status: string) {
  switch (status) {
    case 'listening':
      return 'Live'
    case 'admitted':
      return 'Admitted'
    case 'processing':
      return 'Summarizing'
    case 'summarizing':
      return 'Generating recap'
    case 'completed':
      return 'Recap ready'
    case 'preparing':
      return 'Preparing'
    case 'joining':
      return 'Joining'
    case 'ended':
      return 'Ended'
    case 'failed':
      return 'Needs attention'
    default:
      return status
  }
}

export function formatProviderLabel(provider: string) {
  switch (provider) {
    case 'google_meet':
      return 'Google Meet'
    case 'zoom':
      return 'Zoom'
    default:
      return provider.replace(/_/g, ' ')
  }
}

export function formatSourceLabel(source: string) {
  switch (source) {
    case 'recall_webhook':
      return 'Recall webhook'
    case 'zoom_webhook':
      return 'Zoom webhook'
    case 'rtms':
      return 'RTMS'
    default:
      return source.replace(/_/g, ' ')
  }
}

export function formatEventLabel(eventType: string) {
  switch (eventType) {
    case 'meeting.joining':
      return 'Joining'
    case 'meeting.admitted':
      return 'Admitted'
    case 'meeting.started':
      return 'Started'
    case 'meeting.chat_message.received':
      return 'Chat received'
    case 'meeting.chat_message.sent':
      return 'Chat sent'
    case 'meeting.ended':
      return 'Ended'
    case 'meeting.failed':
      return 'Failed'
    case 'participant.joined':
      return 'Participant joined'
    case 'meeting.transcript.segment_received':
      return 'Transcript'
    default:
      return eventType.replace(/^meeting\./, '').replace(/\./g, ' ')
  }
}

export function healthTone(status: string | null | undefined) {
  switch (status) {
    case 'healthy':
      return 'success' as const
    case 'degraded':
      return 'warning' as const
    case 'down':
      return 'destructive' as const
    default:
      return 'neutral' as const
  }
}

export function formatHealthStatus(status: string | null | undefined) {
  switch (status) {
    case 'healthy':
      return 'Provider healthy'
    case 'degraded':
      return 'Needs attention'
    case 'down':
      return 'Provider down'
    default:
      return 'Health unknown'
  }
}

export function participantIdentitySummary(
  participant: MeetingParticipants[number]
): MeetingParticipantIdentitySummary | null {
  const metadata = asRecord(participant.metadata)
  const resolved = asRecord(metadata?.resolvedIdentity)
  if (!resolved) return null

  const classification =
    resolved.classification === 'internal' ||
    resolved.classification === 'external' ||
    resolved.classification === 'unknown'
      ? resolved.classification
      : 'unknown'

  return {
    classification,
    confidence:
      typeof resolved.confidence === 'number' ? resolved.confidence : null,
    rejoinCount:
      typeof resolved.rejoinCount === 'number' ? resolved.rejoinCount : 0,
    matchedBy:
      typeof resolved.matchedBy === 'string' ? resolved.matchedBy : null,
    matchedUserEmail:
      typeof resolved.matchedUserEmail === 'string'
        ? resolved.matchedUserEmail
        : null,
  }
}

export function participantIdentityBadgeVariant(
  classification: 'internal' | 'external' | 'unknown'
) {
  switch (classification) {
    case 'internal':
      return 'success' as const
    case 'external':
      return 'neutral' as const
    default:
      return 'warning' as const
  }
}

export function participantIdentityLabel(
  classification: 'internal' | 'external' | 'unknown'
) {
  switch (classification) {
    case 'internal':
      return 'Internal'
    case 'external':
      return 'External'
    default:
      return 'Needs review'
  }
}

export function describeEvent(
  event: MeetingEventFeed[number],
  provider: string
) {
  const payload = asRecord(event.payload)
  if (!payload) return null

  if (event.eventType === 'meeting.transcript.segment_received') {
    const transcript = asRecord(payload.transcript)
    const speaker = asRecord(transcript?.speaker)
    const speakerName =
      typeof speaker?.displayName === 'string'
        ? speaker.displayName
        : typeof transcript?.speakerName === 'string'
          ? transcript.speakerName
          : 'Unknown speaker'
    const content =
      typeof transcript?.content === 'string' ? transcript.content : null

    return content ? `${speakerName}: ${content}` : speakerName
  }

  if (event.eventType === 'participant.joined') {
    const participant = asRecord(payload.participant)
    return (
      (typeof participant?.displayName === 'string' &&
        participant.displayName) ||
      (typeof participant?.email === 'string' && participant.email) ||
      'Participant joined'
    )
  }

  return describeMeetingLifecycleEvent({
    provider,
    eventType: event.eventType,
    payload,
  })
}
