import { Badge } from '@kodi/ui'
import type { ApprovalItem } from './utils'
import { PendingApprovalCard } from './pending-approval-card'

export function PendingApprovalsSection({
  items,
  highlightedApprovalId,
  actionKey,
  onDecide,
}: {
  items: ApprovalItem[]
  highlightedApprovalId: string | null
  actionKey: string | null
  onDecide: (approvalRequestId: string, decision: 'approved' | 'rejected') => void
}) {
  return (
    <section className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold text-foreground">
          Pending approvals
        </h2>
        <Badge variant="outline">{items.length} pending</Badge>
      </div>

      {items.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border bg-card p-6 text-sm text-muted-foreground">
          Nothing is waiting for approval right now.
        </div>
      ) : (
        <div className="space-y-4">
          {items.map((item) => (
            <PendingApprovalCard
              key={item.id}
              item={item}
              isHighlighted={highlightedApprovalId === item.id}
              actionKey={actionKey}
              onDecide={onDecide}
            />
          ))}
        </div>
      )}
    </section>
  )
}
