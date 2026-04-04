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
        <Skeleton className="h-6 w-6 rounded-full bg-zinc-700" />
      </div>
    )
  }

  return (
    <div className="min-h-full bg-[radial-gradient(circle_at_top,rgba(20,184,166,0.08),transparent_22%),linear-gradient(180deg,rgba(16,18,24,0.96),rgba(8,9,13,1))]">
      <div className="mx-auto flex max-w-6xl flex-col gap-6 px-4 py-8">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div className="space-y-3">
            <Button
              asChild
              variant="ghost"
              className="w-fit gap-2 px-0 text-zinc-400 hover:bg-transparent hover:text-white"
            >
              <Link href="/integrations">
                <ArrowLeft size={16} />
                Back to active integrations
              </Link>
            </Button>

            <div className="space-y-2">
              <div className="flex flex-wrap gap-2">
                <Badge className="border-zinc-700 bg-zinc-950 text-zinc-300">
                  Add integrations
                </Badge>
                <Badge className="border-zinc-700 bg-zinc-950 text-zinc-300">
                  {catalog?.items.length ?? 0} shown
                </Badge>
              </div>
              <h1 className="text-3xl font-semibold tracking-tight text-white">
                Browse the tool catalog.
              </h1>
              <p className="max-w-2xl text-sm leading-7 text-zinc-400">
                Search Composio-backed integrations, open the one you want, and
                connect it from the dedicated detail page. The cards stay light
                on purpose so the setup flow is easy to scan.
              </p>
            </div>
          </div>

          <Button
            asChild
            variant="ghost"
            className="gap-2 border border-zinc-800 bg-zinc-950 text-zinc-300 hover:bg-zinc-900 hover:text-white"
          >
            <Link href="/integrations">View active integrations</Link>
          </Button>
        </div>

        {error && (
          <Alert className="border-red-500/30 bg-red-500/10 text-red-200">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {catalog?.syncError && (
          <Alert className="border-amber-500/30 bg-amber-500/10 text-amber-100">
            <AlertDescription>{catalog.syncError}</AlertDescription>
          </Alert>
        )}

        <section className="rounded-[1.6rem] border border-zinc-800 bg-[linear-gradient(180deg,rgba(20,22,29,0.96),rgba(12,13,18,0.98))] p-4 sm:p-5">
          <div className="relative">
            <Search
              size={16}
              className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500"
            />
            <Input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search integrations"
              className="h-12 border-zinc-800 bg-zinc-950 pl-10 text-white placeholder:text-zinc-500 focus-visible:ring-teal-500"
            />
          </div>
        </section>

        {loading ? (
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {Array.from({ length: 6 }).map((_, index) => (
              <div
                key={index}
                className="rounded-[1.6rem] border border-zinc-800 bg-zinc-900/60 p-5"
              >
                <Skeleton className="h-12 w-12 rounded-[1.2rem] bg-zinc-800" />
                <Skeleton className="mt-6 h-5 w-28 bg-zinc-800" />
                <Skeleton className="mt-2 h-4 w-36 bg-zinc-800" />
                <Skeleton className="mt-8 h-4 w-full bg-zinc-800" />
              </div>
            ))}
          </div>
        ) : items.length === 0 ? (
          <div className="rounded-[1.6rem] border border-dashed border-zinc-800 bg-zinc-950/40 p-8">
            <div className="max-w-xl space-y-3">
              <p className="text-xl font-medium text-white">
                No integrations match that search.
              </p>
              <p className="text-sm leading-7 text-zinc-400">
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
          <div className="rounded-[1.4rem] border border-zinc-800 bg-zinc-950/50 p-5 text-sm leading-7 text-zinc-400">
            Connect flows happen on each integration’s detail page so the main
            catalog stays easy to browse instead of turning into a wall of
            settings.
          </div>
        )}
      </div>
    </div>
  )
}
