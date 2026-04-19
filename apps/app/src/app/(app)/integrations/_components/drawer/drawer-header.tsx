'use client'

import { Button } from '@kodi/ui/components/button'
import { cn } from '@kodi/ui/lib/utils'
import { statusFor, toneDotClass, toneTextClass } from '../connection-status'
import { ToolkitLogo } from '../toolkit-logo'
import type { ToolAccessToolkitDetail } from '../../_lib/tool-access-ui'

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
  const status = statusFor(primary?.status ?? null)
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
            toneTextClass(status.tone)
          )}
        >
          <span
            aria-hidden
            className={cn(
              'h-2 w-2 rounded-full',
              toneDotClass(status.tone)
            )}
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

