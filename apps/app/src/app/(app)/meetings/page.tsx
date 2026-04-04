'use client'

import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { useEffect, useMemo, useState, useTransition } from 'react'
import { ArrowRight, RefreshCcw, Sparkles, Video } from 'lucide-react'
import {
  Alert,
  AlertDescription,
  Badge,
  Button,
  Card,
  CardContent,
  Input,
  Label,
  Skeleton,
} from '@kodi/ui'
import { useOrg } from '@/lib/org-context'
import { trpc } from '@/lib/trpc'
import {
  getStatusTone,
  getZoomStatus,
  type ZoomInstallStatus,
} from '../integrations/_lib/tool-access-ui'

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
    case 'listening':
      return 'border-emerald-500/30 bg-emerald-500/15 text-emerald-300'
    case 'admitted':
      return 'border-cyan-500/30 bg-cyan-500/15 text-cyan-200'
    case 'processing':
      return 'border-indigo-500/30 bg-indigo-500/15 text-indigo-200'
    case 'joining':
    case 'scheduled':
    case 'preparing':
      return 'border-amber-500/30 bg-amber-500/15 text-amber-200'
    case 'ended':
      return 'border-zinc-700 bg-zinc-800 text-zinc-300'
    case 'failed':
      return 'border-red-500/30 bg-red-500/15 text-red-200'
    default:
      return 'border-zinc-700 bg-zinc-800 text-zinc-300'
  }
}

function statusLabel(status: string) {
  switch (status) {
    case 'listening':
      return 'Live'
    case 'admitted':
      return 'Admitted'
    case 'processing':
      return 'Summarizing'
    case 'preparing':
      return 'Preparing'
    case 'joining':
      return 'Joining'
    case 'ended':
      return 'Ended'
    case 'failed':
      return 'Needs attention'
    default:
      return status
  }
}

function meetingSnapshot(meeting: MeetingListItem[number]) {
  if (meeting.liveSummary) return meeting.liveSummary

  switch (meeting.status) {
    case 'joining':
    case 'preparing':
      return 'Kodi is on the way into the call.'
    case 'admitted':
      return 'Kodi reached the meeting and is waiting to actively listen.'
    case 'listening':
      return 'Transcript and live context are flowing now.'
    case 'processing':
      return 'Kodi is turning the call into notes and follow-up.'
    case 'failed':
      return 'This session hit a provider problem and may need another try.'
    case 'ended':
      return 'This meeting has ended. Summary and transcript stay available.'
    default:
      return 'Open the meeting to review transcript, summary, and follow-up.'
  }
}

function meetingOutcomeLabel(meeting: MeetingListItem[number]) {
  if (meeting.liveSummary) return 'Summary ready'

  switch (meeting.status) {
    case 'listening':
      return 'Transcript live'
    case 'processing':
      return 'Notes incoming'
    case 'failed':
      return 'Needs retry'
    case 'ended':
      return 'Review available'
    default:
      return 'In progress'
  }
}

export default function MeetingsPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const { activeOrg } = useOrg()
  const [meetings, setMeetings] = useState<MeetingListItem>([])
  const [zoomInstallStatus, setZoomInstallStatus] =
    useState<ZoomInstallStatus | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [meetingUrl, setMeetingUrl] = useState('')
  const [title, setTitle] = useState('')
  const [isStarting, startStartTransition] = useTransition()
  const [isRefreshing, startRefreshTransition] = useTransition()
  const [zoomAction, setZoomAction] = useState<
    'connect' | 'disconnect' | 'refresh' | null
  >(null)

  useEffect(() => {
    if (!activeOrg) {
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
        const [meetingItems, installStatus] = await Promise.all([
          trpc.meeting.list.query({ orgId, limit: 20 }),
          trpc.zoom.getInstallStatus.query({ orgId }),
        ])
        if (cancelled) return
        setMeetings(meetingItems)
        setZoomInstallStatus(installStatus)
      } catch (err) {
        if (cancelled) return
        setError(
          err instanceof Error ? err.message : 'Failed to load meetings.'
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

  async function refresh() {
    if (!activeOrg) return

    startRefreshTransition(() => {
      void (async () => {
        try {
          const meetingItems = await trpc.meeting.list.query({
            orgId: activeOrg.orgId,
            limit: 20,
          })
          setMeetings(meetingItems)
          setError(null)
        } catch (err) {
          setError(
            err instanceof Error ? err.message : 'Failed to refresh meetings.'
          )
        }
      })()
    })
  }

  async function startMeeting() {
    if (!activeOrg) return

    startStartTransition(() => {
      void (async () => {
        try {
          const result = await trpc.meeting.joinByUrl.mutate({
            orgId: activeOrg.orgId,
            meetingUrl: meetingUrl.trim(),
            title: title.trim() || undefined,
          })

          setError(null)
          setMeetingUrl('')
          setTitle('')
          router.push(`/meetings/${result.meetingSessionId}`)
        } catch (err) {
          setError(
            err instanceof Error
              ? err.message
              : 'Failed to start the meeting bot.'
          )
        }
      })()
    })
  }

  const liveCount = useMemo(
    () =>
      meetings.filter((meeting) =>
        [
          'preparing',
          'joining',
          'admitted',
          'listening',
          'processing',
        ].includes(meeting.status)
      ).length,
    [meetings]
  )

  const zoomStatus = getZoomStatus(zoomInstallStatus)
  const zoomInstallation = zoomInstallStatus?.installation ?? null
  const missingZoomSetup = zoomInstallStatus?.setup.missing ?? []
  const isOwner = activeOrg?.role === 'owner'
  const zoomCallbackStatus = searchParams.get('zoom')

  const zoomCallbackBanner = useMemo(() => {
    if (zoomCallbackStatus === 'connected') {
      return {
        tone: 'success' as const,
        message:
          'Zoom connected. Kodi can now use meeting events for this workspace.',
      }
    }

    if (zoomCallbackStatus === 'error') {
      return {
        tone: 'error' as const,
        message:
          'Zoom connection did not finish. Check the meeting connection card and try again.',
      }
    }

    return null
  }, [zoomCallbackStatus])

  async function refreshZoomStatus() {
    if (!activeOrg) return
    setZoomAction('refresh')

    try {
      const status = await trpc.zoom.getInstallStatus.query({
        orgId: activeOrg.orgId,
      })
      setZoomInstallStatus(status)
      setError(null)
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Failed to refresh Zoom status.'
      )
    } finally {
      setZoomAction(null)
    }
  }

  async function connectZoom() {
    if (!activeOrg) return
    setZoomAction('connect')

    try {
      const result = await trpc.zoom.getInstallUrl.mutate({
        orgId: activeOrg.orgId,
        returnPath: '/meetings',
      })
      window.location.assign(result.url)
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'Failed to start the Zoom install flow.'
      )
      setZoomAction(null)
    }
  }

  async function disconnectZoom() {
    if (!activeOrg) return
    setZoomAction('disconnect')

    try {
      await trpc.zoom.disconnect.mutate({ orgId: activeOrg.orgId })
      await refreshZoomStatus()
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Failed to disconnect Zoom.'
      )
      setZoomAction(null)
    }
  }

  if (!activeOrg) {
    return (
      <div className="flex min-h-full items-center justify-center p-6 text-sm text-zinc-500">
        Select a workspace to work with meetings.
      </div>
    )
  }

  return (
    <div className="min-h-full bg-[radial-gradient(circle_at_top_left,_rgba(20,184,166,0.10),_transparent_30%),radial-gradient(circle_at_bottom_right,_rgba(59,130,246,0.08),_transparent_34%),linear-gradient(180deg,_rgba(15,16,20,0.88),_rgba(7,8,10,1))]">
      <div className="mx-auto flex max-w-6xl flex-col gap-6 px-4 py-8">
        <section className="grid gap-6 lg:grid-cols-[minmax(0,1.15fr)_minmax(320px,0.85fr)]">
          <div className="overflow-hidden rounded-[2rem] border border-zinc-800 bg-[linear-gradient(180deg,_rgba(19,20,24,0.96),_rgba(11,12,15,0.96))] p-6 shadow-2xl shadow-black/20 lg:p-8">
            <Badge className="border-zinc-700 bg-zinc-900 text-zinc-300">
              Meetings
            </Badge>
            <div className="mt-5 max-w-2xl space-y-4">
              <h1 className="text-4xl font-semibold tracking-tight text-white">
                Start a meeting. Keep the output that matters.
              </h1>
              <p className="text-sm leading-7 text-zinc-400">
                Kodi joins the call, captures the transcript, and turns the
                conversation into a useful summary for the team. This page is
                for two jobs only: start the bot, then review the meeting.
              </p>
            </div>

            <div className="mt-8 grid gap-3 sm:grid-cols-3">
              <div className="rounded-[1.4rem] border border-zinc-800 bg-zinc-950/60 p-4">
                <p className="text-[11px] uppercase tracking-[0.2em] text-zinc-500">
                  Live now
                </p>
                <p className="mt-3 text-3xl font-semibold text-white">
                  {liveCount}
                </p>
                <p className="mt-2 text-sm text-zinc-500">
                  Sessions currently joining, listening, or summarizing.
                </p>
              </div>
              <div className="rounded-[1.4rem] border border-zinc-800 bg-zinc-950/60 p-4">
                <p className="text-[11px] uppercase tracking-[0.2em] text-zinc-500">
                  Workflow
                </p>
                <p className="mt-3 text-sm leading-6 text-zinc-200">
                  Paste the Meet link, admit Kodi, then review the summary and
                  transcript here.
                </p>
              </div>
              <div className="rounded-[1.4rem] border border-zinc-800 bg-zinc-950/60 p-4">
                <p className="text-[11px] uppercase tracking-[0.2em] text-zinc-500">
                  Current scope
                </p>
                <p className="mt-3 text-sm leading-6 text-zinc-200">
                  Google Meet first. Invite-by-email and automatic join rules
                  come next.
                </p>
              </div>
            </div>
          </div>

          <div className="space-y-4">
            <Card className="border-zinc-800 bg-[linear-gradient(180deg,_rgba(18,19,23,0.98),_rgba(10,11,14,0.98))]">
              <CardContent className="p-6">
                <div className="flex items-start justify-between gap-4">
                  <div className="space-y-2">
                    <p className="text-xs uppercase tracking-[0.2em] text-zinc-500">
                      Start meeting
                    </p>
                    <h2 className="text-2xl font-semibold text-white">
                      Bring Kodi into a live Meet
                    </h2>
                    <p className="text-sm leading-6 text-zinc-400">
                      Start from a live Google Meet URL. The meeting page will
                      become the control room once Kodi gets in.
                    </p>
                  </div>

                  <div className="hidden h-11 w-11 items-center justify-center rounded-[1.1rem] border border-zinc-800 bg-zinc-900 text-zinc-200 sm:flex">
                    <Video size={18} />
                  </div>
                </div>

                <div className="mt-6 space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="meeting-url" className="text-zinc-300">
                      Google Meet URL
                    </Label>
                    <Input
                      id="meeting-url"
                      value={meetingUrl}
                      onChange={(event) => setMeetingUrl(event.target.value)}
                      placeholder="https://meet.google.com/abc-defg-hij"
                      className="h-11 border-zinc-800 bg-zinc-900 text-zinc-100 placeholder:text-zinc-500"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="meeting-title" className="text-zinc-300">
                      Meeting title
                    </Label>
                    <Input
                      id="meeting-title"
                      value={title}
                      onChange={(event) => setTitle(event.target.value)}
                      placeholder="Weekly product sync"
                      className="h-11 border-zinc-800 bg-zinc-900 text-zinc-100 placeholder:text-zinc-500"
                    />
                  </div>

                  <div className="rounded-[1.4rem] border border-zinc-800 bg-zinc-950/70 p-4 text-sm leading-6 text-zinc-300">
                    <p>1. Start the meeting here.</p>
                    <p>2. Admit Kodi when Google Meet asks.</p>
                    <p>3. Review the summary, notes, and transcript in Kodi.</p>
                  </div>

                  <div className="flex flex-col gap-3 pt-1 sm:flex-row sm:items-center">
                    <Button
                      onClick={() => void startMeeting()}
                      disabled={isStarting || meetingUrl.trim().length === 0}
                      className="gap-2 bg-emerald-500 text-zinc-950 hover:bg-emerald-400"
                    >
                      <Sparkles size={16} />
                      {isStarting ? 'Starting Kodi…' : 'Start meeting bot'}
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="border-zinc-800 bg-[linear-gradient(180deg,_rgba(18,19,23,0.98),_rgba(10,11,14,0.98))]">
              <CardContent className="p-6">
                <div className="flex items-start justify-between gap-4">
                  <div className="space-y-2">
                    <div className="flex flex-wrap gap-2">
                      <Badge className={getStatusTone(zoomStatus)}>
                        {zoomStatus}
                      </Badge>
                      <Badge className="border-zinc-700 bg-zinc-900 text-zinc-300">
                        Meeting connection
                      </Badge>
                    </div>
                    <h2 className="text-2xl font-semibold text-white">
                      Zoom belongs here
                    </h2>
                    <p className="text-sm leading-6 text-zinc-400">
                      Zoom is a meeting integration, not a tool integration, so
                      it lives on the Meetings page. Tool integrations stay in
                      the separate Integrations surface.
                    </p>
                  </div>
                </div>

                <div className="mt-6 rounded-[1.4rem] border border-zinc-800 bg-zinc-950/70 p-4">
                  <p className="text-sm font-medium text-white">
                    {zoomInstallation
                      ? zoomInstallation.externalAccountEmail
                        ? `Connected account: ${zoomInstallation.externalAccountEmail}`
                        : 'A Zoom account is connected for this workspace.'
                      : isOwner
                        ? 'Zoom is not connected yet.'
                        : 'A workspace owner needs to connect Zoom.'}
                  </p>
                  <p className="mt-2 text-sm leading-6 text-zinc-400">
                    {zoomInstallation
                      ? `Last updated ${formatDate(zoomInstallation.updatedAt)}.`
                      : zoomInstallStatus?.setup.configured
                        ? 'Connect Zoom to unlock Zoom-based meeting events and callbacks.'
                        : `Zoom still needs setup: ${(missingZoomSetup.length > 0 ? missingZoomSetup : ['Zoom config']).join(', ')}.`}
                  </p>
                </div>

                <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center">
                  {zoomInstallation ? (
                    <Button
                      onClick={() => void disconnectZoom()}
                      variant="outline"
                      className="border-red-500/30 bg-red-500/10 text-red-200 hover:bg-red-500/20 hover:text-red-100"
                      disabled={zoomAction !== null}
                    >
                      {zoomAction === 'disconnect'
                        ? 'Disconnecting...'
                        : 'Disconnect Zoom'}
                    </Button>
                  ) : (
                    <Button
                      onClick={() => void connectZoom()}
                      disabled={!isOwner || zoomAction !== null}
                      className="bg-teal-500 text-zinc-950 hover:bg-teal-400"
                    >
                      {zoomAction === 'connect'
                        ? 'Connecting...'
                        : 'Connect Zoom'}
                    </Button>
                  )}

                  <Button
                    onClick={() => void refreshZoomStatus()}
                    variant="ghost"
                    className="gap-2 border border-zinc-800 bg-zinc-900 text-zinc-300 hover:bg-zinc-800 hover:text-white"
                    disabled={zoomAction !== null}
                  >
                    <RefreshCcw
                      size={16}
                      className={zoomAction === 'refresh' ? 'animate-spin' : ''}
                    />
                    Refresh Zoom
                  </Button>
                </div>
              </CardContent>
            </Card>
          </div>
        </section>

        {zoomCallbackBanner && (
          <Alert
            className={
              zoomCallbackBanner.tone === 'success'
                ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-200'
                : 'border-red-500/30 bg-red-500/10 text-red-200'
            }
          >
            <AlertDescription>{zoomCallbackBanner.message}</AlertDescription>
          </Alert>
        )}

        {error && (
          <Alert className="border-red-500/30 bg-red-500/10 text-red-200">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        <section className="space-y-4">
          <div className="flex items-end justify-between gap-4">
            <div>
              <h2 className="text-2xl font-semibold tracking-tight text-white">
                Recent meetings
              </h2>
              <p className="mt-1 text-sm text-zinc-400">
                Open any session to review what was said, what Kodi understood,
                and what deserves follow-through.
              </p>
            </div>

            <Button
              onClick={() => void refresh()}
              variant="ghost"
              className="gap-2 border border-zinc-800 bg-zinc-900 text-zinc-300 hover:bg-zinc-800 hover:text-white"
              disabled={isRefreshing}
            >
              <RefreshCcw
                size={16}
                className={isRefreshing ? 'animate-spin' : ''}
              />
              Refresh
            </Button>
          </div>

          {loading ? (
            <div className="space-y-3">
              {Array.from({ length: 4 }).map((_, index) => (
                <Card key={index} className="border-zinc-800 bg-zinc-900/60">
                  <CardContent className="space-y-4 p-5">
                    <Skeleton className="h-4 w-28 bg-zinc-800" />
                    <Skeleton className="h-5 w-56 bg-zinc-800" />
                    <Skeleton className="h-10 bg-zinc-800" />
                  </CardContent>
                </Card>
              ))}
            </div>
          ) : meetings.length === 0 ? (
            <Card className="border-zinc-800 bg-zinc-900/60">
              <CardContent className="flex flex-col gap-5 p-8">
                <div className="flex h-12 w-12 items-center justify-center rounded-[1.15rem] border border-zinc-800 bg-zinc-950 text-zinc-300">
                  <Video size={18} />
                </div>
                <div className="space-y-2">
                  <h3 className="text-xl font-medium text-white">
                    No meetings yet
                  </h3>
                  <p className="max-w-xl text-sm leading-6 text-zinc-400">
                    Start with a Meet link above. Once Kodi joins, this page
                    becomes the running record of summary, transcript, and
                    follow-up for the workspace.
                  </p>
                </div>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-3">
              {meetings.map((meeting) => (
                <Link
                  key={meeting.id}
                  href={`/meetings/${meeting.id}`}
                  className="group block rounded-[1.75rem] border border-zinc-800 bg-[linear-gradient(180deg,_rgba(18,19,23,0.95),_rgba(11,12,15,0.92))] p-5 transition hover:border-zinc-700 hover:bg-zinc-900/90"
                >
                  <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge className={statusTone(meeting.status)}>
                          {statusLabel(meeting.status)}
                        </Badge>
                        <Badge className="border-zinc-700 bg-zinc-900 text-zinc-400">
                          {meetingOutcomeLabel(meeting)}
                        </Badge>
                      </div>

                      <h3 className="mt-4 text-xl font-medium text-white">
                        {meeting.title ?? 'Untitled meeting'}
                      </h3>

                      <p className="mt-3 max-w-3xl text-sm leading-7 text-zinc-300">
                        {meetingSnapshot(meeting)}
                      </p>
                    </div>

                    <div className="flex shrink-0 flex-col gap-3 text-sm text-zinc-400 lg:items-end">
                      <div className="rounded-[1.2rem] border border-zinc-800 bg-zinc-950/70 px-4 py-3">
                        <p className="text-[11px] uppercase tracking-[0.2em] text-zinc-500">
                          Started
                        </p>
                        <p className="mt-2 text-zinc-200">
                          {formatDate(
                            meeting.actualStartAt ?? meeting.createdAt
                          )}
                        </p>
                      </div>
                      <div className="rounded-[1.2rem] border border-zinc-800 bg-zinc-950/70 px-4 py-3">
                        <p className="text-[11px] uppercase tracking-[0.2em] text-zinc-500">
                          Updated
                        </p>
                        <p className="mt-2 text-zinc-200">
                          {formatDate(meeting.updatedAt)}
                        </p>
                      </div>
                    </div>
                  </div>

                  <div className="mt-5 flex items-center justify-between gap-3 border-t border-zinc-800/80 pt-4 text-sm">
                    <span className="text-zinc-500">
                      {meeting.provider === 'google_meet'
                        ? 'Google Meet'
                        : 'Meeting'}
                    </span>
                    <span className="inline-flex items-center gap-2 text-zinc-100 transition group-hover:translate-x-0.5">
                      Open meeting
                      <ArrowRight size={15} />
                    </span>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  )
}
