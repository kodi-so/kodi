import type { LucideIcon } from 'lucide-react'

export function SectionIcon({
  icon: Icon,
  size = 16,
}: {
  icon: LucideIcon
  size?: number
}) {
  return (
    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-secondary text-muted-foreground ring-1 ring-border">
      <Icon size={size} />
    </div>
  )
}
