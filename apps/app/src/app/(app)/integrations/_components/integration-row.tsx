'use client'

import { ChevronRight } from 'lucide-react'
import { Button } from '@kodi/ui/components/button'
import { cn } from '@kodi/ui/lib/utils'
import { formatRelative } from '@/lib/time'
import { ToolkitLogo } from './toolkit-logo'
import {
  formatAuthMode,
  type ToolAccessItem,
} from '../_lib/tool-access-ui'

export type IntegrationRowVariant = 'connected' | 'needs-attention' | 'browse'

export function IntegrationRow({
  item,
  variant,
  onOpen,
  onConnect,
  isBusy,
}: {
  item: ToolAccessItem
  variant: IntegrationRowVariant
  onOpen: (slug: string) => void
  onConnect: (slug: string) => void
  isBusy: boolean
}) {
  const meta = resolveMeta(item, variant)
  const connection = item.connection

  return (
    <div
      role="button"
      tabIndex={0}
      aria-label={`Open ${item.name} details`}
      onClick={() => onOpen(item.slug)}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault()
          onOpen(item.slug)
        }
      }}
      className={cn(
        'group flex cursor-pointer items-center gap-3 rounded-xl border border-border bg-card px-4 py-3 transition-colors',
        'hover:border-border/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2'
      )}
    >
      <ToolkitLogo
        name={item.name}
        logoUrl={item.logo}
        className="h-10 w-10 shrink-0"
      />

      <div className="min-w-0 flex-1 space-y-0.5">
        <p className="truncate text-sm font-medium text-foreground">
          {item.name}
        </p>
        <p
          className={cn(
            'truncate text-xs',
            meta.error ? 'text-brand-danger' : 'text-muted-foreground'
          )}
        >
          {meta.line ?? '—'}
        </p>
      </div>

      {variant === 'connected' && (
        <div className="flex shrink-0 items-center gap-3">
          <span className="hidden items-center gap-2 text-xs text-muted-foreground sm:flex">
            <span
              aria-hidden
              className="h-2 w-2 rounded-full bg-brand-success"
            />
            Connected
          </span>
          <ChevronRight
            aria-hidden
            className="h-4 w-4 text-muted-foreground transition-transform group-hover:translate-x-0.5"
          />
        </div>
      )}

      {variant === 'needs-attention' && (
        <div className="flex shrink-0 items-center gap-2">
          <span
            aria-hidden
            className="h-2 w-2 rounded-full bg-brand-danger"
          />
          <Button
            type="button"
            size="sm"
            className="bg-primary text-primary-foreground hover:bg-primary/90"
            disabled={isBusy}
            onClick={(event) => {
              event.stopPropagation()
              onConnect(item.slug)
            }}
          >
            Reconnect
          </Button>
        </div>
      )}

      {variant === 'browse' && (
        <div className="flex shrink-0 items-center gap-2">
          {connection?.status === 'ACTIVE' ? (
            <span className="flex items-center gap-2 text-xs text-muted-foreground">
              <span
                aria-hidden
                className="h-2 w-2 rounded-full bg-brand-success"
              />
              Connected
            </span>
          ) : (
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={isBusy}
              onClick={(event) => {
                event.stopPropagation()
                onConnect(item.slug)
              }}
            >
              Connect
            </Button>
          )}
        </div>
      )}
    </div>
  )
}

function resolveMeta(
  item: ToolAccessItem,
  variant: IntegrationRowVariant
): { line: string | null; error: boolean } {
  const connection = item.connection

  if (variant === 'connected' && connection) {
    const who =
      connection.connectedAccountLabel || connection.externalUserEmail
    const validated = connection.lastValidatedAt
      ? `validated ${formatRelative(connection.lastValidatedAt)}`
      : null
    return {
      line: [who, validated].filter(Boolean).join(' · ') || null,
      error: false,
    }
  }

  if (variant === 'needs-attention' && connection) {
    const who =
      connection.connectedAccountLabel || connection.externalUserEmail
    const reason = connection.errorMessage || 'Reconnect required'
    return {
      line: [who, reason].filter(Boolean).join(' · ') || reason,
      error: true,
    }
  }

  const category = item.categories[0]?.name
  return {
    line: category ?? formatAuthMode(item.authMode),
    error: false,
  }
}
