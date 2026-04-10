'use client'

import Link from 'next/link'
import { useDeferredValue, useEffect, useMemo, useState } from 'react'
import { ArrowLeft, Plus, Search } from 'lucide-react'
import {
  Alert,
  AlertDescription,
  Badge,
  Button,
  Input,
  Skeleton,
} from '@kodi/ui'
import { useOrg } from '@/lib/org-context'
import { trpc } from '@/lib/trpc'
import { IntegrationCard } from '../_components/integration-card'
import {
  formatAuthMode,
  formatSupportTier,
  getCatalogCardMeta,
  getCatalogCardNote,
  getStatusRank,
  getToolkitCatalogStatus,
  type ToolAccessCatalog,
  type ToolAccessItem,
} from '../_lib/tool-access-ui'
import {
  heroPanelClass,
  pageShellClass,
  quietTextClass,
} from '@/lib/brand-styles'

function sortItems(items: ToolAccessItem[], catalog: ToolAccessCatalog | null) {
  return [...items].sort((left, right) => {
    const statusRank =
      getStatusRank(getToolkitCatalogStatus(left, catalog)) -
      getStatusRank(getToolkitCatalogStatus(right, catalog))
    if (statusRank !== 0) return statusRank

    if (left.supportTier !== right.supportTier) {
      return left.supportTier === 'tier_1' ? -1 : 1
    }

    return left.name.localeCompare(right.name)
  })
}

export default function AddIntegrationsPage() {
  const { activeOrg } = useOrg()
  const [catalog, setCatalog] = useState<ToolAccessCatalog | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const deferredSearch = useDeferredValue(search)

  useEffect(() => {
    if (!activeOrg) {
      setCatalog(null)
      setLoading(false)
      return
    }

    const orgId = activeOrg.orgId
    let cancelled = false
    setLoading(true)
    setError(null)

    async function load() {
      try {
        const result = await trpc.toolAccess.getCatalog.query({
          orgId,
          search: deferredSearch.trim() || undefined,
          limit: 60,
        })

        if (cancelled) return
        setCatalog(result)
      } catch (nextError) {
        if (cancelled) return
        setError(
          nextError instanceof Error
            ? nextError.message
            : 'Failed to load the integration catalog.'
        )
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    void load()
    return () => {
      cancelled = true
    }
  }, [activeOrg?.orgId, deferredSearch])

  const items = useMemo(
    () => sortItems(catalog?.items ?? [], catalog),
    [catalog]
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
      <div className="mx-auto flex max-w-6xl flex-col gap-6 px-4 py-8">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div className="space-y-3">
            <Button
              asChild
              variant="ghost"
              className="w-fit gap-2 px-0 text-brand-quiet hover:bg-transparent hover:text-foreground"
            >
              <Link href="/integrations">
                <ArrowLeft size={16} />
                Back to active integrations
              </Link>
            </Button>

            <div className="space-y-2">
              <div className="flex flex-wrap gap-2">
                <Badge variant="neutral">Add integrations</Badge>
                <Badge variant="neutral">
                  {catalog?.items.length ?? 0} shown
                </Badge>
              </div>
              <h1 className="text-3xl tracking-[-0.05em] text-foreground">
                Browse the tool catalog.
              </h1>
              <p className={`max-w-2xl text-sm leading-7 ${quietTextClass}`}>
                Search Composio-backed integrations, open the one you want, and
                connect it from the dedicated detail page. The cards stay light
                on purpose so the setup flow is easy to scan.
              </p>
            </div>
          </div>

          <Button
            asChild
            variant="ghost"
            className="gap-2 border border-brand-line bg-brand-elevated text-foreground hover:bg-background"
          >
            <Link href="/integrations">View active integrations</Link>
          </Button>
        </div>

        {error && (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {catalog?.syncError && (
          <Alert variant="warning">
            <AlertDescription>{catalog.syncError}</AlertDescription>
          </Alert>
        )}

        <section className={`${heroPanelClass} rounded-[1.6rem] p-4 sm:p-5`}>
          <div className="relative">
            <Search
              size={16}
              className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-brand-subtle"
            />
            <Input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search integrations"
              className="h-12 border-border/80 bg-card/90 pl-10"
            />
          </div>
        </section>

        {loading ? (
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {Array.from({ length: 6 }).map((_, index) => (
              <div
                key={index}
                className={`${heroPanelClass} rounded-[1.6rem] p-5`}
              >
                <Skeleton className="h-12 w-12 rounded-[1.2rem]" />
                <Skeleton className="mt-6 h-5 w-28" />
                <Skeleton className="mt-2 h-4 w-36" />
                <Skeleton className="mt-8 h-4 w-full" />
              </div>
            ))}
          </div>
        ) : items.length === 0 ? (
          <div className="rounded-[1.6rem] border border-dashed border-brand-line bg-brand-elevated p-8">
            <div className="max-w-xl space-y-3">
              <p className="text-xl font-medium text-foreground">
                No integrations match that search.
              </p>
              <p className={`text-sm leading-7 ${quietTextClass}`}>
                Try a broader search term or clear the field to return to the
                full catalog.
              </p>
            </div>
          </div>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {items.map((item) => (
              <IntegrationCard
                key={item.slug}
                href={`/integrations/${encodeURIComponent(item.slug)}`}
                name={item.name}
                slug={item.slug}
                status={getToolkitCatalogStatus(item, catalog)}
                meta={getCatalogCardMeta(item)}
                note={getCatalogCardNote(item)}
                badges={[
                  formatSupportTier(item.supportTier),
                  formatAuthMode(item.authMode),
                ]}
                priority={item.supportTier === 'tier_1'}
              />
            ))}
          </div>
        )}

        {!loading && (
          <div
            className={`rounded-[1.4rem] border border-brand-line bg-brand-elevated p-5 text-sm leading-7 ${quietTextClass}`}
          >
            Connect flows happen on each integration’s detail page so the main
            catalog stays easy to browse instead of turning into a wall of
            settings.
          </div>
        )}
      </div>
    </div>
  )
}
