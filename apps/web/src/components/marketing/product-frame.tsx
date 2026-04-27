import { cn } from '@kodi/ui/lib/utils'

/* ── Shared frame primitives ─────────────────────────────────── */

type ProductWindowProps = {
  children: React.ReactNode
  className?: string
  /** Use inside dark section bands */
  dark?: boolean
}

export function ProductWindow({ children, className, dark }: ProductWindowProps) {
  return (
    <div
      className={cn(
        'overflow-hidden rounded-2xl border shadow-soft',
        dark
          ? 'border-brand-room-dark-border bg-[hsl(var(--kodi-room-dark)/0.7)]'
          : 'kodi-panel-surface border-brand-line',
        className
      )}
    >
      {/* Window chrome */}
      <div
        className={cn(
          'flex items-center gap-2 border-b px-4 py-3',
          dark
            ? 'border-brand-room-dark-border'
            : 'border-brand-line'
        )}
      >
        <span
          className={cn(
            'h-2.5 w-2.5 rounded-full',
            dark ? 'bg-brand-room-dark-muted/50' : 'bg-brand-line'
          )}
        />
        <span
          className={cn(
            'h-2.5 w-2.5 rounded-full',
            dark ? 'bg-brand-room-dark-muted/50' : 'bg-brand-line'
          )}
        />
        <span
          className={cn(
            'h-2.5 w-2.5 rounded-full',
            dark ? 'bg-brand-room-dark-muted/50' : 'bg-brand-line'
          )}
        />
      </div>
      <div className="p-5">{children}</div>
    </div>
  )
}

type MeetingHeaderProps = {
  title: string
  participants?: number
  dark?: boolean
}

export function MeetingHeader({ title, participants = 4, dark }: MeetingHeaderProps) {
  return (
    <div className="mb-4 flex items-start justify-between gap-3">
      <div>
        <p
          className={cn(
            'text-xs uppercase tracking-[0.18em]',
            dark ? 'text-brand-room-dark-muted' : 'text-muted-foreground'
          )}
        >
          {participants} participants
        </p>
        <h3
          className={cn(
            'mt-1 text-base tracking-[-0.03em]',
            dark ? 'text-brand-room-dark-text' : 'text-foreground'
          )}
        >
          {title}
        </h3>
      </div>
      <LiveBadge dark={dark} />
    </div>
  )
}

type LiveBadgeProps = { dark?: boolean }

export function LiveBadge({ dark }: LiveBadgeProps) {
  return (
    <span
      className={cn(
        'flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs',
        dark
          ? 'border border-brand-room-dark-border text-brand-room-dark-muted'
          : 'border border-brand-line bg-brand-elevated text-muted-foreground'
      )}
    >
      <span
        className={cn(
          'h-1.5 w-1.5 rounded-full status-pulse',
          dark ? 'bg-brand-success' : 'bg-brand-success'
        )}
      />
      live
    </span>
  )
}

type StatusChipProps = {
  status: 'captured' | 'drafting' | 'pending' | 'approved' | 'executed' | 'waiting'
  dark?: boolean
}

const statusConfig: Record<
  StatusChipProps['status'],
  { label: string; lightClass: string; darkClass: string }
> = {
  captured: {
    label: 'Captured',
    lightClass: 'bg-brand-accent-soft text-brand-accent-strong border-brand-accent/30',
    darkClass: 'bg-brand-accent/15 text-brand-accent border-brand-accent/30',
  },
  drafting: {
    label: 'Drafting',
    lightClass: 'bg-brand-info-soft text-brand-info border-brand-info/30',
    darkClass: 'bg-brand-info/15 text-brand-info border-brand-info/30',
  },
  pending: {
    label: 'Awaiting approval',
    lightClass: 'bg-brand-warning-soft text-brand-warning border-brand-warning/30',
    darkClass: 'bg-brand-warning/15 text-brand-warning border-brand-warning/30',
  },
  approved: {
    label: 'Approved',
    lightClass: 'bg-brand-success-soft text-brand-success border-brand-success/30',
    darkClass: 'bg-brand-success/15 text-brand-success border-brand-success/30',
  },
  executed: {
    label: 'Executed',
    lightClass: 'bg-brand-success-soft text-brand-success border-brand-success/30',
    darkClass: 'bg-brand-success/15 text-brand-success border-brand-success/30',
  },
  waiting: {
    label: 'Waiting',
    lightClass: 'bg-muted text-muted-foreground border-border',
    darkClass: 'bg-brand-room-dark-border/40 text-brand-room-dark-muted border-brand-room-dark-border',
  },
}

export function StatusChip({ status, dark }: StatusChipProps) {
  const config = statusConfig[status]
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs',
        dark ? config.darkClass : config.lightClass
      )}
    >
      {config.label}
    </span>
  )
}

type ActionRowProps = {
  action: string
  tool: string
  status: StatusChipProps['status']
  dark?: boolean
}

export function ActionRow({ action, tool, status, dark }: ActionRowProps) {
  return (
    <div
      className={cn(
        'flex items-center justify-between gap-3 rounded-xl border p-3',
        dark
          ? 'border-brand-room-dark-border bg-[hsl(var(--kodi-room-dark)/0.5)]'
          : 'border-brand-line bg-brand-elevated'
      )}
    >
      <div className="min-w-0 flex-1">
        <p
          className={cn(
            'truncate text-sm',
            dark ? 'text-brand-room-dark-text' : 'text-foreground'
          )}
        >
          {action}
        </p>
        <p
          className={cn(
            'text-xs',
            dark ? 'text-brand-room-dark-muted' : 'text-muted-foreground'
          )}
        >
          via {tool}
        </p>
      </div>
      <StatusChip status={status} dark={dark} />
    </div>
  )
}

type ContextSourceProps = {
  source: string
  snippet: string
  dark?: boolean
}

export function ContextSource({ source, snippet, dark }: ContextSourceProps) {
  return (
    <div
      className={cn(
        'rounded-xl border p-3',
        dark
          ? 'border-brand-room-dark-border bg-[hsl(var(--kodi-room-dark)/0.5)]'
          : 'border-brand-line bg-brand-elevated'
      )}
    >
      <p
        className={cn(
          'mb-1 text-xs uppercase tracking-[0.15em]',
          dark ? 'text-brand-room-dark-muted' : 'text-muted-foreground'
        )}
      >
        {source}
      </p>
      <p
        className={cn(
          'text-sm leading-6',
          dark ? 'text-brand-room-dark-text' : 'text-foreground'
        )}
      >
        {snippet}
      </p>
    </div>
  )
}
