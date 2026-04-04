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
        <Skeleton className="h-6 w-6 rounded-full bg-white/10" />
      </div>
    )
  }

  return (
    <div className="kodi-shell-bg min-h-full">
      <div className="mx-auto flex max-w-6xl flex-col gap-6 px-4 py-8">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div className="space-y-3">
            <Button
              asChild
              variant="ghost"
              className="w-fit gap-2 px-0 text-[#5d7379] hover:bg-transparent hover:text-[#223239]"
            >
              <Link href="/integrations">
                <ArrowLeft size={16} />
                Back to active integrations
              </Link>
            </Button>

            <div className="space-y-2">
              <div className="flex flex-wrap gap-2">
                <Badge className="border-[#c9d2d4] bg-white/82 text-[#223239]">
                  Add integrations
                </Badge>
                <Badge className="border-[#c9d2d4] bg-white/82 text-[#223239]">
                  {catalog?.items.length ?? 0} shown
                </Badge>
              </div>
              <h1 className="font-brand text-3xl tracking-[-0.05em] text-[#223239]">
                Browse the tool catalog.
              </h1>
              <p className="max-w-2xl text-sm leading-7 text-[#5d7379]">
                Search Composio-backed integrations, open the one you want, and
                connect it from the dedicated detail page. The cards stay light
                on purpose so the setup flow is easy to scan.
              </p>
            </div>
          </div>

          <Button
            asChild
            variant="ghost"
            className="gap-2 border border-[#c9d2d4] bg-white/82 text-[#223239] hover:bg-white"
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
          <Alert className="border-[#DFAE56]/30 bg-[#DFAE56]/12 text-[#f6d289]">
            <AlertDescription>{catalog.syncError}</AlertDescription>
          </Alert>
        )}

        <section className="rounded-[1.6rem] border border-white/10 bg-[rgba(49,66,71,0.78)] p-4 sm:p-5">
          <div className="relative">
            <Search
              size={16}
              className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[#8ea3a8]"
            />
            <Input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search integrations"
              className="h-12 border-white/10 bg-black/12 pl-10 text-white placeholder:text-[#7f9398] focus-visible:ring-[#DFAE56]"
            />
          </div>
        </section>

        {loading ? (
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {Array.from({ length: 6 }).map((_, index) => (
              <div
                key={index}
                className="rounded-[1.6rem] border border-white/10 bg-[rgba(49,66,71,0.78)] p-5"
              >
                <Skeleton className="h-12 w-12 rounded-[1.2rem] bg-white/10" />
                <Skeleton className="mt-6 h-5 w-28 bg-white/10" />
                <Skeleton className="mt-2 h-4 w-36 bg-white/10" />
                <Skeleton className="mt-8 h-4 w-full bg-white/10" />
              </div>
            ))}
          </div>
        ) : items.length === 0 ? (
          <div className="rounded-[1.6rem] border border-dashed border-[#c9d2d4] bg-white/72 p-8">
            <div className="max-w-xl space-y-3">
              <p className="text-xl font-medium text-[#223239]">
                No integrations match that search.
              </p>
              <p className="text-sm leading-7 text-[#5d7379]">
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
          <div className="rounded-[1.4rem] border border-[#c9d2d4] bg-white/72 p-5 text-sm leading-7 text-[#5d7379]">
            Connect flows happen on each integration’s detail page so the main
            catalog stays easy to browse instead of turning into a wall of
            settings.
          </div>
        )}
      </div>
    </div>
  )
}
