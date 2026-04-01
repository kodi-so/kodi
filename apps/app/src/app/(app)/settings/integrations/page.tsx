'use client'

import Link from 'next/link'
import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { ArrowRight, Search } from 'lucide-react'
import { Alert, AlertDescription, Badge, Input, Skeleton } from '@kodi/ui'
import { useOrg } from '@/lib/org-context'
import { trpc } from '@/lib/trpc'
import { SettingsLayout } from '../_components/settings-layout'
import {
  getIntegrationStatusTone,
  getToolAccessCardStatus,
  getZoomCardStatus,
  integrationCards,
  type ToolAccessStatus,
  type ZoomInstallStatus,
} from './_lib/integrations'

export default function IntegrationsSettingsPage() {
  const searchParams = useSearchParams()
  const { orgs, activeOrg, setActiveOrg } = useOrg()
  const [installStatus, setInstallStatus] = useState<ZoomInstallStatus | null>(
    null
  )
  const [toolAccessStatus, setToolAccessStatus] =
    useState<ToolAccessStatus | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [search, setSearch] = useState('')

  const callbackOrgId = searchParams.get('org')
  const callbackStatus = searchParams.get('zoom')

  useEffect(() => {
    if (!callbackOrgId) return
    const matchingOrg = orgs.find((org) => org.orgId === callbackOrgId)
    if (matchingOrg && matchingOrg.orgId !== activeOrg?.orgId) {
      setActiveOrg(matchingOrg)
    }
  }, [activeOrg?.orgId, callbackOrgId, orgs, setActiveOrg])

  useEffect(() => {
    if (!activeOrg) {
      setInstallStatus(null)
      setToolAccessStatus(null)
      setLoading(false)
      return
    }

    const orgId = activeOrg.orgId
    let cancelled = false
    setLoading(true)
    setError(null)

    async function load() {
      try {
        const [zoomStatus, nextToolAccessStatus] = await Promise.all([
          trpc.zoom.getInstallStatus.query({ orgId }),
          trpc.toolAccess.getStatus.query({ orgId }),
        ])

        if (cancelled) return
        setInstallStatus(zoomStatus)
        setToolAccessStatus(nextToolAccessStatus)
      } catch (err) {
        if (cancelled) return
        setError(
          err instanceof Error ? err.message : 'Failed to load integrations.'
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

  const callbackBanner = useMemo(() => {
    if (callbackStatus === 'connected') {
      return {
        tone: 'success' as const,
        message: 'Zoom connected. You can manage it from its detail page now.',
      }
    }

    if (callbackStatus === 'error') {
      return {
        tone: 'error' as const,
        message:
          'Zoom connection did not finish. Try again from the Zoom page.',
      }
    }

    return null
  }, [callbackStatus])

  const cards = useMemo(() => {
    return integrationCards.map((integration) => ({
      ...integration,
      status:
        integration.id === 'zoom'
          ? getZoomCardStatus(installStatus)
          : integration.id === 'tool-access'
            ? getToolAccessCardStatus(toolAccessStatus)
            : 'Coming next',
    }))
  }, [installStatus, toolAccessStatus])

  const filteredCards = useMemo(() => {
    const query = search.trim().toLowerCase()
    if (!query) return cards

    return cards.filter((integration) => {
      return (
        integration.name.toLowerCase().includes(query) ||
        integration.description.toLowerCase().includes(query) ||
        integration.searchText.includes(query)
      )
    })
  }, [cards, search])

  if (!activeOrg) {
    return (
      <SettingsLayout>
        <div className="flex items-center justify-center py-20">
          <Skeleton className="h-6 w-6 rounded-full bg-zinc-700" />
        </div>
      </SettingsLayout>
    )
  }

  return (
    <SettingsLayout>
      <div className="mx-auto max-w-5xl space-y-6">
        <div className="space-y-2">
          <h1 className="text-2xl font-semibold tracking-tight text-white">
            Integrations
          </h1>
          <p className="text-sm text-zinc-400">
            Choose a tool to view its setup, status, and connection options for{' '}
            {activeOrg.orgName}.
          </p>
        </div>

        {callbackBanner && (
          <Alert
            className={
              callbackBanner.tone === 'success'
                ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-200'
                : 'border-red-500/30 bg-red-500/10 text-red-200'
            }
          >
            <AlertDescription>{callbackBanner.message}</AlertDescription>
          </Alert>
        )}

        {error && (
          <Alert className="border-red-500/30 bg-red-500/10 text-red-200">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        <div className="rounded-2xl border border-zinc-800 bg-zinc-950/70 p-3">
          <div className="relative">
            <Search
              size={16}
              className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500"
            />
            <Input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search integrations"
              className="h-11 border-zinc-800 bg-zinc-900 pl-10 text-white placeholder:text-zinc-500 focus-visible:ring-sky-500"
            />
          </div>
        </div>

        {loading ? (
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {[0, 1].map((item) => (
              <div
                key={item}
                className="aspect-square rounded-3xl border border-zinc-800 bg-zinc-900/60 p-5"
              >
                <Skeleton className="h-10 w-10 rounded-2xl bg-zinc-800" />
                <Skeleton className="mt-8 h-6 w-28 bg-zinc-800" />
                <Skeleton className="mt-3 h-4 w-40 bg-zinc-800" />
                <Skeleton className="mt-2 h-4 w-32 bg-zinc-800" />
              </div>
            ))}
          </div>
        ) : filteredCards.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-zinc-800 bg-zinc-950/50 p-6 text-sm text-zinc-400">
            No integrations match “{search}”.
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {filteredCards.map((integration) => {
              const Icon = integration.icon

              return (
                <Link
                  key={integration.id}
                  href={integration.href}
                  className="group aspect-square rounded-[1.75rem] border border-zinc-800 bg-[linear-gradient(180deg,rgba(24,24,27,0.96),rgba(16,16,20,0.98))] p-5 transition hover:-translate-y-0.5 hover:border-zinc-700 hover:bg-zinc-900"
                >
                  <div className="flex h-full flex-col justify-between">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex h-11 w-11 items-center justify-center rounded-2xl border border-zinc-800 bg-zinc-950 text-zinc-200">
                        <Icon size={20} />
                      </div>
                      <Badge
                        className={getIntegrationStatusTone(integration.status)}
                      >
                        {integration.status}
                      </Badge>
                    </div>

                    <div className="space-y-3">
                      <div>
                        <h2 className="text-lg font-medium text-white">
                          {integration.name}
                        </h2>
                        <p className="mt-2 max-w-[22ch] text-sm leading-6 text-zinc-400">
                          {integration.description}
                        </p>
                      </div>

                      <div className="flex items-center justify-between text-sm text-zinc-500 transition group-hover:text-zinc-200">
                        <span>Open integration</span>
                        <ArrowRight
                          size={16}
                          className="transition group-hover:translate-x-0.5"
                        />
                      </div>
                    </div>
                  </div>
                </Link>
              )
            })}
          </div>
        )}
      </div>
    </SettingsLayout>
  )
}
