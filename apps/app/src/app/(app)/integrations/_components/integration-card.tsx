'use client'

import Link from 'next/link'
import { ArrowUpRight } from 'lucide-react'
import { Badge, cn } from '@kodi/ui'
import { getStatusTone, getToolkitMonogram } from '../_lib/tool-access-ui'

export function IntegrationCard({
  href,
  name,
  slug,
  status,
  meta,
  note,
  badges = [],
  priority = false,
}: {
  href: string
  name: string
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
        'group flex min-h-[168px] flex-col justify-between rounded-[1.6rem] border bg-[linear-gradient(180deg,rgba(19,21,27,0.98),rgba(11,13,18,1))] p-5 transition',
        priority
          ? 'border-teal-500/20 shadow-[0_18px_60px_-42px_rgba(20,184,166,0.55)]'
          : 'border-zinc-800',
        'hover:-translate-y-0.5 hover:border-zinc-700'
      )}
    >
      <div className="space-y-4">
        <div className="flex items-start justify-between gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-[1.2rem] border border-zinc-800 bg-zinc-950 text-sm font-semibold uppercase tracking-[0.18em] text-zinc-200">
            {getToolkitMonogram(name)}
          </div>
          <Badge className={getStatusTone(status)}>{status}</Badge>
        </div>

        <div className="space-y-2">
          <div>
            <h2 className="text-lg font-medium tracking-tight text-white">
              {name}
            </h2>
            <p className="mt-1 text-xs uppercase tracking-[0.18em] text-zinc-500">
              {slug}
            </p>
          </div>

          {meta && (
            <p className="text-sm leading-6 text-zinc-300 line-clamp-2">
              {meta}
            </p>
          )}

          {note && (
            <p className="text-sm leading-6 text-zinc-500 line-clamp-2">
              {note}
            </p>
          )}
        </div>
      </div>

      <div className="mt-5 flex items-center justify-between gap-3 border-t border-zinc-800/80 pt-4 text-sm">
        <div className="flex flex-wrap gap-2">
          {badges.slice(0, 2).map((badge) => (
            <span
              key={badge}
              className="rounded-full border border-zinc-800 bg-zinc-950 px-2.5 py-1 text-[11px] uppercase tracking-[0.16em] text-zinc-400"
            >
              {badge}
            </span>
          ))}
        </div>
        <span className="inline-flex items-center gap-2 text-zinc-200 transition group-hover:translate-x-0.5">
          Open
          <ArrowUpRight size={15} />
        </span>
      </div>
    </Link>
  )
}
