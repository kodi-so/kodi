'use client'

import { Badge, Button, cn } from '@kodi/ui'
import {
  type ApprovalItem,
  asRecord,
  formatDate,
  getPreviewFields,
  getPreviewSummary,
  getStatusTone,
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
  const preview = asRecord(item.previewPayload)
  const targetText =
    preview && typeof preview.targetText === 'string'
      ? preview.targetText
      : null
  const fields = getPreviewFields(item)

  return (
    <section
      className={cn(
        'kodi-panel-surface rounded-[1.6rem] border p-6 shadow-brand-panel',
        isHighlighted ? 'border-primary/45' : 'border-brand-line'
      )}
    >
      <div className="flex flex-col gap-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant={getStatusTone(item.status)}>
                {item.status}
              </Badge>
              {item.toolkitSlug && (
                <Badge variant="outline">
                  {item.toolkitSlug}
                </Badge>
              )}
              {item.actionCategory && (
                <Badge variant="outline">
                  {item.actionCategory}
                </Badge>
              )}
            </div>
            <h3 className="text-xl font-semibold text-foreground">
              {preview && typeof preview.title === 'string'
                ? preview.title
                : (item.action ?? 'External action approval')}
            </h3>
            <p className="max-w-3xl text-sm leading-7 text-muted-foreground">
              {getPreviewSummary(item)}
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="outline"
              className="border-brand-danger text-brand-danger hover:bg-brand-danger-soft"
              disabled={actionKey !== null}
              onClick={() =>
                void onDecide(item.id, 'rejected')
              }
            >
              {actionKey === `rejected:${item.id}`
                ? 'Rejecting...'
                : 'Reject'}
            </Button>
            <Button
              type="button"
              className="bg-primary text-primary-foreground hover:bg-primary/90"
              disabled={actionKey !== null}
              onClick={() =>
                void onDecide(item.id, 'approved')
              }
            >
              {actionKey === `approved:${item.id}`
                ? 'Approving...'
                : 'Approve and run'}
            </Button>
          </div>
        </div>

        <div className="grid gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(18rem,1fr)]">
          <div className="rounded-[1.2rem] border border-brand-line bg-secondary p-4">
            <p className="text-sm font-medium text-foreground">
              Requested action
            </p>
            <div className="mt-3 space-y-2 text-sm text-foreground">
              <p>
                <span className="text-brand-subtle">Action:</span>{' '}
                {item.action ?? 'Unknown'}
              </p>
              {targetText && (
                <p>
                  <span className="text-brand-subtle">
                    Target:
                  </span>{' '}
                  {targetText}
                </p>
              )}
              <p>
                <span className="text-brand-subtle">
                  Requested by:
                </span>{' '}
                {item.requestedByUser?.name ??
                  item.requestedByUser?.email ??
                  'Unknown'}
              </p>
              <p>
                <span className="text-brand-subtle">
                  Created:
                </span>{' '}
                {formatDate(item.createdAt)}
              </p>
              {item.expiresAt && (
                <p>
                  <span className="text-brand-subtle">
                    Expires:
                  </span>{' '}
                  {formatDate(item.expiresAt)}
                </p>
              )}
            </div>
          </div>

          <div className="rounded-[1.2rem] border border-brand-line bg-brand-elevated p-4">
            <p className="text-sm font-medium text-foreground">
              Payload preview
            </p>
            {fields.length === 0 ? (
              <p className="mt-3 text-sm leading-7 text-brand-quiet">
                No structured preview fields were extracted
                for this action.
              </p>
            ) : (
              <div className="mt-3 space-y-3">
                {fields.map((field) => (
                  <div key={`${item.id}:${field.label}`}>
                    <p className="text-xs uppercase tracking-[0.16em] text-brand-subtle">
                      {field.label}
                    </p>
                    <p className="mt-1 text-sm leading-6 text-foreground">
                      {field.value}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </section>
  )
}
