'use client'

import { useCallback, useEffect, useState } from 'react'
import { Alert, AlertDescription } from '@kodi/ui/components/alert'
import { Button } from '@kodi/ui/components/button'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@kodi/ui/components/sheet'
import { Skeleton } from '@kodi/ui/components/skeleton'
import { trpc } from '@/lib/trpc'
import { DrawerHeader } from './drawer/drawer-header'
import type { ToolAccessToolkitDetail } from '../_lib/tool-access-ui'

type LoadState =
  | { kind: 'idle' }
  | { kind: 'loading' }
  | { kind: 'error'; message: string; isNotFound: boolean }
  | { kind: 'ready'; detail: ToolAccessToolkitDetail }

export function IntegrationDrawer({
  orgId,
  toolkitSlug,
  onClose,
  onConnect,
  connectingSlug,
  reloadKey,
}: {
  orgId: string
  toolkitSlug: string | null
  onClose: () => void
  onConnect: (slug: string) => void
  connectingSlug: string | null
  reloadKey: number
}) {
  const [state, setState] = useState<LoadState>({ kind: 'idle' })
  const open = toolkitSlug !== null

  const load = useCallback(
    async (slug: string) => {
      setState({ kind: 'loading' })
      try {
        const detail = await trpc.toolAccess.getToolkitDetail.query({
          orgId,
          toolkitSlug: slug,
        })
        setState({ kind: 'ready', detail })
      } catch (error) {
        const message =
          error instanceof Error
            ? error.message
            : 'Failed to load this integration.'
        const isNotFound =
          message.toLowerCase().includes('not found') ||
          (error as { data?: { code?: string } })?.data?.code === 'NOT_FOUND'
        setState({ kind: 'error', message, isNotFound })
      }
    },
    [orgId]
  )

  useEffect(() => {
    if (!toolkitSlug) {
      setState({ kind: 'idle' })
      return
    }
    void load(toolkitSlug)
  }, [toolkitSlug, load, reloadKey])

  return (
    <Sheet
      open={open}
      onOpenChange={(nextOpen) => {
        if (!nextOpen) onClose()
      }}
    >
      <SheetContent
        side="right"
        className="w-full sm:max-w-xl"
        onOpenAutoFocus={(event) => event.preventDefault()}
      >
        <SheetHeader className="sr-only">
          <SheetTitle>Integration details</SheetTitle>
          <SheetDescription>
            Connected identities, workspace policy, and integration settings.
          </SheetDescription>
        </SheetHeader>

        <div className="flex h-full flex-col overflow-hidden">
          {state.kind === 'loading' && <LoadingSkeleton />}

          {state.kind === 'error' && (
            <NotFoundOrError
              isNotFound={state.isNotFound}
              message={state.message}
              onRetry={() => toolkitSlug && void load(toolkitSlug)}
            />
          )}

          {state.kind === 'ready' && (
            <>
              <div className="border-b border-border px-6 py-5">
                <DrawerHeader
                  detail={state.detail}
                  onConnect={() => onConnect(state.detail.toolkit.slug)}
                  isBusy={connectingSlug !== null}
                />
              </div>
              <div className="flex-1 overflow-y-auto px-6 py-5">
                <PlaceholderContent />
              </div>
            </>
          )}
        </div>
      </SheetContent>
    </Sheet>
  )
}

function LoadingSkeleton() {
  return (
    <div className="space-y-6 p-6">
      <div className="flex items-start gap-4">
        <Skeleton className="h-12 w-12 rounded-lg" />
        <div className="flex-1 space-y-2">
          <Skeleton className="h-5 w-32" />
          <Skeleton className="h-3 w-48" />
          <Skeleton className="h-3 w-28" />
        </div>
        <Skeleton className="h-9 w-24 rounded-md" />
      </div>
      <div className="space-y-3">
        <Skeleton className="h-4 w-40" />
        <Skeleton className="h-16 w-full rounded-lg" />
        <Skeleton className="h-16 w-full rounded-lg" />
      </div>
    </div>
  )
}

function NotFoundOrError({
  isNotFound,
  message,
  onRetry,
}: {
  isNotFound: boolean
  message: string
  onRetry: () => void
}) {
  if (isNotFound) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-2 p-10 text-center">
        <p className="text-sm font-medium text-foreground">
          Toolkit not found
        </p>
        <p className="text-sm text-muted-foreground">
          This integration is no longer in the catalog.
        </p>
      </div>
    )
  }
  return (
    <div className="p-6">
      <Alert variant="destructive">
        <AlertDescription className="flex items-center justify-between gap-4">
          <span>{message}</span>
          <Button type="button" size="sm" variant="outline" onClick={onRetry}>
            Retry
          </Button>
        </AlertDescription>
      </Alert>
    </div>
  )
}

function PlaceholderContent() {
  return (
    <p className="text-sm text-muted-foreground">
      Identities, policy, and Slack settings ship in KOD-347 / KOD-348.
    </p>
  )
}
