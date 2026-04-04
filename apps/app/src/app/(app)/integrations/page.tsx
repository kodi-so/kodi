'use client'

import Link from 'next/link'
import { useEffect, useMemo, useState } from 'react'
import { ArrowRight, Plus, Video } from 'lucide-react'
import { Alert, AlertDescription, Badge, Button, Skeleton } from '@kodi/ui'
import { useOrg } from '@/lib/org-context'
import { trpc } from '@/lib/trpc'
import { IntegrationCard } from './_components/integration-card'
import {
  formatAuthMode,
  formatSupportTier,
  getCatalogCardMeta,
  getCatalogCardNote,
  getStatusRank,
  getToolkitCatalogStatus,
  type ToolAccessCatalog,
  type ToolAccessItem,
} from './_lib/tool-access-ui'

function sortItems(items: ToolAccessItem[], catalog: ToolAccessCatalog | null) {
  return [...items].sort((left, right) => {
    const leftStatus = getToolkitCatalogStatus(left, catalog)
    const rightStatus = getToolkitCatalogStatus(right, catalog)
    const statusRank = getStatusRank(leftStatus) - getStatusRank(rightStatus)
    if (statusRank !== 0) return statusRank

    if (left.supportTier !== right.supportTier) {
      return left.supportTier === 'tier_1' ? -1 : 1
    }

    return left.name.localeCompare(right.name)
  })
}

export default function IntegrationsPage() {
  const { activeOrg } = useOrg()
  const [catalog, setCatalog] = useState<ToolAccessCatalog | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

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
          limit: 60,
        })

        if (cancelled) return
        setCatalog(result)
      } catch (nextError) {
        if (cancelled) return
        setError(
          nextError instanceof Error
            ? nextError.message
            : 'Failed to load integrations.'
        )
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    void load()
    return () => {
      cancelled = true
    }
  }, [activeOrg?.orgId])

  const activeItems = useMemo(() => {
    const items = catalog?.items ?? []
    return sortItems(
      items.filter(
        (item) => getToolkitCatalogStatus(item, catalog) === 'Connected'
      ),
      catalog
    )
  }, [catalog])

  const reviewItems = useMemo(() => {
    const items = catalog?.items ?? []
    return sortItems(
      items.filter((item) => {
        const status = getToolkitCatalogStatus(item, catalog)
        return status === 'Attention needed' || status === 'Connecting'
      }),
      catalog
    )
  }, [catalog])

  if (!activeOrg) {
    return (
      <div className="flex min-h-full items-center justify-center p-6">
        <Skeleton className="h-6 w-6 rounded-full bg-white/10" />
      </div>
    )
  }

  return (
    <div className="kodi-shell-bg min-h-full">
      <div className="mx-auto flex max-w-6xl flex-col gap-8 px-4 py-8">
        <section className="kodi-panel overflow-hidden rounded-[2rem] p-6 lg:p-8">
          <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
            <div className="max-w-3xl space-y-4">
              <div className="flex flex-wrap gap-2">
                <Badge className="border-white/12 bg-white/8 text-[#dce5e7]">
                  Integrations
                </Badge>
                <Badge className="border-[#6FA88C]/24 bg-[#6FA88C]/12 text-[#d6eadf]">
                  {catalog?.summary.activeCount ?? 0} active
                </Badge>
                {reviewItems.length > 0 && (
                  <Badge className="border-red-500/20 bg-red-500/10 text-red-200">
                    {reviewItems.length} need review
                  </Badge>
                )}
              </div>

              <div className="space-y-3">
                <p className="kodi-kicker">Connected execution</p>
                <h1 className="font-brand text-3xl tracking-[-0.05em] text-white sm:text-[2.7rem]">
                  Connect the tools Kodi can act through.
                </h1>
                <p className="max-w-2xl text-sm leading-7 text-[#c7d3d6]">
                  This is the single place to manage tool integrations. Active
                  accounts stay visible up front, and the full Composio catalog
                  is one click away when you need to add another.
                </p>
              </div>
            </div>

            <div className="flex flex-col gap-3 sm:flex-row">
              <Button
                asChild
                className="gap-2 bg-[#DFAE56] text-[#223239] hover:bg-[#e8bf70]"
              >
                <Link href="/integrations/add">
                  <Plus size={16} />
                  Add integrations
                </Link>
              </Button>
              <Button
                asChild
                variant="ghost"
                className="gap-2 border border-white/10 bg-black/12 text-[#dce5e7] hover:bg-white/10 hover:text-white"
              >
                <Link href="/meetings">
                  <Video size={16} />
                  Zoom lives in Meetings
                </Link>
              </Button>
            </div>
          </div>
        </section>

        {error && (
          <Alert className="border-red-500/30 bg-red-500/10 text-red-200">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {catalog && !catalog.setup.apiConfigured && (
          <Alert className="border-[#DFAE56]/30 bg-[#DFAE56]/12 text-[#f6d289]">
            <AlertDescription>
              Composio is not configured in this environment yet. Add the
              missing API values to make the tool catalog connectable.
            </AlertDescription>
          </Alert>
        )}

        {catalog && !catalog.featureFlags.toolAccess && (
          <Alert className="border-[#DFAE56]/30 bg-[#DFAE56]/12 text-[#f6d289]">
            <AlertDescription>
              Tool access is off in this environment right now, so the catalog
              stays browse-only until the feature flag is enabled.
            </AlertDescription>
          </Alert>
        )}

        {catalog?.syncError && (
          <Alert className="border-[#DFAE56]/30 bg-[#DFAE56]/12 text-[#f6d289]">
            <AlertDescription>{catalog.syncError}</AlertDescription>
          </Alert>
        )}

        <section className="space-y-4">
          <div className="flex items-end justify-between gap-4">
            <div>
              <h2 className="font-brand text-2xl tracking-[-0.05em] text-[#223239]">
                Active integrations
              </h2>
              <p className="mt-1 text-sm text-[#5d7379]">
                Open any integration to manage identities, connection health,
                and workspace defaults for {activeOrg.orgName}.
              </p>
            </div>
            <Button
              asChild
              variant="ghost"
              className="hidden gap-2 border border-[#c9d2d4] bg-white/82 text-[#223239] hover:bg-white sm:inline-flex"
            >
              <Link href="/integrations/add">
                Browse catalog
                <ArrowRight size={16} />
              </Link>
            </Button>
          </div>

          {loading ? (
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {Array.from({ length: 3 }).map((_, index) => (
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
          ) : activeItems.length === 0 ? (
            <div className="rounded-[1.6rem] border border-dashed border-[#c9d2d4] bg-white/72 p-8">
              <div className="max-w-xl space-y-3">
                <p className="text-xl font-medium text-[#223239]">
                  No active tool integrations yet.
                </p>
                <p className="text-sm leading-7 text-[#5d7379]">
                  Start with the tools your team relies on most. Once you link
                  an account, it will show up here as the clean list of what
                  Kodi can actually use.
                </p>
                <Button
                  asChild
                  className="mt-2 gap-2 bg-[#DFAE56] text-[#223239] hover:bg-[#e8bf70]"
                >
                  <Link href="/integrations/add">
                    <Plus size={16} />
                    Add first integration
                  </Link>
                </Button>
              </div>
            </div>
          ) : (
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {activeItems.map((item) => (
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
        </section>

        {reviewItems.length > 0 && (
          <section className="space-y-4">
            <div>
              <h2 className="font-brand text-xl tracking-[-0.05em] text-[#223239]">
                Needs review
              </h2>
              <p className="mt-1 text-sm text-[#5d7379]">
                These connections are on file, but they should be checked before
                you rely on them in chat or meetings.
              </p>
            </div>

            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {reviewItems.map((item) => (
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
                />
              ))}
            </div>
          </section>
        )}
      </div>
    </div>
  )
}
