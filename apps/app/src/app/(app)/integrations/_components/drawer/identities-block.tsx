'use client'

import { useState } from 'react'
import { MoreHorizontal, Plus, RefreshCcw } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@kodi/ui/components/button'
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@kodi/ui/components/collapsible'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@kodi/ui/components/dropdown-menu'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@kodi/ui/components/popover'
import { cn } from '@kodi/ui/lib/utils'
import { ConfirmDialog } from '@/components/confirm-dialog'
import { trpc } from '@/lib/trpc'
import type { ToolAccessToolkitDetail } from '../../_lib/tool-access-ui'

type Connection = ToolAccessToolkitDetail['connections'][number]
type Tone = 'success' | 'danger' | 'info' | 'neutral'

export function IdentitiesBlock({
  orgId,
  toolkitSlug,
  connections,
  connectingSlug,
  onConnect,
  onRefresh,
}: {
  orgId: string
  toolkitSlug: string
  connections: Connection[]
  connectingSlug: string | null
  onConnect: (slug: string) => void
  onRefresh: () => void
}) {
  const [busyId, setBusyId] = useState<string | null>(null)
  const [confirmDisconnect, setConfirmDisconnect] =
    useState<Connection | null>(null)

  if (connections.length === 0) return null

  const primary = pickPrimary(connections)
  const others = primary
    ? connections.filter(
        (connection) => connection.connectedAccountId !== primary.connectedAccountId
      )
    : []

  async function disconnect(connection: Connection) {
    setBusyId(connection.connectedAccountId)
    try {
      await trpc.toolAccess.disconnect.mutate({
        orgId,
        connectedAccountId: connection.connectedAccountId,
      })
      toast.success(`Disconnected ${labelOf(connection)}`)
      onRefresh()
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : 'Failed to disconnect this account.'
      )
    } finally {
      setBusyId(null)
    }
  }

  async function revalidate(connection: Connection) {
    setBusyId(connection.connectedAccountId)
    try {
      await trpc.toolAccess.revalidateConnection.mutate({
        orgId,
        connectedAccountId: connection.connectedAccountId,
      })
      toast.success('Connection re-checked')
      onRefresh()
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : 'Failed to revalidate this connection.'
      )
    } finally {
      setBusyId(null)
    }
  }

  async function makePrimary(connection: Connection) {
    setBusyId(connection.connectedAccountId)
    try {
      await trpc.toolAccess.setPreferredConnection.mutate({
        orgId,
        toolkitSlug,
        connectedAccountId: connection.connectedAccountId,
      })
      toast.success(`${labelOf(connection)} is now the primary identity`)
      onRefresh()
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : 'Failed to update the primary identity.'
      )
    } finally {
      setBusyId(null)
    }
  }

  return (
    <section className="space-y-3">
      <h3 className="text-sm font-semibold text-foreground">Identities</h3>

      {primary && (
        <PrimaryRow
          connection={primary}
          isBusy={busyId !== null || connectingSlug !== null}
          busyId={busyId}
          connectingSlug={connectingSlug}
          toolkitSlug={toolkitSlug}
          onReconnect={() => onConnect(toolkitSlug)}
          onRevalidate={() => void revalidate(primary)}
          onDisconnectRequest={() => setConfirmDisconnect(primary)}
        />
      )}

      {others.length > 0 && (
        <Collapsible>
          <CollapsibleTrigger className="flex w-full items-center justify-between rounded-md px-1 py-1.5 text-left text-sm text-muted-foreground hover:text-foreground">
            <span>Other identities ({others.length})</span>
            <span aria-hidden className="text-xs">▾</span>
          </CollapsibleTrigger>
          <CollapsibleContent className="mt-2 space-y-2">
            {others.map((connection) => (
              <OtherRow
                key={connection.connectedAccountId}
                connection={connection}
                isBusy={busyId === connection.connectedAccountId}
                onMakePrimary={() => void makePrimary(connection)}
                onDisconnectRequest={() => setConfirmDisconnect(connection)}
              />
            ))}
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="gap-2 text-muted-foreground"
              disabled={connectingSlug !== null}
              onClick={() => onConnect(toolkitSlug)}
            >
              <Plus size={14} />
              Connect another account
            </Button>
          </CollapsibleContent>
        </Collapsible>
      )}

      <ConfirmDialog
        open={confirmDisconnect !== null}
        onOpenChange={(next) => {
          if (!next) setConfirmDisconnect(null)
        }}
        title="Disconnect this account?"
        description={
          confirmDisconnect
            ? `Disconnect ${labelOf(confirmDisconnect)}? Kodi will stop using this account immediately.`
            : ''
        }
        actionLabel="Disconnect"
        onConfirm={() => {
          const target = confirmDisconnect
          setConfirmDisconnect(null)
          if (target) void disconnect(target)
        }}
      />
    </section>
  )
}

function PrimaryRow({
  connection,
  isBusy,
  busyId,
  connectingSlug,
  toolkitSlug,
  onReconnect,
  onRevalidate,
  onDisconnectRequest,
}: {
  connection: Connection
  isBusy: boolean
  busyId: string | null
  connectingSlug: string | null
  toolkitSlug: string
  onReconnect: () => void
  onRevalidate: () => void
  onDisconnectRequest: () => void
}) {
  const status = deriveStatus(connection.status)
  const needsReconnect =
    connection.status === 'FAILED' || connection.status === 'EXPIRED'

  return (
    <div className="rounded-lg border border-border bg-card p-3">
      <div className="flex items-center gap-3">
        <Avatar label={labelOf(connection)} />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-foreground">
            {labelOf(connection)}
          </p>
          <p
            className={cn(
              'flex items-center gap-2 text-xs',
              toneText(status.tone)
            )}
          >
            <span
              aria-hidden
              className={cn('h-1.5 w-1.5 rounded-full', toneDot(status.tone))}
            />
            {status.label}
            <span className="text-muted-foreground">· Primary</span>
          </p>
        </div>

        {needsReconnect ? (
          <Button
            type="button"
            size="sm"
            className="shrink-0 bg-primary text-primary-foreground hover:bg-primary/90"
            disabled={connectingSlug === toolkitSlug}
            onClick={onReconnect}
          >
            Reconnect
          </Button>
        ) : null}

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-8 w-8 shrink-0 text-muted-foreground"
              aria-label="Identity actions"
              disabled={isBusy}
            >
              <MoreHorizontal size={16} />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem
              onClick={onRevalidate}
              disabled={busyId === connection.connectedAccountId}
            >
              <RefreshCcw size={14} className="mr-2" />
              Revalidate
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={onDisconnectRequest}
              className="text-brand-danger focus:text-brand-danger"
            >
              Disconnect
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      <ScopesRow scopes={connection.scopes} />
    </div>
  )
}

function OtherRow({
  connection,
  isBusy,
  onMakePrimary,
  onDisconnectRequest,
}: {
  connection: Connection
  isBusy: boolean
  onMakePrimary: () => void
  onDisconnectRequest: () => void
}) {
  const status = deriveStatus(connection.status)

  return (
    <div className="flex items-center gap-3 rounded-lg border border-border bg-card p-3">
      <Avatar label={labelOf(connection)} size="sm" />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm text-foreground">
          {labelOf(connection)}
        </p>
        <p
          className={cn(
            'flex items-center gap-2 text-xs',
            toneText(status.tone)
          )}
        >
          <span
            aria-hidden
            className={cn('h-1.5 w-1.5 rounded-full', toneDot(status.tone))}
          />
          {status.label}
        </p>
      </div>
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="shrink-0"
        disabled={isBusy}
        onClick={onMakePrimary}
      >
        Make primary
      </Button>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="shrink-0 text-muted-foreground hover:bg-brand-danger-soft hover:text-brand-danger"
        disabled={isBusy}
        onClick={onDisconnectRequest}
      >
        Disconnect
      </Button>
    </div>
  )
}

function ScopesRow({ scopes }: { scopes: string[] | null | undefined }) {
  const list = scopes ?? []
  if (list.length === 0) {
    return (
      <p className="mt-2 text-xs text-muted-foreground">No scopes reported</p>
    )
  }

  const visible = list.slice(0, 3)
  const overflow = list.length - visible.length
  const preview = visible.join(', ') + (overflow > 0 ? ` + ${overflow} more` : '')

  return (
    <div className="mt-2">
      {overflow > 0 ? (
        <Popover>
          <PopoverTrigger asChild>
            <button
              type="button"
              className="truncate text-left text-xs text-muted-foreground underline-offset-2 hover:underline"
            >
              Scopes: {preview}
            </button>
          </PopoverTrigger>
          <PopoverContent align="start" className="max-w-xs">
            <p className="text-xs font-medium text-foreground">
              Authorized scopes
            </p>
            <ul className="mt-2 space-y-1 text-xs text-muted-foreground">
              {list.map((scope) => (
                <li key={scope} className="break-words">
                  {scope}
                </li>
              ))}
            </ul>
          </PopoverContent>
        </Popover>
      ) : (
        <p className="truncate text-xs text-muted-foreground">
          Scopes: {preview}
        </p>
      )}
    </div>
  )
}

function Avatar({
  label,
  size = 'md',
}: {
  label: string
  size?: 'sm' | 'md'
}) {
  const initial = label.trim().slice(0, 1).toUpperCase() || '?'
  return (
    <div
      className={cn(
        'flex shrink-0 items-center justify-center rounded-full bg-secondary text-xs font-semibold text-foreground',
        size === 'sm' ? 'h-7 w-7' : 'h-8 w-8'
      )}
    >
      {initial}
    </div>
  )
}

function pickPrimary(connections: Connection[]): Connection | null {
  return (
    connections.find(
      (connection) => connection.isPreferred && connection.status === 'ACTIVE'
    ) ??
    connections.find((connection) => connection.status === 'ACTIVE') ??
    connections[0] ??
    null
  )
}

function labelOf(connection: Connection): string {
  return (
    connection.connectedAccountLabel ||
    connection.externalUserEmail ||
    'Connected account'
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
      return { tone: 'danger', label: 'Expired' }
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
