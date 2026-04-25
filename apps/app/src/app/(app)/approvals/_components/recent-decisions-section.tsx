'use client'

import type { ApprovalItem } from './utils'
import { RecentDecisionCard } from './recent-decision-card'

export function RecentDecisionsSection({
  items,
}: {
  items: ApprovalItem[]
}) {
  if (items.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-border bg-card p-10 text-center">
        <p className="text-sm font-medium text-foreground">No history yet</p>
        <p className="mt-1 text-sm text-muted-foreground">
          Approved or rejected actions will show up here.
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-2">
      {items.map((item) => (
        <RecentDecisionCard key={item.id} item={item} />
      ))}
    </div>
  )
}
