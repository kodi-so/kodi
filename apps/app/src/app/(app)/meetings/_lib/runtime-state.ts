type RuntimeTone = 'info' | 'warning' | 'danger'

type RuntimeCopy = {
  snapshot: string
  description: string
  alertTone?: RuntimeTone | null
  alertTitle?: string | null
  alertDescription?: string | null
}

function asRecord(value: unknown) {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null
}

function providerFailureKind(metadata: Record<string, unknown> | null) {
  const failure = asRecord(metadata?.failure)
  return typeof failure?.kind === 'string' ? failure.kind : null
}

function lifecycleMessage(metadata: Record<string, unknown> | null) {
  return typeof metadata?.lifecycleMessage === 'string'
    ? metadata.lifecycleMessage
    : null
}

function providerJoinState(metadata: Record<string, unknown> | null) {
  return typeof metadata?.providerJoinState === 'string'
    ? metadata.providerJoinState
    : null
}

function baseRuntimeCopy(status: string): RuntimeCopy {
  switch (status) {
    case 'preparing':
      return {
        snapshot: 'Kodi is getting ready to join the meeting.',
        description: 'Kodi is getting ready to join the meeting.',
      }
    case 'joining':
      return {
        snapshot: 'Kodi is on the way into the call.',
        description: 'Kodi is on the way into the call.',
      }
    case 'admitted':
      return {
        snapshot: 'Kodi reached the meeting and is waiting to actively listen.',
        description: 'Kodi is in the meeting and waiting to actively listen.',
      }
    case 'listening':
      return {
        snapshot: 'Transcript and live context are flowing now.',
        description: 'Transcript and live meeting context are flowing now.',
      }
    case 'processing':
      return {
        snapshot: 'Kodi is turning the call into notes and follow-up.',
        description: 'Kodi is turning the meeting into notes and follow-up.',
      }
    case 'failed':
      return {
        snapshot: 'This session hit a provider problem and may need another try.',
        description:
          'This meeting hit a provider issue and may need another attempt.',
      }
    case 'ended':
      return {
        snapshot:
          'This meeting has ended. Summary and transcript stay available.',
        description: 'This meeting has ended.',
      }
    default:
      return {
        snapshot: 'Open the meeting to review transcript, summary, and follow-up.',
        description: 'Kodi will keep updating this meeting as new context arrives.',
      }
  }
}

export function getMeetingRuntimeCopy(input: {
  provider: string
  status: string
  metadata: unknown
}): RuntimeCopy {
  const metadata = asRecord(input.metadata)
  const joinState = providerJoinState(metadata)
  const failureKind = providerFailureKind(metadata)
  const message = lifecycleMessage(metadata)

  if (input.provider === 'zoom') {
    switch (joinState) {
      case 'waiting_room':
        return {
          snapshot: "Kodi is in Zoom's waiting room and needs the host to admit it.",
          description:
            "Kodi reached Zoom's waiting room and is waiting for the host to admit it.",
          alertTone: 'warning',
          alertTitle: 'Waiting for host admission',
          alertDescription:
            "Kodi joined the Zoom meeting link, but Zoom is still holding it in the waiting room.",
        }
      case 'awaiting_recording_permission':
        return {
          snapshot:
            'Kodi is in the Zoom call and waiting for host consent before it can listen.',
          description:
            'Kodi is in the Zoom call and waiting for the host to allow recording or transcription.',
          alertTone: 'warning',
          alertTitle: 'Waiting for recording consent',
          alertDescription:
            'Kodi cannot hear or track the meeting until the host allows recording/transcription access.',
        }
      case 'recording_permission_granted':
        return {
          snapshot:
            'Zoom approved recording. Kodi is finishing setup before live listening starts.',
          description:
            'Recording permission was granted. Kodi is finishing setup before listening starts.',
          alertTone: 'info',
          alertTitle: 'Finalizing Zoom join',
          alertDescription:
            'Zoom approved the bot, and Kodi should begin listening as soon as the media stream is ready.',
        }
      case 'recording_permission_denied':
        return {
          snapshot:
            'Zoom denied recording permission, so Kodi could not listen to this call.',
          description:
            message ??
            'The host denied Zoom recording permission, so Kodi could not listen to this call.',
          alertTone: 'danger',
          alertTitle: 'Recording permission denied',
          alertDescription:
            message ??
            'The host denied Zoom recording/transcription permission for this meeting.',
        }
      default:
        break
    }

    if (failureKind === 'auth_failure') {
      return {
        snapshot:
          'This Zoom meeting requires a signed-in bot identity before Kodi can join.',
        description:
          'This Zoom meeting requires a signed-in bot identity before Kodi can join.',
        alertTone: 'danger',
        alertTitle: 'Zoom sign-in required',
        alertDescription:
          'The meeting only admits authenticated participants, so Kodi needs a signed-in Zoom bot account.',
      }
    }
  }

  return baseRuntimeCopy(input.status)
}

export function describeMeetingLifecycleEvent(input: {
  provider: string
  eventType: string
  payload: unknown
}) {
  const payload = asRecord(input.payload)
  const metadata = asRecord(payload?.metadata)
  const joinState = providerJoinState(metadata)
  const failureKind = providerFailureKind(metadata)
  const message =
    typeof payload?.errorMessage === 'string'
      ? payload.errorMessage
      : lifecycleMessage(metadata)

  if (input.provider === 'zoom') {
    if (input.eventType === 'meeting.admitted' && joinState === 'waiting_room') {
      return "Kodi reached Zoom's waiting room and is waiting for the host to admit it."
    }

    if (
      input.eventType === 'meeting.admitted' &&
      joinState === 'awaiting_recording_permission'
    ) {
      return 'Kodi is in the Zoom call and waiting for the host to allow recording or transcription.'
    }

    if (
      input.eventType === 'meeting.started' &&
      (joinState === 'recording_permission_granted' || joinState === 'listening')
    ) {
      return 'Zoom approved recording and Kodi is now listening to the meeting.'
    }

    if (
      input.eventType === 'meeting.failed' &&
      joinState === 'recording_permission_denied'
    ) {
      return (
        message ??
        'The host denied Zoom recording permission, so Kodi could not listen to the meeting.'
      )
    }

    if (input.eventType === 'meeting.failed' && failureKind === 'auth_failure') {
      return 'This Zoom meeting requires a signed-in bot identity before Kodi can join.'
    }
  }

  if (typeof message === 'string' && message) {
    return message
  }

  const state = typeof payload?.state === 'string' ? payload.state : null
  return state
}
