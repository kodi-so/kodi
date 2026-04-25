'use client'

import {
  TabsList,
  TabsTrigger,
} from '@kodi/ui/components/tabs'
import { cn } from '@kodi/ui/lib/utils'

export type IntegrationsTab = 'connected' | 'needs-attention' | 'browse'

export function IntegrationsTabsList({
  connectedCount,
  needsAttentionCount,
}: {
  connectedCount: number
  needsAttentionCount: number
}) {
  return (
    <TabsList className="self-start">
      <TabsTrigger value="connected" className="gap-2">
        Connected
        {connectedCount > 0 && (
          <CountPill tone="muted">{connectedCount}</CountPill>
        )}
      </TabsTrigger>
      {needsAttentionCount > 0 && (
        <TabsTrigger value="needs-attention" className="gap-2">
          Needs attention
          <CountPill tone="danger">{needsAttentionCount}</CountPill>
        </TabsTrigger>
      )}
      <TabsTrigger value="browse">Browse</TabsTrigger>
    </TabsList>
  )
}

function CountPill({
  tone,
  children,
}: {
  tone: 'muted' | 'danger'
  children: React.ReactNode
}) {
  return (
    <span
      className={cn(
        'inline-flex h-5 min-w-[1.25rem] items-center justify-center rounded-full px-1.5 text-xs font-medium',
        tone === 'muted' && 'bg-primary/10 text-primary',
        tone === 'danger' && 'bg-brand-danger/15 text-brand-danger'
      )}
    >
      {children}
    </span>
  )
}
