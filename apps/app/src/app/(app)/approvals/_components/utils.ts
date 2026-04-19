import { getToolkitMeta, titleCase } from '@/lib/toolkit-meta'
import { trpc } from '@/lib/trpc'

export { getToolkitMeta } from '@/lib/toolkit-meta'
export type { ToolkitMeta } from '@/lib/toolkit-meta'

export type ApprovalItem = Awaited<
  ReturnType<typeof trpc.approval.list.query>
>['items'][number]

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

export function formatRelative(value: Date | string | null | undefined) {
  if (!value) return null
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return null
  const diffMs = Date.now() - parsed.getTime()
  const abs = Math.abs(diffMs)
  const future = diffMs < 0
  const minute = 60_000
  const hour = 60 * minute
  const day = 24 * hour

  let text: string
  if (abs < minute) text = 'just now'
  else if (abs < hour) text = `${Math.round(abs / minute)}m`
  else if (abs < day) text = `${Math.round(abs / hour)}h`
  else if (abs < 30 * day) text = `${Math.round(abs / day)}d`
  else return formatDate(parsed)

  if (text === 'just now') return text
  return future ? `in ${text}` : `${text} ago`
}

const VERB_MAP: Record<string, string> = {
  send: 'Send',
  post: 'Post',
  create: 'Create',
  update: 'Update',
  delete: 'Delete',
  remove: 'Remove',
  add: 'Add',
  invite: 'Invite',
  schedule: 'Schedule',
  cancel: 'Cancel',
  archive: 'Archive',
  move: 'Move',
  assign: 'Assign',
  comment: 'Comment on',
  reply: 'Reply to',
  share: 'Share',
  upload: 'Upload',
  merge: 'Merge',
  close: 'Close',
  open: 'Open',
  approve: 'Approve',
  reject: 'Reject',
}

export function humanizeAction(
  action: string | null | undefined,
  toolkitSlug: string | null | undefined
): string {
  if (!action) return 'External action'
  const toolkit = getToolkitMeta(toolkitSlug)

  // Strip a leading toolkit prefix if the action is "slack_send_message".
  const normalizedSlug = toolkitSlug?.toLowerCase().replace(/[-\s]/g, '_')
  let remainder = action.toLowerCase()
  if (normalizedSlug && remainder.startsWith(`${normalizedSlug}_`)) {
    remainder = remainder.slice(normalizedSlug.length + 1)
  }

  const parts = remainder.split(/[_\s-]+/).filter(Boolean)
  if (parts.length === 0) return titleCase(action)

  const [first, ...rest] = parts
  const verb = first ? VERB_MAP[first] : undefined
  if (verb) {
    const object = rest.join(' ').trim()
    if (!object) return `${verb} in ${toolkit.label}`
    return `${verb} ${toolkit.label} ${object}`.trim()
  }

  return titleCase(remainder.replace(/_/g, ' '))
}

export function asRecord(value: unknown) {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null
}

export function getPreviewTitle(item: ApprovalItem) {
  const preview = asRecord(item.previewPayload)
  if (preview && typeof preview.title === 'string' && preview.title.trim()) {
    return preview.title
  }
  return humanizeAction(item.action, item.toolkitSlug)
}

export function getPreviewSummary(item: ApprovalItem) {
  const preview = asRecord(item.previewPayload)
  const summary =
    preview && typeof preview.summary === 'string' ? preview.summary : null
  return summary ?? 'Review this external action before Kodi executes it.'
}

export function getPreviewFields(item: ApprovalItem) {
  const preview = asRecord(item.previewPayload)
  const fieldPreview = preview?.fieldPreview

  if (!Array.isArray(fieldPreview)) {
    return []
  }

  return fieldPreview
    .map((entry) => {
      const record = asRecord(entry)
      if (!record) return null
      const rawLabel =
        typeof record.label === 'string' ? record.label : 'Field'
      const label = titleCase(rawLabel)
      const value =
        typeof record.value === 'string'
          ? record.value
          : JSON.stringify(record.value)
      return { label, value }
    })
    .filter(
      (entry): entry is { label: string; value: string } => entry !== null
    )
}

export type HistoryStatusTone = 'success' | 'danger' | 'info' | 'neutral'

export function getHistoryTone(item: ApprovalItem): HistoryStatusTone {
  if (item.status === 'rejected') return 'danger'
  if (item.status === 'expired') return 'neutral'
  if (item.status === 'approved') {
    switch (item.executionStatus) {
      case 'failed':
        return 'danger'
      case 'running':
      case 'pending':
        return 'info'
      case 'cancelled':
        return 'neutral'
      case 'succeeded':
      default:
        return 'success'
    }
  }
  return 'neutral'
}

export function describeHistoryStatus(item: ApprovalItem): string {
  if (item.status === 'rejected') return 'Rejected'
  if (item.status === 'expired') return 'Expired'
  if (item.status === 'approved') {
    switch (item.executionStatus) {
      case 'failed':
        return 'Failed'
      case 'running':
        return 'Running'
      case 'pending':
        return 'Queued'
      case 'cancelled':
        return 'Cancelled'
      case 'succeeded':
        return 'Ran'
      default:
        return 'Approved'
    }
  }
  return titleCase(item.status)
}
