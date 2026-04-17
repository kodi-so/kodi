import { Badge } from '@kodi/ui'
import type { ApprovalItem } from './utils'
import { RecentDecisionCard } from './recent-decision-card'

export function RecentDecisionsSection({
  items,
}: {
  items: ApprovalItem[]
}) {
  return (
    <section className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold text-foreground">
          Recent decisions
        </h2>
        <Badge variant="neutral">
          {items.length} items
        </Badge>
      </div>

      {items.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border bg-card p-6 text-sm text-muted-foreground">
          No approvals have been decided yet.
        </div>
      ) : (
        <div className="space-y-3">
          {items.map((item) => (
            <RecentDecisionCard key={item.id} item={item} />
          ))}
        </div>
      )}
    </section>
  )
}
