'use client'

import { useState } from 'react'
import { ChevronDown } from 'lucide-react'
import { cn } from '@kodi/ui/lib/utils'
import {
  type ApprovalItem,
  type HistoryStatusTone,
  describeHistoryStatus,
  formatDate,
  formatRelative,
  getHistoryTone,
  getPreviewFields,
  getPreviewSummary,
  getPreviewTitle,
  getToolkitMeta,
} from './utils'

const DOT_TONE: Record<HistoryStatusTone, string> = {
  success: 'bg-brand-success',
  danger: 'bg-brand-danger',
  info: 'bg-brand-info',
  neutral: 'bg-muted-foreground/40',
}

const STATUS_TONE: Record<HistoryStatusTone, string> = {
  success: 'text-brand-success',
  danger: 'text-brand-danger',
  info: 'text-brand-info',
  neutral: 'text-muted-foreground',
}

export function RecentDecisionCard({ item }: { item: ApprovalItem }) {
  const [expanded, setExpanded] = useState(false)
  const toolkit = getToolkitMeta(item.toolkitSlug)
  const Icon = toolkit.icon
  const tone = getHistoryTone(item)
  const statusLabel = describeHistoryStatus(item)
  const title = getPreviewTitle(item)
  const decidedBy =
    item.decidedByUser?.name ?? item.decidedByUser?.email ?? null
  const timestamp = item.decidedAt ?? item.createdAt
  const timeAgo = formatRelative(timestamp)
  const fields = getPreviewFields(item)
  const summary = getPreviewSummary(item)

  return (
    <div className="rounded-lg border border-border bg-card">
      <button
        type="button"
        onClick={() => setExpanded((value) => !value)}
        className="flex w-full items-center gap-3 px-4 py-3 text-left"
      >
        <span
          className={cn('h-2 w-2 shrink-0 rounded-full', DOT_TONE[tone])}
          aria-hidden
        />
        <Icon
          className={cn('h-4 w-4 shrink-0', toolkit.tint)}
          aria-hidden
        />

        <div className="min-w-0 flex-1">
          <p className="truncate text-sm text-foreground">{title}</p>
        </div>

        <span
          className={cn(
            'hidden shrink-0 text-xs font-medium sm:inline',
            STATUS_TONE[tone]
          )}
        >
          {statusLabel}
        </span>
        <span className="hidden shrink-0 text-xs text-muted-foreground sm:inline">
          {timeAgo ?? formatDate(timestamp)}
        </span>
        <ChevronDown
          className={cn(
            'h-4 w-4 shrink-0 text-muted-foreground transition-transform',
            expanded && 'rotate-180'
          )}
        />
      </button>

      {expanded && (
        <div className="border-t border-border bg-secondary/30 px-4 py-3">
          <p className="text-sm leading-6 text-foreground">{summary}</p>

          {fields.length > 0 && (
            <dl className="mt-3 grid gap-x-6 gap-y-2 sm:grid-cols-2">
              {fields.map((field) => (
                <div key={`${item.id}:${field.label}`} className="min-w-0">
                  <dt className="text-[11px] uppercase tracking-[0.14em] text-muted-foreground">
                    {field.label}
                  </dt>
                  <dd className="mt-0.5 break-words text-sm text-foreground">
                    {field.value}
                  </dd>
                </div>
              ))}
            </dl>
          )}

          {item.executionError && (
            <p className="mt-3 text-sm leading-6 text-brand-danger">
              {item.executionError}
            </p>
          )}

          <div className="mt-3 flex flex-wrap gap-x-6 gap-y-1 text-xs text-muted-foreground">
            <span className={cn('font-medium sm:hidden', STATUS_TONE[tone])}>
              {statusLabel}
            </span>
            {decidedBy && <span>Decided by {decidedBy}</span>}
            <span>
              {item.decidedAt ? 'Decided' : 'Created'}{' '}
              {formatDate(timestamp)}
            </span>
            {typeof item.attemptCount === 'number' &&
              item.attemptCount > 0 && (
                <span>
                  {item.attemptCount}{' '}
                  {item.attemptCount === 1 ? 'attempt' : 'attempts'}
                </span>
              )}
          </div>
        </div>
      )}
    </div>
  )
}
