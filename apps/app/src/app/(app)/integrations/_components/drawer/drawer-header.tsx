'use client'

import { Button } from '@kodi/ui/components/button'
import { cn } from '@kodi/ui/lib/utils'
import { ToolkitLogo } from '../toolkit-logo'
import type { ToolAccessToolkitDetail } from '../../_lib/tool-access-ui'

type Tone = 'success' | 'danger' | 'info' | 'neutral'

export function DrawerHeader({
  detail,
  onConnect,
  isBusy,
}: {
  detail: ToolAccessToolkitDetail
  onConnect: () => void
  isBusy: boolean
}) {
  const toolkit = detail.toolkit
  const primary =
    detail.connections.find(
      (connection) => connection.isPreferred && connection.status === 'ACTIVE'
    ) ??
    detail.connections.find((connection) => connection.status === 'ACTIVE') ??
    detail.connections[0] ??
    null

  const categories = toolkit.categories ?? []
  const subtitle =
    categories.length > 0
      ? categories
          .slice(0, 3)
          .map((category) => category.name)
          .join(' · ')
      : null
  const status = deriveStatus(primary?.status ?? null)
  const showReconnect =
    primary?.status === 'FAILED' || primary?.status === 'EXPIRED'
  const showConnect = !primary

  return (
    <div className="flex items-start gap-4">
      <ToolkitLogo
        name={toolkit.name}
        logoUrl={toolkit.logo ?? null}
        className="h-12 w-12 shrink-0"
      />
      <div className="min-w-0 flex-1 space-y-1">
        <h2 className="truncate text-lg font-semibold text-foreground">
          {toolkit.name}
        </h2>
        {subtitle && (
          <p className="truncate text-xs text-muted-foreground">{subtitle}</p>
        )}
        <p
          className={cn(
            'flex items-center gap-2 text-sm',
            toneText(status.tone)
          )}
        >
          <span
            aria-hidden
            className={cn('h-2 w-2 rounded-full', toneDot(status.tone))}
          />
          {status.label}
        </p>
      </div>
      {(showConnect || showReconnect) && (
        <Button
          type="button"
          className="shrink-0"
          onClick={onConnect}
          disabled={isBusy}
        >
          {showReconnect ? 'Reconnect' : 'Connect'}
        </Button>
      )}
    </div>
  )
}

// TODO(KOD-349): replace with typed statusFor() from connection-status.ts.
function deriveStatus(rawStatus: string | null): { tone: Tone; label: string } {
  if (!rawStatus) return { tone: 'neutral', label: 'Not connected' }
  switch (rawStatus) {
    case 'ACTIVE':
      return { tone: 'success', label: 'Connected' }
    case 'FAILED':
      return { tone: 'danger', label: 'Reconnect required' }
    case 'EXPIRED':
      return { tone: 'danger', label: 'Expired — reconnect' }
    case 'INACTIVE':
      return { tone: 'neutral', label: 'Disabled' }
    case 'INITIATED':
    case 'INITIALIZING':
      return { tone: 'info', label: 'Connecting…' }
    default:
      return { tone: 'neutral', label: rawStatus }
  }
}

function toneText(tone: Tone) {
  switch (tone) {
    case 'success':
      return 'text-brand-success'
    case 'danger':
      return 'text-brand-danger'
    case 'info':
      return 'text-brand-info'
    default:
      return 'text-muted-foreground'
  }
}

function toneDot(tone: Tone) {
  switch (tone) {
    case 'success':
      return 'bg-brand-success'
    case 'danger':
      return 'bg-brand-danger'
    case 'info':
      return 'bg-brand-info'
    default:
      return 'bg-muted-foreground/40'
  }
}
