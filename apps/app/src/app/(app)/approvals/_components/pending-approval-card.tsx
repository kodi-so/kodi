'use client'

import { useState } from 'react'
import { ChevronDown } from 'lucide-react'
import { Button } from '@kodi/ui/components/button'
import { cn } from '@kodi/ui/lib/utils'
import {
  type ApprovalItem,
  formatDate,
  formatRelative,
  getPreviewFields,
  getPreviewSummary,
  getPreviewTitle,
  getToolkitMeta,
} from './utils'

export function PendingApprovalCard({
  item,
  isHighlighted,
  actionKey,
  onDecide,
}: {
  item: ApprovalItem
  isHighlighted: boolean
  actionKey: string | null
  onDecide: (approvalRequestId: string, decision: 'approved' | 'rejected') => void
}) {
  const [expanded, setExpanded] = useState(isHighlighted)
  const toolkit = getToolkitMeta(item.toolkitSlug)
  const Icon = toolkit.icon
  const title = getPreviewTitle(item)
  const summary = getPreviewSummary(item)
  const requestedBy =
    item.requestedByUser?.name ?? item.requestedByUser?.email ?? null
  const timeAgo = formatRelative(item.createdAt)
  const fields = getPreviewFields(item)
  const isBusy = actionKey !== null
  const isRejecting = actionKey === `rejected:${item.id}`
  const isApproving = actionKey === `approved:${item.id}`

  return (
    <div
      className={cn(
        'group rounded-xl border bg-card transition-colors',
        isHighlighted ? 'border-primary/45' : 'border-border',
        'hover:border-border/80'
      )}
    >
      <div className="flex items-start gap-3 p-4">
        <button
          type="button"
          aria-label={expanded ? 'Collapse details' : 'Expand details'}
          onClick={() => setExpanded((value) => !value)}
          className="flex flex-1 items-start gap-3 text-left"
        >
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-secondary">
            <Icon className={cn('h-4 w-4', toolkit.tint)} />
          </div>

          <div className="min-w-0 flex-1 space-y-1">
            <div className="flex items-center gap-2">
              <p className="truncate text-sm font-medium text-foreground">
                {title}
              </p>
              <ChevronDown
                className={cn(
                  'h-4 w-4 shrink-0 text-muted-foreground transition-transform',
                  expanded && 'rotate-180'
                )}
              />
            </div>
            <p className="truncate text-xs text-muted-foreground">
              {[toolkit.label, requestedBy, timeAgo]
                .filter(Boolean)
                .join(' · ')}
            </p>
          </div>
        </button>

        <div className="flex shrink-0 gap-2">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="text-muted-foreground hover:bg-brand-danger-soft hover:text-brand-danger"
            disabled={isBusy}
            onClick={() => void onDecide(item.id, 'rejected')}
          >
            {isRejecting ? 'Rejecting…' : 'Reject'}
          </Button>
          <Button
            type="button"
            size="sm"
            className="bg-primary text-primary-foreground hover:bg-primary/90"
            disabled={isBusy}
            onClick={() => void onDecide(item.id, 'approved')}
          >
            {isApproving ? 'Approving…' : 'Approve'}
          </Button>
        </div>
      </div>

      {expanded && (
        <div className="border-t border-border bg-secondary/40 px-4 py-4">
          <p className="text-sm leading-6 text-foreground">{summary}</p>

          {fields.length > 0 && (
            <dl className="mt-4 grid gap-x-6 gap-y-3 sm:grid-cols-2">
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

          <div className="mt-4 flex flex-wrap gap-x-6 gap-y-1 text-xs text-muted-foreground">
            {requestedBy && <span>Requested by {requestedBy}</span>}
            <span>Created {formatDate(item.createdAt)}</span>
            {item.expiresAt && <span>Expires {formatDate(item.expiresAt)}</span>}
          </div>
        </div>
      )}
    </div>
  )
}
