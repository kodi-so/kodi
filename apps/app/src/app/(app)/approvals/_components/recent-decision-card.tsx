import { Badge } from '@kodi/ui'
import {
  type ApprovalItem,
  formatDate,
  getExecutionTone,
  getPreviewSummary,
  getStatusTone,
} from './utils'

export function RecentDecisionCard({ item }: { item: ApprovalItem }) {
  return (
    <div className="rounded-[1.2rem] border border-brand-line bg-brand-elevated p-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant={getStatusTone(item.status)}>
              {item.status}
            </Badge>
            {item.executionStatus && (
              <Badge variant={getExecutionTone(item.executionStatus)}>
                execution: {item.executionStatus}
              </Badge>
            )}
            {item.toolkitSlug && (
              <Badge variant="neutral">
                {item.toolkitSlug}
              </Badge>
            )}
          </div>
          <p className="text-sm font-medium text-foreground">
            {item.action ?? 'External action'}
          </p>
          <p className="text-sm text-brand-quiet">
            {getPreviewSummary(item)}
          </p>
          {item.targetText && (
            <p className="text-sm text-brand-subtle">
              Target: {item.targetText}
            </p>
          )}
          {typeof item.attemptCount === 'number' &&
            item.attemptCount > 0 && (
              <p className="text-sm text-brand-subtle">
                Attempts: {item.attemptCount}
              </p>
            )}
          {item.executionError && (
            <p className="text-sm leading-6 text-brand-danger">
              {item.executionError}
            </p>
          )}
        </div>

        <div className="text-sm text-brand-subtle">
          {item.decidedAt
            ? `Decided ${formatDate(item.decidedAt)}`
            : `Created ${formatDate(item.createdAt)}`}
        </div>
      </div>
    </div>
  )
}
