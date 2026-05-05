import type { trpc } from '@/lib/trpc'
import { getMeetingRuntimeCopy } from '../_lib/runtime-state'

export type MeetingListResponse = Awaited<
  ReturnType<typeof trpc.meeting.list.query>
>
export type MeetingListItem = MeetingListResponse['items']
export type MeetingCopilotConfig = Awaited<
  ReturnType<typeof trpc.meeting.getCopilotSettings.query>
>

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

export function statusAccentColor(status: string) {
  switch (status) {
    case 'listening':
      return 'bg-brand-success'
    case 'admitted':
      return 'bg-brand-info'
    case 'processing':
    case 'summarizing':
    case 'joining':
    case 'scheduled':
    case 'preparing':
      return 'bg-brand-warning'
    case 'completed':
      return 'bg-brand-accent'
    case 'ended':
      return 'bg-brand-line'
    case 'failed':
      return 'bg-brand-danger'
    default:
      return 'bg-brand-line'
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

export function meetingSnapshot(meeting: MeetingListItem[number]) {
  if (meeting.liveSummary) return meeting.liveSummary
  return getMeetingRuntimeCopy({
    provider: meeting.provider,
    status: meeting.status,
    metadata: meeting.metadata,
  }).snapshot
}

export function formatProviderLabel(provider: string) {
  switch (provider) {
    case 'google_meet':
      return 'Google Meet'
    case 'zoom':
      return 'Zoom'
    case 'local':
      return 'Local'
    default:
      return 'Meeting'
  }
}
