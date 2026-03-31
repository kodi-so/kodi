'use client'

import Link from 'next/link'
import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import {
  ArrowRight,
  CalendarDays,
  FolderOpen,
  Link2,
  Mail,
  RefreshCcw,
  Search,
  Video,
} from 'lucide-react'
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
import { SettingsLayout } from '../_components/settings-layout'

type ZoomInstallStatus = Awaited<
  ReturnType<typeof trpc.zoom.getInstallStatus.query>
>

type IntegrationId = 'zoom' | 'google-workspace'

function formatDate(value: Date | string | null | undefined) {
  if (!value) return 'Not available'
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return 'Not available'
  return parsed.toLocaleString([], {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
}

function integrationStatusLabel(installStatus: ZoomInstallStatus | null) {
  const installation = installStatus?.installation ?? null

  if (installation?.status === 'active') return 'Connected'
  if (!installStatus?.featureFlags.zoomCopilot) return 'Feature off'
  if (!installStatus?.setup.configured) return 'Needs setup'
  if (installation?.status === 'error') return 'Attention needed'
  return 'Not connected'
}

function integrationStatusTone(label: string) {
  switch (label) {
    case 'Connected':
      return 'border-emerald-500/20 bg-emerald-500/10 text-emerald-300'
    case 'Needs setup':
    case 'Coming next':
      return 'border-amber-500/20 bg-amber-500/10 text-amber-200'
    case 'Attention needed':
      return 'border-red-500/20 bg-red-500/10 text-red-200'
    default:
      return 'border-zinc-700 bg-zinc-900 text-zinc-300'
  }
}

export default function IntegrationsSettingsPage() {
  const searchParams = useSearchParams()
  const { orgs, activeOrg, setActiveOrg } = useOrg()
  const [installStatus, setInstallStatus] = useState<ZoomInstallStatus | null>(
    null
  )
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [selectedIntegration, setSelectedIntegration] =
    useState<IntegrationId>('zoom')
  const [showZoomSetupDetails, setShowZoomSetupDetails] = useState(false)
  const [action, setAction] = useState<
    'connect' | 'disconnect' | 'refresh' | null
  >(null)

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
      setLoading(false)
      return
    }

    const orgId = activeOrg.orgId
    let cancelled = false
    setLoading(true)
    setError(null)

    async function load() {
      try {
        const status = await trpc.zoom.getInstallStatus.query({ orgId })

        if (cancelled) return
        setInstallStatus(status)
      } catch (err) {
        if (cancelled) return
        setError(
          err instanceof Error
            ? err.message
            : 'Failed to load integration settings.'
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

  const installation = installStatus?.installation ?? null
  const isOwner = activeOrg?.role === 'owner'
  const missingZoomSetup = installStatus?.setup.missing ?? []

  const callbackBanner = useMemo(() => {
    if (callbackStatus === 'connected') {
      return {
        tone: 'success' as const,
        message: 'Zoom connected. Kodi can now start using meeting events.',
      }
    }

    if (callbackStatus === 'error') {
      return {
        tone: 'error' as const,
        message:
          'Zoom connection did not finish. Try again from the Zoom card.',
      }
    }

    return null
  }, [callbackStatus])

  const integrations = useMemo(
    () => [
      {
        id: 'zoom' as const,
        name: 'Zoom',
        description: 'Connect Zoom so Kodi can join meeting workflows.',
        searchText: 'zoom meetings conference rtms transcript',
        status: integrationStatusLabel(installStatus),
        icon: Video,
      },
      {
        id: 'google-workspace' as const,
        name: 'Google Workspace',
        description: 'Connect Gmail, Calendar, and Drive in one place.',
        searchText: 'google gmail calendar drive workspace',
        status: 'Coming next',
        icon: Mail,
      },
    ],
    [installStatus]
  )

  const filteredIntegrations = useMemo(() => {
    const query = search.trim().toLowerCase()
    if (!query) return integrations

    return integrations.filter((integration) => {
      return (
        integration.name.toLowerCase().includes(query) ||
        integration.description.toLowerCase().includes(query) ||
        integration.searchText.includes(query)
      )
    })
  }, [integrations, search])

  useEffect(() => {
    if (
      filteredIntegrations.some(
        (integration) => integration.id === selectedIntegration
      )
    ) {
      return
    }

    const next = filteredIntegrations[0]?.id
    if (next) setSelectedIntegration(next)
  }, [filteredIntegrations, selectedIntegration])

  async function refresh() {
    if (!activeOrg) return
    setAction('refresh')
    try {
      const status = await trpc.zoom.getInstallStatus.query({
        orgId: activeOrg.orgId,
      })
      setInstallStatus(status)
      setError(null)
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'Failed to refresh integration settings.'
      )
    } finally {
      setAction(null)
    }
  }

  async function connectZoom() {
    if (!activeOrg) return
    setAction('connect')
    try {
      const result = await trpc.zoom.getInstallUrl.mutate({
        orgId: activeOrg.orgId,
      })
      window.location.assign(result.url)
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'Failed to start Zoom install flow.'
      )
      setAction(null)
    }
  }

  async function disconnectZoom() {
    if (!activeOrg) return
    setAction('disconnect')
    try {
      await trpc.zoom.disconnect.mutate({ orgId: activeOrg.orgId })
      await refresh()
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Failed to disconnect Zoom.'
      )
      setAction(null)
    }
  }

  if (!activeOrg) {
    return (
      <SettingsLayout>
        <div className="flex items-center justify-center py-20">
          <Skeleton className="h-6 w-6 rounded-full bg-zinc-700" />
        </div>
      </SettingsLayout>
    )
  }

  const selected = integrations.find(
    (integration) => integration.id === selectedIntegration
  )

  return (
    <SettingsLayout>
      <div className="mx-auto max-w-4xl space-y-6">
        <div className="space-y-2">
          <h1 className="text-2xl font-semibold tracking-tight text-white">
            Integrations
          </h1>
          <p className="text-sm text-zinc-400">
            Connect the tools Kodi should use for {activeOrg.orgName}.
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
          <div className="space-y-3">
            <div className="rounded-2xl border border-zinc-800 bg-zinc-900/60 p-5">
              <Skeleton className="h-5 w-28 bg-zinc-800" />
              <Skeleton className="mt-3 h-4 w-64 bg-zinc-800" />
            </div>
            <div className="rounded-2xl border border-zinc-800 bg-zinc-900/60 p-5">
              <Skeleton className="h-5 w-40 bg-zinc-800" />
              <Skeleton className="mt-3 h-4 w-56 bg-zinc-800" />
            </div>
          </div>
        ) : filteredIntegrations.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-zinc-800 bg-zinc-950/50 p-6 text-sm text-zinc-400">
            No integrations match “{search}”.
          </div>
        ) : (
          <div className="space-y-3">
            {filteredIntegrations.map((integration) => {
              const Icon = integration.icon
              const isSelected = integration.id === selected?.id

              return (
                <div
                  key={integration.id}
                  className="overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-900/60"
                >
                  <button
                    type="button"
                    onClick={() => setSelectedIntegration(integration.id)}
                    className="flex w-full items-center justify-between gap-4 px-5 py-4 text-left transition hover:bg-zinc-900"
                  >
                    <div className="flex min-w-0 items-start gap-4">
                      <div className="mt-0.5 flex h-10 w-10 items-center justify-center rounded-xl border border-zinc-800 bg-zinc-950 text-zinc-300">
                        <Icon size={18} />
                      </div>
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="text-sm font-medium text-white">
                            {integration.name}
                          </p>
                          <Badge
                            className={integrationStatusTone(
                              integration.status
                            )}
                          >
                            {integration.status}
                          </Badge>
                        </div>
                        <p className="mt-1 text-sm text-zinc-400">
                          {integration.description}
                        </p>
                      </div>
                    </div>

                    <span className="text-sm text-zinc-500">
                      {isSelected ? 'Hide' : 'View'}
                    </span>
                  </button>

                  {isSelected && integration.id === 'zoom' && (
                    <div className="border-t border-zinc-800 px-5 py-5">
                      <div className="space-y-5">
                        <div className="space-y-2">
                          <p className="text-sm font-medium text-white">
                            {installation
                              ? 'Zoom is connected for this workspace.'
                              : 'Connect Zoom to start using meeting events in Kodi.'}
                          </p>
                          <p className="text-sm text-zinc-400">
                            {installation
                              ? installation.externalAccountEmail
                                ? `Connected account: ${installation.externalAccountEmail}`
                                : 'A Zoom account is already connected.'
                              : isOwner
                                ? 'Once connected, Kodi can start following Zoom meeting activity.'
                                : 'A workspace owner needs to connect Zoom.'}
                          </p>
                          {installation && (
                            <p className="text-xs text-zinc-500">
                              Last updated {formatDate(installation.updatedAt)}
                            </p>
                          )}
                        </div>

                        <div className="flex flex-wrap gap-2">
                          <Button
                            onClick={() => void refresh()}
                            variant="ghost"
                            className="gap-2 border border-zinc-800 bg-zinc-950 text-zinc-300 hover:bg-zinc-900 hover:text-white"
                            disabled={action !== null}
                          >
                            <RefreshCcw
                              size={16}
                              className={
                                action === 'refresh' ? 'animate-spin' : ''
                              }
                            />
                            Refresh
                          </Button>

                          {isOwner && !installation && (
                            <Button
                              onClick={() => void connectZoom()}
                              className="gap-2 bg-sky-500 text-white hover:bg-sky-400"
                              disabled={
                                action !== null ||
                                !installStatus?.setup.configured
                              }
                            >
                              <Link2 size={16} />
                              Connect Zoom
                            </Button>
                          )}

                          {isOwner && installation && (
                            <Button
                              onClick={() => void disconnectZoom()}
                              variant="outline"
                              className="border-red-500/30 bg-red-500/10 text-red-200 hover:bg-red-500/20 hover:text-red-100"
                              disabled={action !== null}
                            >
                              Disconnect
                            </Button>
                          )}

                          <Button
                            asChild
                            variant="ghost"
                            className="gap-2 border border-zinc-800 bg-zinc-950 text-zinc-300 hover:bg-zinc-900 hover:text-white"
                          >
                            <Link href="/meetings">
                              Open meetings
                              <ArrowRight size={16} />
                            </Link>
                          </Button>
                        </div>

                        <div className="space-y-3">
                          <button
                            type="button"
                            onClick={() =>
                              setShowZoomSetupDetails((current) => !current)
                            }
                            className="text-sm text-zinc-400 transition hover:text-white"
                          >
                            {showZoomSetupDetails
                              ? 'Hide setup details'
                              : 'Show setup details'}
                          </button>

                          {showZoomSetupDetails && (
                            <div className="space-y-3 rounded-2xl border border-zinc-800 bg-zinc-950/70 p-4">
                              {!installStatus?.featureFlags.zoomCopilot && (
                                <div className="text-sm text-zinc-300">
                                  Zoom is available in the UI, but the feature
                                  flag is off.
                                </div>
                              )}

                              {missingZoomSetup.length > 0 && (
                                <div className="text-sm text-zinc-300">
                                  Missing setup: {missingZoomSetup.join(', ')}
                                </div>
                              )}

                              <div className="space-y-1 text-sm text-zinc-400">
                                <p>
                                  Redirect URI:{' '}
                                  <span className="text-zinc-200">
                                    {installStatus?.setup.redirectUri ??
                                      'Not configured'}
                                  </span>
                                </p>
                                <p>
                                  App ID:{' '}
                                  <span className="text-zinc-200">
                                    {installStatus?.setup.appId ??
                                      'Not configured'}
                                  </span>
                                </p>
                              </div>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  )}

                  {isSelected && integration.id === 'google-workspace' && (
                    <div className="border-t border-zinc-800 px-5 py-5">
                      <div className="space-y-4">
                        <p className="text-sm text-zinc-300">
                          Google Workspace is the next integration planned for
                          this page. It will connect Gmail, Calendar, and Drive
                          through one simple workspace connection.
                        </p>

                        <div className="grid gap-3 sm:grid-cols-3">
                          <div className="rounded-xl border border-zinc-800 bg-zinc-950/70 p-4">
                            <div className="flex items-center gap-2 text-sm text-white">
                              <Mail size={16} className="text-zinc-400" />
                              Gmail
                            </div>
                            <p className="mt-2 text-sm text-zinc-400">
                              Read thread and inbox context.
                            </p>
                          </div>
                          <div className="rounded-xl border border-zinc-800 bg-zinc-950/70 p-4">
                            <div className="flex items-center gap-2 text-sm text-white">
                              <CalendarDays
                                size={16}
                                className="text-zinc-400"
                              />
                              Calendar
                            </div>
                            <p className="mt-2 text-sm text-zinc-400">
                              Pull meeting and schedule context.
                            </p>
                          </div>
                          <div className="rounded-xl border border-zinc-800 bg-zinc-950/70 p-4">
                            <div className="flex items-center gap-2 text-sm text-white">
                              <FolderOpen size={16} className="text-zinc-400" />
                              Drive
                            </div>
                            <p className="mt-2 text-sm text-zinc-400">
                              Retrieve docs and file context.
                            </p>
                          </div>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>
    </SettingsLayout>
  )
}
