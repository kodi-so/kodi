'use client'

import Link from 'next/link'
import { ArrowUpRight } from 'lucide-react'
import { Badge, cn } from '@kodi/ui'
import { getStatusTone } from '../_lib/tool-access-ui'
import { ToolkitLogo } from './toolkit-logo'

export function IntegrationCard({
  href,
  name,
  logoUrl,
  slug,
  status,
  meta,
  note,
  badges = [],
  priority = false,
}: {
  href: string
  name: string
  logoUrl?: string | null
  slug: string
  status: string
  meta: string | null
  note: string | null
  badges?: string[]
  priority?: boolean
}) {
  return (
    <Link
      href={href}
      className={cn(
        'group kodi-panel-surface flex min-h-[168px] flex-col justify-between rounded-[1.6rem] border p-5 shadow-brand-panel transition',
        priority ? 'border-primary/40' : 'border-border',
        'hover:-translate-y-0.5 hover:border-foreground/20'
      )}
    >
      <div className="space-y-4">
        <div className="flex items-start justify-between gap-3">
          <ToolkitLogo name={name} logoUrl={logoUrl} className="h-12 w-12" />
          <Badge variant={getStatusTone(status)}>{status}</Badge>
        </div>

        <div className="space-y-2">
          <div>
            <h2 className="text-lg font-medium tracking-tight text-foreground">
              {name}
            </h2>
            <p className="mt-1 text-xs uppercase tracking-[0.18em] text-muted-foreground">
              {slug}
            </p>
          </div>

          {meta && (
            <p className="line-clamp-2 text-sm leading-6 text-foreground">
              {meta}
            </p>
          )}

          {note && (
            <p className="line-clamp-2 text-sm leading-6 text-muted-foreground">
              {note}
            </p>
          )}
        </div>
      </div>

      <div className="mt-5 flex items-center justify-between gap-3 border-t border-border pt-4 text-sm">
        <div className="flex flex-wrap gap-2">
          {badges.slice(0, 2).map((badge) => (
            <span
              key={badge}
              className="rounded-full border border-border bg-secondary px-2.5 py-1 text-[11px] uppercase tracking-[0.16em] text-muted-foreground"
            >
              {badge}
            </span>
          ))}
        </div>
        <span className="inline-flex items-center gap-2 text-foreground transition group-hover:translate-x-0.5">
          Open
          <ArrowUpRight size={15} />
        </span>
      </div>
    </Link>
  )
}
