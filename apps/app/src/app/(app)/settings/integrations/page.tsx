'use client'

import Link from 'next/link'
import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import {
  ArrowRight,
  CalendarDays,
  CheckCircle2,
  FolderOpen,
  Link2,
  Mail,
  RefreshCcw,
  Video,
} from 'lucide-react'
import {
  Alert,
  AlertDescription,
  Badge,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Skeleton,
} from '@kodi/ui'
import { useOrg } from '@/lib/org-context'
import { trpc } from '@/lib/trpc'
import { SettingsLayout } from '../_components/settings-layout'

type ZoomInstallStatus = Awaited<
  ReturnType<typeof trpc.zoom.getInstallStatus.query>
>

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

function statusTone(status: string) {
  switch (status) {
    case 'active':
      return 'border-emerald-500/20 bg-emerald-500/12 text-emerald-300'
    case 'pending':
      return 'border-amber-500/20 bg-amber-500/12 text-amber-200'
    case 'revoked':
    case 'error':
      return 'border-red-500/20 bg-red-500/12 text-red-200'
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
  const missingZoomSetup = installStatus?.setup.missing ?? []
  const isOwner = activeOrg?.role === 'owner'

  const callbackBanner = useMemo(() => {
    if (callbackStatus === 'connected') {
      return {
        tone: 'success' as const,
        message:
          'Zoom is connected for this workspace. Meeting events can now start flowing into Kodi.',
      }
    }

    if (callbackStatus === 'error') {
      return {
        tone: 'error' as const,
        message:
          'Zoom connection did not complete. Check the app configuration and try again.',
      }
    }

    return null
  }, [callbackStatus])

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

  return (
    <SettingsLayout>
      <div className="mx-auto max-w-5xl space-y-8">
        <section className="overflow-hidden rounded-[2rem] border border-zinc-800/80 bg-[linear-gradient(135deg,rgba(24,24,27,0.96),rgba(12,12,16,0.98))]">
          <div className="grid gap-8 px-6 py-7 lg:grid-cols-[1.3fr_0.7fr] lg:px-8">
            <div className="space-y-4">
              <Badge className="w-fit border-zinc-700 bg-zinc-900 text-zinc-200">
                Workspace integrations
              </Badge>
              <div className="space-y-2">
                <h1 className="text-2xl font-semibold tracking-tight text-white">
                  Connect the systems Kodi works across
                </h1>
                <p className="max-w-2xl text-sm leading-6 text-zinc-400">
                  Manage meeting platforms and workspace tools in one place so
                  Kodi can listen, retrieve context, and turn follow-through
                  into action.
                </p>
              </div>
            </div>

            <div className="grid gap-3 text-sm sm:grid-cols-3 lg:grid-cols-1">
              <div className="rounded-2xl border border-zinc-800 bg-zinc-950/60 p-4">
                <p className="text-[11px] uppercase tracking-[0.18em] text-zinc-500">
                  Zoom
                </p>
                <p className="mt-2 text-sm text-white">
                  {installation ? 'Connected' : 'Not connected'}
                </p>
              </div>
              <div className="rounded-2xl border border-zinc-800 bg-zinc-950/60 p-4">
                <p className="text-[11px] uppercase tracking-[0.18em] text-zinc-500">
                  Google
                </p>
                <p className="mt-2 text-sm text-white">Planned next</p>
              </div>
              <div className="rounded-2xl border border-zinc-800 bg-zinc-950/60 p-4">
                <p className="text-[11px] uppercase tracking-[0.18em] text-zinc-500">
                  Meetings
                </p>
                <Link
                  href="/meetings"
                  className="mt-2 inline-flex items-center gap-1 text-sm text-zinc-200 transition hover:text-white"
                >
                  Open meeting console
                  <ArrowRight size={14} />
                </Link>
              </div>
            </div>
          </div>
        </section>

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

        {loading ? (
          <div className="grid gap-6 xl:grid-cols-[1.2fr_0.8fr]">
            <Card className="border-zinc-800 bg-zinc-900/60">
              <CardContent className="space-y-3 p-6">
                <Skeleton className="h-6 w-40 bg-zinc-800" />
                <Skeleton className="h-28 bg-zinc-800" />
                <Skeleton className="h-10 w-44 bg-zinc-800" />
              </CardContent>
            </Card>
            <Card className="border-zinc-800 bg-zinc-900/60">
              <CardContent className="space-y-3 p-6">
                <Skeleton className="h-6 w-32 bg-zinc-800" />
                <Skeleton className="h-36 bg-zinc-800" />
              </CardContent>
            </Card>
          </div>
        ) : (
          <div className="grid gap-6 xl:grid-cols-[1.2fr_0.8fr]">
            <Card className="border-zinc-800 bg-zinc-900/60">
              <CardHeader className="gap-4">
                <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                  <div className="flex items-start gap-4">
                    <div className="flex h-11 w-11 items-center justify-center rounded-2xl border border-sky-500/20 bg-sky-500/10 text-sky-300">
                      <Video size={20} />
                    </div>
                    <div className="space-y-1">
                      <CardTitle className="text-xl text-white">Zoom</CardTitle>
                      <CardDescription className="max-w-xl text-zinc-400">
                        Workspace-level meeting connection for installs,
                        webhooks, and live meeting ingestion.
                      </CardDescription>
                    </div>
                  </div>

                  <div className="flex flex-wrap gap-2">
                    <Button
                      onClick={() => void refresh()}
                      variant="ghost"
                      className="gap-2 border border-zinc-800 bg-zinc-900 text-zinc-300 hover:bg-zinc-800 hover:text-white"
                      disabled={action !== null}
                    >
                      <RefreshCcw
                        size={16}
                        className={action === 'refresh' ? 'animate-spin' : ''}
                      />
                      Refresh
                    </Button>
                    {isOwner && !installation && (
                      <Button
                        onClick={() => void connectZoom()}
                        className="gap-2 bg-sky-500 text-white hover:bg-sky-400"
                        disabled={
                          action !== null || !installStatus?.setup.configured
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
                        className="gap-2 border-red-500/30 bg-red-500/10 text-red-200 hover:bg-red-500/20 hover:text-red-100"
                        disabled={action !== null}
                      >
                        Disconnect
                      </Button>
                    )}
                  </div>
                </div>
              </CardHeader>

              <CardContent className="space-y-5">
                <div className="flex flex-wrap gap-2">
                  <Badge
                    className={
                      installStatus?.featureFlags.zoomCopilot
                        ? 'border-emerald-500/20 bg-emerald-500/12 text-emerald-300'
                        : 'border-zinc-700 bg-zinc-900 text-zinc-300'
                    }
                  >
                    {installStatus?.featureFlags.zoomCopilot
                      ? 'Feature enabled'
                      : 'Feature disabled'}
                  </Badge>
                  <Badge
                    className={
                      installStatus?.setup.configured
                        ? 'border-emerald-500/20 bg-emerald-500/12 text-emerald-300'
                        : 'border-amber-500/20 bg-amber-500/12 text-amber-200'
                    }
                  >
                    {installStatus?.setup.configured
                      ? 'App configured'
                      : 'Setup incomplete'}
                  </Badge>
                  {installation && (
                    <Badge className={statusTone(installation.status)}>
                      {installation.status}
                    </Badge>
                  )}
                </div>

                {!installStatus?.featureFlags.zoomCopilot && (
                  <Alert className="border-zinc-700 bg-zinc-950/70 text-zinc-300">
                    <AlertDescription>
                      Enable{' '}
                      <code className="rounded bg-zinc-800 px-1 py-0.5">
                        KODI_FEATURE_ZOOM_COPILOT
                      </code>{' '}
                      before trying the live integration.
                    </AlertDescription>
                  </Alert>
                )}

                {missingZoomSetup.length > 0 && (
                  <Alert className="border-amber-500/30 bg-amber-500/10 text-amber-100">
                    <AlertDescription>
                      Missing Zoom env vars: {missingZoomSetup.join(', ')}
                    </AlertDescription>
                  </Alert>
                )}

                <div className="grid gap-3 md:grid-cols-2">
                  <div className="rounded-2xl border border-zinc-800 bg-zinc-950/60 p-4">
                    <p className="text-[11px] uppercase tracking-[0.18em] text-zinc-500">
                      Redirect URI
                    </p>
                    <p className="mt-2 break-all text-sm text-zinc-200">
                      {installStatus?.setup.redirectUri ?? 'Not configured'}
                    </p>
                  </div>
                  <div className="rounded-2xl border border-zinc-800 bg-zinc-950/60 p-4">
                    <p className="text-[11px] uppercase tracking-[0.18em] text-zinc-500">
                      Zoom app ID
                    </p>
                    <p className="mt-2 text-sm text-zinc-200">
                      {installStatus?.setup.appId ?? 'Not configured'}
                    </p>
                  </div>
                </div>

                {installation ? (
                  <div className="rounded-3xl border border-zinc-800 bg-zinc-950/70 p-5">
                    <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                      <div>
                        <p className="text-sm font-medium text-white">
                          {installation.externalAccountEmail ??
                            'Connected Zoom account'}
                        </p>
                        <p className="mt-1 text-xs text-zinc-500">
                          Updated {formatDate(installation.updatedAt)}
                        </p>
                      </div>
                      <div className="inline-flex items-center gap-2 rounded-full border border-emerald-500/20 bg-emerald-500/10 px-3 py-1 text-xs text-emerald-200">
                        <CheckCircle2 size={14} />
                        Live install ready
                      </div>
                    </div>

                    {(installation.scopes ?? []).length > 0 && (
                      <div className="mt-4 flex flex-wrap gap-2">
                        {(installation.scopes ?? [])
                          .slice(0, 6)
                          .map((scope) => (
                            <Badge
                              key={scope}
                              className="border-zinc-700 bg-zinc-900 text-zinc-300"
                            >
                              {scope}
                            </Badge>
                          ))}
                      </div>
                    )}

                    {installation.errorMessage && (
                      <p className="mt-4 text-sm text-red-300">
                        {installation.errorMessage}
                      </p>
                    )}
                  </div>
                ) : (
                  <div className="rounded-3xl border border-dashed border-zinc-800 bg-zinc-950/50 p-5 text-sm text-zinc-400">
                    {isOwner
                      ? 'No Zoom installation has been connected yet for this workspace.'
                      : 'An owner needs to connect Zoom before meeting ingestion can start.'}
                  </div>
                )}
              </CardContent>
            </Card>

            <div className="space-y-6">
              <Card className="border-zinc-800 bg-zinc-900/60">
                <CardHeader className="gap-4">
                  <div className="flex items-start gap-4">
                    <div className="flex h-11 w-11 items-center justify-center rounded-2xl border border-amber-500/20 bg-amber-500/10 text-amber-200">
                      <Mail size={20} />
                    </div>
                    <div className="space-y-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <CardTitle className="text-xl text-white">
                          Google Workspace
                        </CardTitle>
                        <Badge className="border-amber-500/20 bg-amber-500/12 text-amber-200">
                          Planned next
                        </Badge>
                      </div>
                      <CardDescription className="text-zinc-400">
                        One connection for Gmail, Calendar, and Drive so Kodi
                        can retrieve workspace context before it starts taking
                        action.
                      </CardDescription>
                    </div>
                  </div>
                </CardHeader>

                <CardContent className="space-y-4">
                  <div className="rounded-3xl border border-zinc-800 bg-zinc-950/60 p-5">
                    <p className="text-sm text-zinc-300">
                      Start with read-only access for retrieval and meeting
                      context, then layer write actions on later behind
                      approvals.
                    </p>
                    <div className="mt-4 grid gap-3">
                      <div className="flex items-center justify-between rounded-2xl border border-zinc-800 bg-zinc-950/80 px-4 py-3">
                        <div className="flex items-center gap-3">
                          <Mail size={16} className="text-zinc-400" />
                          <span className="text-sm text-zinc-200">Gmail</span>
                        </div>
                        <span className="text-xs text-zinc-500">
                          Context and thread retrieval
                        </span>
                      </div>
                      <div className="flex items-center justify-between rounded-2xl border border-zinc-800 bg-zinc-950/80 px-4 py-3">
                        <div className="flex items-center gap-3">
                          <CalendarDays size={16} className="text-zinc-400" />
                          <span className="text-sm text-zinc-200">
                            Calendar
                          </span>
                        </div>
                        <span className="text-xs text-zinc-500">
                          Meeting prep and scheduling context
                        </span>
                      </div>
                      <div className="flex items-center justify-between rounded-2xl border border-zinc-800 bg-zinc-950/80 px-4 py-3">
                        <div className="flex items-center gap-3">
                          <FolderOpen size={16} className="text-zinc-400" />
                          <span className="text-sm text-zinc-200">Drive</span>
                        </div>
                        <span className="text-xs text-zinc-500">
                          Docs and file retrieval
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="rounded-3xl border border-dashed border-zinc-800 bg-zinc-950/50 p-5 text-sm text-zinc-400">
                    This connection will live beside Zoom in Integrations, while
                    a future Google Meet install should stay separate as its own
                    meeting provider.
                  </div>
                </CardContent>
              </Card>

              <Card className="border-zinc-800 bg-zinc-900/60">
                <CardHeader>
                  <CardTitle className="text-lg text-white">
                    Zoom prerequisites
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3 text-sm text-zinc-400">
                  {(installStatus?.setup.prerequisites ?? []).map((item) => (
                    <div
                      key={item}
                      className="rounded-2xl border border-zinc-800 bg-zinc-950/50 p-4"
                    >
                      {item}
                    </div>
                  ))}
                </CardContent>
              </Card>
            </div>
          </div>
        )}
      </div>
    </SettingsLayout>
  )
}
