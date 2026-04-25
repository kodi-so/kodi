'use client'

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
  if (items.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-border bg-card p-10 text-center">
        <p className="text-sm font-medium text-foreground">All caught up</p>
        <p className="mt-1 text-sm text-muted-foreground">
          Nothing is waiting for approval right now.
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-2">
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
  )
}
