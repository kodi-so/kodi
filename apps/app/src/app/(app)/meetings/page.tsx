'use client'

import Link from 'next/link'
import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { AlertCircle, ArrowRight, CheckCircle2, Link2, RefreshCcw, Video } from 'lucide-react'
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

type ZoomInstallStatus = Awaited<ReturnType<typeof trpc.zoom.getInstallStatus.query>>
type MeetingListItem = Awaited<ReturnType<typeof trpc.meeting.list.query>>

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
    case 'live':
      return 'border-emerald-500/30 bg-emerald-500/15 text-emerald-300'
    case 'joining':
    case 'pending':
    case 'scheduled':
      return 'border-amber-500/30 bg-amber-500/15 text-amber-200'
    case 'completed':
      return 'border-sky-500/30 bg-sky-500/15 text-sky-200'
    case 'revoked':
    case 'failed':
    case 'error':
      return 'border-red-500/30 bg-red-500/15 text-red-200'
    default:
      return 'border-zinc-700 bg-zinc-800/80 text-zinc-300'
  }
}

export default function MeetingsPage() {
  const searchParams = useSearchParams()
  const { orgs, activeOrg, setActiveOrg } = useOrg()
  const [installStatus, setInstallStatus] = useState<ZoomInstallStatus | null>(null)
  const [meetings, setMeetings] = useState<MeetingListItem>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [action, setAction] = useState<'connect' | 'disconnect' | 'refresh' | null>(null)

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
      setMeetings([])
      setLoading(false)
      return
    }

    const orgId = activeOrg.orgId
    let cancelled = false
    setLoading(true)
    setError(null)

    async function load() {
      try {
        const [status, meetingItems] = await Promise.all([
          trpc.zoom.getInstallStatus.query({ orgId }),
          trpc.meeting.list.query({ orgId, limit: 20 }),
        ])

        if (cancelled) return
        setInstallStatus(status)
        setMeetings(meetingItems)
      } catch (err) {
        if (cancelled) return
        setError(
          err instanceof Error ? err.message : 'Failed to load Zoom copilot state.'
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

  const missingZoomSetup = installStatus?.setup.missing ?? []
  const isOwner = activeOrg?.role === 'owner'
  const installation = installStatus?.installation ?? null

  const callbackBanner = useMemo(() => {
    if (callbackStatus === 'connected') {
      return {
        tone: 'success' as const,
        message: 'Zoom is connected for this workspace. Kodi can now attach meeting activity as events start flowing in.',
      }
    }

    if (callbackStatus === 'error') {
      return {
        tone: 'error' as const,
        message: 'Zoom connection did not complete. Check the Zoom app setup and try again.',
      }
    }

    return null
  }, [callbackStatus])

  async function refresh() {
    if (!activeOrg) return
    const orgId = activeOrg.orgId
    setAction('refresh')
    try {
      const [status, meetingItems] = await Promise.all([
        trpc.zoom.getInstallStatus.query({ orgId }),
        trpc.meeting.list.query({ orgId, limit: 20 }),
      ])
      setInstallStatus(status)
      setMeetings(meetingItems)
      setError(null)
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Failed to refresh Zoom copilot state.'
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
        err instanceof Error ? err.message : 'Failed to start Zoom install flow.'
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
      <div className="flex min-h-full items-center justify-center p-6 text-sm text-zinc-500">
        Select a workspace to set up the Zoom copilot.
      </div>
    )
  }

  return (
    <div className="min-h-full bg-[radial-gradient(circle_at_top,_rgba(99,102,241,0.18),_transparent_42%),linear-gradient(180deg,_rgba(24,24,27,0.35),_rgba(10,10,15,0.9))]">
      <div className="mx-auto flex max-w-6xl flex-col gap-6 px-4 py-8">
        <div className="flex flex-col gap-4 rounded-3xl border border-zinc-800 bg-zinc-950/75 p-6 shadow-2xl shadow-black/20 lg:flex-row lg:items-end lg:justify-between">
          <div className="space-y-3">
            <Badge className="w-fit border-sky-500/30 bg-sky-500/15 text-sky-200">
              Phase 1: Install and ingestion
            </Badge>
            <div>
              <h1 className="text-3xl font-semibold tracking-tight text-white">
                Zoom copilot
              </h1>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-zinc-400">
                Connect Zoom for {activeOrg.orgName} so Kodi can capture meeting starts,
                participants, transcript events, and the first live meeting state.
              </p>
            </div>
          </div>

          <div className="flex flex-wrap gap-3">
            <Button
              onClick={() => void refresh()}
              variant="ghost"
              className="gap-2 border border-zinc-800 bg-zinc-900 text-zinc-300 hover:bg-zinc-800 hover:text-white"
              disabled={action !== null}
            >
              <RefreshCcw size={16} className={action === 'refresh' ? 'animate-spin' : ''} />
              Refresh
            </Button>
            {isOwner && !installation && (
              <Button
                onClick={() => void connectZoom()}
                className="gap-2 bg-indigo-500 text-white hover:bg-indigo-400"
                disabled={action !== null || !installStatus?.setup.configured}
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
          <div className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
            <Card className="border-zinc-800 bg-zinc-900/60">
              <CardContent className="space-y-3 p-6">
                <Skeleton className="h-5 w-32 bg-zinc-800" />
                <Skeleton className="h-24 bg-zinc-800" />
                <Skeleton className="h-9 w-40 bg-zinc-800" />
              </CardContent>
            </Card>
            <Card className="border-zinc-800 bg-zinc-900/60">
              <CardContent className="space-y-3 p-6">
                <Skeleton className="h-5 w-40 bg-zinc-800" />
                <Skeleton className="h-40 bg-zinc-800" />
              </CardContent>
            </Card>
          </div>
        ) : (
          <div className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
            <Card className="border-zinc-800 bg-zinc-900/60">
              <CardHeader className="gap-3">
                <div className="flex items-center gap-3">
                  <div className="flex h-11 w-11 items-center justify-center rounded-2xl border border-sky-500/20 bg-sky-500/10 text-sky-300">
                    <Video size={20} />
                  </div>
                  <div>
                    <CardTitle className="text-xl text-white">Zoom installation</CardTitle>
                    <CardDescription className="text-zinc-400">
                      Workspace-level setup and OAuth connection state.
                    </CardDescription>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex flex-wrap gap-2">
                  <Badge
                    className={
                      installStatus?.featureFlags.zoomCopilot
                        ? 'border-emerald-500/30 bg-emerald-500/15 text-emerald-300'
                        : 'border-zinc-700 bg-zinc-800 text-zinc-300'
                    }
                  >
                    {installStatus?.featureFlags.zoomCopilot
                      ? 'Feature enabled'
                      : 'Feature disabled'}
                  </Badge>
                  <Badge
                    className={
                      installStatus?.setup.configured
                        ? 'border-emerald-500/30 bg-emerald-500/15 text-emerald-300'
                        : 'border-amber-500/30 bg-amber-500/15 text-amber-200'
                    }
                  >
                    {installStatus?.setup.configured ? 'App configured' : 'Setup incomplete'}
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
                      Enable <code className="rounded bg-zinc-800 px-1 py-0.5">KODI_FEATURE_ZOOM_COPILOT</code> before trying the live integration.
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

                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="rounded-2xl border border-zinc-800 bg-zinc-950/60 p-4">
                    <p className="text-xs uppercase tracking-[0.18em] text-zinc-500">
                      Redirect URI
                    </p>
                    <p className="mt-2 break-all text-sm text-zinc-200">
                      {installStatus?.setup.redirectUri ?? 'Not configured'}
                    </p>
                  </div>
                  <div className="rounded-2xl border border-zinc-800 bg-zinc-950/60 p-4">
                    <p className="text-xs uppercase tracking-[0.18em] text-zinc-500">
                      Zoom app ID
                    </p>
                    <p className="mt-2 text-sm text-zinc-200">
                      {installStatus?.setup.appId ?? 'Not configured'}
                    </p>
                  </div>
                </div>

                {installation ? (
                  <div className="rounded-2xl border border-zinc-800 bg-black/20 p-4">
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <p className="text-sm font-medium text-white">
                          {installation.externalAccountEmail ?? 'Connected Zoom account'}
                        </p>
                        <p className="mt-1 text-xs text-zinc-500">
                          Updated {formatDate(installation.updatedAt)}
                        </p>
                      </div>
                      <CheckCircle2 size={18} className="text-emerald-300" />
                    </div>
                    <div className="mt-4 flex flex-wrap gap-2">
                      {(installation.scopes ?? []).slice(0, 5).map((scope) => (
                        <Badge
                          key={scope}
                          className="border-zinc-700 bg-zinc-800 text-zinc-300"
                        >
                          {scope}
                        </Badge>
                      ))}
                    </div>
                    {installation.errorMessage && (
                      <p className="mt-4 text-sm text-red-300">
                        {installation.errorMessage}
                      </p>
                    )}
                  </div>
                ) : (
                  <div className="rounded-2xl border border-dashed border-zinc-800 bg-zinc-950/50 p-5 text-sm text-zinc-400">
                    {isOwner
                      ? 'No Zoom installation has been connected yet for this workspace.'
                      : 'An owner needs to connect Zoom before meeting ingestion can start.'}
                  </div>
                )}
              </CardContent>
            </Card>

            <Card className="border-zinc-800 bg-zinc-900/60">
              <CardHeader>
                <CardTitle className="text-xl text-white">Recent meetings</CardTitle>
                <CardDescription className="text-zinc-400">
                  Meeting sessions created by webhooks and RTMS lifecycle events.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                {meetings.length === 0 ? (
                  <div className="rounded-2xl border border-dashed border-zinc-800 bg-zinc-950/50 p-5 text-sm text-zinc-500">
                    Meeting sessions will appear here once Zoom webhooks start creating records.
                  </div>
                ) : (
                  meetings.map((meeting) => (
                    <Link
                      key={meeting.id}
                      href={`/meetings/${meeting.id}`}
                      className="group block rounded-2xl border border-zinc-800 bg-zinc-950/60 p-4 transition hover:border-zinc-700 hover:bg-zinc-900"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium text-white">
                            {meeting.title ?? 'Untitled Zoom meeting'}
                          </p>
                          <p className="mt-1 text-xs text-zinc-500">
                            Started {formatDate(meeting.actualStartAt ?? meeting.createdAt)}
                          </p>
                        </div>
                        <Badge className={statusTone(meeting.status)}>
                          {meeting.status}
                        </Badge>
                      </div>
                      <div className="mt-4 flex items-center gap-2 text-xs text-zinc-400">
                        <span>Open meeting console</span>
                        <ArrowRight
                          size={14}
                          className="transition group-hover:translate-x-0.5"
                        />
                      </div>
                    </Link>
                  ))
                )}
              </CardContent>
            </Card>
          </div>
        )}

        <div className="grid gap-6 lg:grid-cols-3">
          <Card className="border-zinc-800 bg-zinc-900/60 lg:col-span-2">
            <CardHeader>
              <CardTitle className="text-lg text-white">Phase 1 outcome</CardTitle>
              <CardDescription className="text-zinc-400">
                This milestone gets Kodi attached to Zoom’s install and meeting event surface before live reasoning and execution phases.
              </CardDescription>
            </CardHeader>
            <CardContent className="grid gap-3 text-sm text-zinc-300 md:grid-cols-3">
              <div className="rounded-2xl border border-zinc-800 bg-zinc-950/50 p-4">
                OAuth install flow
              </div>
              <div className="rounded-2xl border border-zinc-800 bg-zinc-950/50 p-4">
                Meeting session creation and ingestion
              </div>
              <div className="rounded-2xl border border-zinc-800 bg-zinc-950/50 p-4">
                Transcript and participant console
              </div>
            </CardContent>
          </Card>

          <Card className="border-zinc-800 bg-zinc-900/60">
            <CardHeader>
              <CardTitle className="text-lg text-white">Prerequisites</CardTitle>
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
    </div>
  )
}
