import { trpc } from '@/lib/trpc'

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

export function getStatusTone(status: ApprovalItem['status']) {
  switch (status) {
    case 'pending':
      return 'warning' as const
    case 'approved':
      return 'success' as const
    case 'rejected':
      return 'destructive' as const
    case 'expired':
      return 'neutral' as const
    default:
      return 'neutral' as const
  }
}

export function getExecutionTone(status: ApprovalItem['executionStatus']) {
  switch (status) {
    case 'succeeded':
      return 'success' as const
    case 'failed':
      return 'destructive' as const
    case 'running':
      return 'info' as const
    case 'cancelled':
      return 'neutral' as const
    case 'pending':
      return 'warning' as const
    default:
      return 'outline' as const
  }
}

export function asRecord(value: unknown) {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null
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
      const label = typeof record.label === 'string' ? record.label : 'Field'
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
