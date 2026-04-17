import { ChevronDown } from 'lucide-react'
import { Badge, Button, cn } from '@kodi/ui'
import {
  heroPanelClass,
  quietTextClass,
  type BrandBadgeTone,
} from '@/lib/brand-styles'

export function CollapsibleSection({
  title,
  description,
  badges = [],
  actions,
  expanded,
  onToggle,
  children,
}: {
  title: string
  description: string
  badges?: Array<{
    label: string
    variant?: BrandBadgeTone
    className?: string
  }>
  actions?: React.ReactNode
  expanded: boolean
  onToggle: () => void
  children: React.ReactNode
}) {
  return (
    <section className={`${heroPanelClass} rounded-xl`}>
      <div className="p-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="space-y-3">
            <button
              type="button"
              onClick={onToggle}
              className="group inline-flex items-center gap-3 text-left"
            >
              <div className="flex h-9 w-9 items-center justify-center rounded-full border border-border bg-card text-muted-foreground transition group-hover:border-foreground/15 group-hover:text-foreground">
                <ChevronDown
                  size={16}
                  className={cn(
                    'transition duration-200',
                    expanded ? 'rotate-0' : '-rotate-90'
                  )}
                />
              </div>
              <div className="space-y-1">
                <h2 className="text-xl font-semibold text-foreground">
                  {title}
                </h2>
                <p className={`text-sm ${quietTextClass}`}>{description}</p>
              </div>
            </button>

            {badges.length > 0 && (
              <div className="flex flex-wrap gap-2 pl-12">
                {badges.map((badge) => (
                  <Badge
                    key={badge.label}
                    variant={badge.variant}
                    className={badge.className}
                  >
                    {badge.label}
                  </Badge>
                ))}
              </div>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-2 sm:justify-end">
            {actions}
            <Button
              type="button"
              variant="ghost"
              onClick={onToggle}
              className="border border-border bg-card text-muted-foreground hover:bg-secondary hover:text-foreground"
            >
              {expanded ? 'Collapse' : 'Expand'}
            </Button>
          </div>
        </div>
      </div>

      <div
        className={cn(
          'grid transition-[grid-template-rows] duration-300 ease-out',
          expanded ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]'
        )}
      >
        <div className="overflow-hidden">
          <div className="border-t border-border px-6 pb-6 pt-2">
            {children}
          </div>
        </div>
      </div>
    </section>
  )
}
