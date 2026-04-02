import type { MeetingLifecycleEvent } from './events'

export const canonicalMeetingStatuses = [
  'scheduled',
  'preparing',
  'joining',
  'admitted',
  'listening',
  'processing',
  'ended',
  'failed',
] as const

export type CanonicalMeetingStatus = (typeof canonicalMeetingStatuses)[number]

export type MeetingSessionStatus =
  | CanonicalMeetingStatus
  | 'live'
  | 'summarizing'
  | 'awaiting_approval'
  | 'executing'
  | 'completed'

export function normalizeMeetingStatus(
  status: MeetingSessionStatus
): CanonicalMeetingStatus {
  switch (status) {
    case 'live':
      return 'listening'
    case 'summarizing':
    case 'awaiting_approval':
    case 'executing':
      return 'processing'
    case 'completed':
      return 'ended'
    default:
      return status
  }
}

const statusRank: Record<CanonicalMeetingStatus, number> = {
  scheduled: 0,
  preparing: 1,
  joining: 2,
  admitted: 3,
  listening: 4,
  processing: 5,
  ended: 6,
  failed: 6,
}

export function transitionMeetingStatus(
  current: MeetingSessionStatus,
  next: MeetingSessionStatus
): CanonicalMeetingStatus {
  const currentNormalized = normalizeMeetingStatus(current)
  const nextNormalized = normalizeMeetingStatus(next)

  if (currentNormalized === 'failed' || currentNormalized === 'ended') {
    return currentNormalized
  }

  if (nextNormalized === 'failed' || nextNormalized === 'ended') {
    return nextNormalized
  }

  return statusRank[nextNormalized] >= statusRank[currentNormalized]
    ? nextNormalized
    : currentNormalized
}

export function meetingStatusFromLifecycleEvent(
  event: MeetingLifecycleEvent
): CanonicalMeetingStatus | undefined {
  if (event.action === 'meeting.failed' || event.state === 'failed') {
    return 'failed'
  }

  if (
    event.action === 'meeting.ended' ||
    event.action === 'meeting.stopped' ||
    event.state === 'stopped'
  ) {
    return 'ended'
  }

  if (event.action === 'meeting.started' || event.state === 'listening') {
    return 'listening'
  }

  if (event.action === 'meeting.admitted' || event.action === 'meeting.joined') {
    return 'admitted'
  }

  if (
    event.action === 'meeting.joining' ||
    event.state === 'joining' ||
    event.state === 'waiting_for_admission'
  ) {
    return 'joining'
  }

  if (event.action === 'meeting.prepared' || event.state === 'preparing') {
    return 'preparing'
  }

  return undefined
}
