'use client'

import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { Plus, Video } from 'lucide-react'
import { Alert, AlertDescription } from '@kodi/ui/components/alert'
import { Button } from '@kodi/ui/components/button'
import { Skeleton } from '@kodi/ui/components/skeleton'
import { Tabs, TabsContent } from '@kodi/ui/components/tabs'
import { pageShellClass } from '@/lib/brand-styles'
import { useOrg } from '@/lib/org-context'
import { trpc } from '@/lib/trpc'
import { IntegrationRow } from './integration-row'
import {
  IntegrationsTabsList,
  type IntegrationsTab,
} from './integrations-tabs'
import type {
  ToolAccessCatalog,
  ToolAccessItem,
} from '../_lib/tool-access-ui'

const VALID_TABS: IntegrationsTab[] = ['connected', 'needs-attention', 'browse']

function isIntegrationsTab(value: string | null): value is IntegrationsTab {
  return value !== null && (VALID_TABS as string[]).includes(value)
}

function sortItems(items: ToolAccessItem[]): ToolAccessItem[] {
  return [...items].sort((left, right) => {
    if (left.supportTier !== right.supportTier) {
      return left.supportTier === 'tier_1' ? -1 : 1
    }
    return left.name.localeCompare(right.name)
  })
}

export function IntegrationsPage() {
  const { activeOrg } = useOrg()
  const router = useRouter()
  const searchParams = useSearchParams()
  const [catalog, setCatalog] = useState<ToolAccessCatalog | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [connectingSlug, setConnectingSlug] = useState<string | null>(null)

  const urlTab = searchParams.get('tab')

  const loadCatalog = useCallback(
    async (orgId: string) => {
      setLoading(true)
      setError(null)
      try {
        const result = await trpc.toolAccess.getCatalog.query({
          orgId,
          limit: 60,
        })
        setCatalog(result)
      } catch (nextError) {
        setError(
          nextError instanceof Error
            ? nextError.message
            : 'Failed to load integrations.'
        )
      } finally {
        setLoading(false)
      }
    },
    []
  )

  useEffect(() => {
    if (!activeOrg) {
      setCatalog(null)
      setLoading(false)
      return
    }
    void loadCatalog(activeOrg.orgId)
  }, [activeOrg?.orgId, loadCatalog])

  const items = catalog?.items ?? []

  const connectedItems = useMemo(
    () =>
      sortItems(
        items.filter((item) => item.connection?.status === 'ACTIVE')
      ),
    [items]
  )
  const needsAttentionItems = useMemo(
    () =>
      sortItems(
        items.filter(
          (item) =>
            item.connection?.status === 'FAILED' ||
            item.connection?.status === 'EXPIRED'
        )
      ),
    [items]
  )
  const browseItems = useMemo(() => sortItems(items), [items])

  const defaultTab: IntegrationsTab =
    needsAttentionItems.length > 0
      ? 'needs-attention'
      : connectedItems.length > 0
        ? 'connected'
        : 'browse'

  const activeTab: IntegrationsTab = isIntegrationsTab(urlTab)
    ? urlTab
    : defaultTab

  const setTab = useCallback(
    (next: string) => {
      if (!isIntegrationsTab(next)) return
      const params = new URLSearchParams(searchParams.toString())
      params.set('tab', next)
      router.replace(`/integrations?${params.toString()}`, { scroll: false })
    },
    [router, searchParams]
  )

  const openDrawer = useCallback((slug: string) => {
    // Drawer wires up in KOD-345 (T4). For now just log so rows feel responsive
    // to click while the shell ships independently.
    console.debug('[integrations] open drawer for', slug)
  }, [])

  const connect = useCallback(
    async (slug: string) => {
      if (!activeOrg || connectingSlug) return
      setConnectingSlug(slug)
      setError(null)
      try {
        const result = await trpc.toolAccess.createConnectLink.mutate({
          orgId: activeOrg.orgId,
          toolkitSlug: slug,
          returnPath: `/integrations?tab=connected&toolkit=${encodeURIComponent(slug)}`,
        })
        if (!result.redirectUrl) {
          throw new Error('Composio did not return a redirect URL.')
        }
        window.location.assign(result.redirectUrl)
      } catch (nextError) {
        setError(
          nextError instanceof Error
            ? nextError.message
            : 'Failed to start the connection flow.'
        )
        setConnectingSlug(null)
      }
    },
    [activeOrg, connectingSlug]
  )

  if (!activeOrg) {
    return (
      <div className="flex min-h-full items-center justify-center p-6">
        <Skeleton className="h-6 w-6 rounded-full bg-brand-muted" />
      </div>
    )
  }

  return (
    <div className={pageShellClass}>
      <div className="mx-auto flex max-w-4xl flex-col gap-6 px-4 py-8">
        <Header
          activeCount={catalog?.summary.activeCount ?? 0}
          onBrowse={() => setTab('browse')}
        />

        <SetupAlerts catalog={catalog} error={error} />

        {loading ? (
          <LoadingRows />
        ) : catalog ? (
          <Tabs
            value={activeTab}
            onValueChange={setTab}
            className="flex flex-col gap-4"
          >
            <IntegrationsTabsList
              connectedCount={connectedItems.length}
              needsAttentionCount={needsAttentionItems.length}
            />

            <TabsContent value="connected" className="mt-0">
              {connectedItems.length === 0 ? (
                <EmptySlot
                  testId="empty-state-slot"
                  title="No connected integrations yet"
                  body="Head to Browse to pick the first tool Kodi can act through."
                  actionLabel="Browse integrations"
                  onAction={() => setTab('browse')}
                />
              ) : (
                <RowList>
                  {connectedItems.map((item) => (
                    <IntegrationRow
                      key={item.slug}
                      item={item}
                      variant="connected"
                      onOpen={openDrawer}
                      onConnect={connect}
                      isBusy={connectingSlug !== null}
                    />
                  ))}
                </RowList>
              )}
            </TabsContent>

            <TabsContent value="needs-attention" className="mt-0">
              {needsAttentionItems.length === 0 ? (
                <EmptySlot
                  title="Nothing needs attention"
                  body="Connections go here if they fail or expire so they're easy to spot."
                />
              ) : (
                <RowList>
                  {needsAttentionItems.map((item) => (
                    <IntegrationRow
                      key={item.slug}
                      item={item}
                      variant="needs-attention"
                      onOpen={openDrawer}
                      onConnect={connect}
                      isBusy={connectingSlug !== null}
                    />
                  ))}
                </RowList>
              )}
            </TabsContent>

            <TabsContent value="browse" className="mt-0">
              {browseItems.length === 0 ? (
                <EmptySlot
                  title="Catalog unavailable"
                  body="No toolkits came back from the catalog yet."
                />
              ) : (
                <RowList>
                  {browseItems.map((item) => (
                    <IntegrationRow
                      key={item.slug}
                      item={item}
                      variant="browse"
                      onOpen={openDrawer}
                      onConnect={connect}
                      isBusy={connectingSlug !== null}
                    />
                  ))}
                </RowList>
              )}
            </TabsContent>
          </Tabs>
        ) : (
          <Alert variant="destructive">
            <AlertDescription className="flex items-center justify-between gap-4">
              <span>{error ?? 'Failed to load integrations.'}</span>
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => activeOrg && void loadCatalog(activeOrg.orgId)}
              >
                Retry
              </Button>
            </AlertDescription>
          </Alert>
        )}
      </div>
    </div>
  )
}

function Header({
  activeCount,
  onBrowse,
}: {
  activeCount: number
  onBrowse: () => void
}) {
  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">
          Integrations
        </h1>
        <p className="text-sm text-muted-foreground">
          Connect the tools Kodi can act through.
          {activeCount > 0 && (
            <>
              {' '}
              <span className="text-foreground">
                {activeCount} active
              </span>
              .
            </>
          )}
        </p>
      </div>
      <div className="flex flex-col gap-2 sm:flex-row">
        <Button type="button" className="gap-2" onClick={onBrowse}>
          <Plus size={16} />
          Add integrations
        </Button>
        <Button asChild variant="outline" className="gap-2">
          <Link href="/meetings">
            <Video size={16} />
            Zoom lives in Meetings
          </Link>
        </Button>
      </div>
    </div>
  )
}

function SetupAlerts({
  catalog,
  error,
}: {
  catalog: ToolAccessCatalog | null
  error: string | null
}) {
  return (
    <>
      {error && catalog && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
      {catalog && !catalog.setup.apiConfigured && (
        <Alert variant="warning">
          <AlertDescription>
            Composio is not configured in this environment yet. Add the
            missing API values to make the tool catalog connectable.
          </AlertDescription>
        </Alert>
      )}
      {catalog && !catalog.featureFlags.toolAccess && (
        <Alert variant="warning">
          <AlertDescription>
            Tool access is off in this environment right now, so the catalog
            stays browse-only until the feature flag is enabled.
          </AlertDescription>
        </Alert>
      )}
      {catalog?.syncError && (
        <Alert variant="warning">
          <AlertDescription>{catalog.syncError}</AlertDescription>
        </Alert>
      )}
    </>
  )
}

function RowList({ children }: { children: React.ReactNode }) {
  return <div className="space-y-2">{children}</div>
}

function LoadingRows() {
  return (
    <div className="space-y-2">
      {Array.from({ length: 4 }).map((_, index) => (
        <div
          key={index}
          className="flex items-center gap-3 rounded-xl border border-border bg-card px-4 py-3"
        >
          <Skeleton className="h-10 w-10 rounded-lg" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-4 w-32" />
            <Skeleton className="h-3 w-48" />
          </div>
          <Skeleton className="h-8 w-20 rounded-md" />
        </div>
      ))}
    </div>
  )
}

function EmptySlot({
  title,
  body,
  actionLabel,
  onAction,
  testId,
}: {
  title: string
  body: string
  actionLabel?: string
  onAction?: () => void
  testId?: string
}) {
  return (
    <div
      data-testid={testId}
      className="rounded-xl border border-dashed border-border bg-card p-8 text-center"
    >
      <p className="text-sm font-medium text-foreground">{title}</p>
      <p className="mt-1 text-sm text-muted-foreground">{body}</p>
      {actionLabel && onAction && (
        <Button
          type="button"
          variant="outline"
          className="mt-4"
          onClick={onAction}
        >
          {actionLabel}
        </Button>
      )}
    </div>
  )
}
