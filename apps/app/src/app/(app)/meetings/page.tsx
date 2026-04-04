'use client'

import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { useEffect, useMemo, useState, useTransition } from 'react'
import {
  ArrowRight,
  Check,
  Copy,
  Mail,
  RefreshCcw,
  Sparkles,
  UserRound,
  Video,
} from 'lucide-react'
import { deriveMeetingBotIdentity } from '@kodi/db/meeting-bot-identity'
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
  const [copiedField, setCopiedField] = useState<
    'display-name' | 'invite-email' | null
  >(null)
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
  const meetingBotIdentity = useMemo(
    () =>
      activeOrg
        ? deriveMeetingBotIdentity({
            orgName: activeOrg.orgName,
            orgSlug: activeOrg.orgSlug,
          })
        : null,
    [activeOrg]
  )
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

  async function copyIdentityValue(
    value: string,
    field: 'display-name' | 'invite-email'
  ) {
    try {
      await navigator.clipboard.writeText(value)
      setCopiedField(field)
      window.setTimeout(() => {
        setCopiedField((current) => (current === field ? null : current))
      }, 1800)
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Failed to copy to clipboard.'
      )
    }
  }

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

  const workspaceMeetingBotIdentity =
    meetingBotIdentity ??
    deriveMeetingBotIdentity({
      orgName: activeOrg.orgName,
      orgSlug: activeOrg.orgSlug,
    })

  return (
    <div className="min-h-full bg-background">
      <div className="mx-auto flex w-full max-w-[96rem] flex-col gap-6 px-4 py-8">
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

        <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1.18fr)_minmax(21rem,27rem)]">
          <div className="min-w-0 space-y-6">
            <section className="min-w-0 overflow-hidden rounded-[2rem] border border-border bg-card p-6 lg:p-8">
              <Badge variant="outline">Meetings</Badge>
              <div className="mt-5 max-w-2xl space-y-4">
                <h1 className="text-4xl font-semibold tracking-tight text-foreground">
                  Start a meeting. Keep the output that matters.
                </h1>
                <p className="text-sm leading-7 text-muted-foreground">
                  Kodi joins the call, captures the transcript, and turns the
                  conversation into a useful summary for the team. This page is
                  for two jobs only: start the bot, then review the meeting.
                </p>
              </div>

              <div className="mt-8 grid gap-3 md:grid-cols-2 2xl:grid-cols-3">
                <div className="min-w-0 rounded-[1.4rem] border border-border bg-secondary p-4">
                  <p className="text-[11px] uppercase tracking-[0.2em] text-muted-foreground">
                    Live now
                  </p>
                  <p className="mt-3 text-3xl font-semibold text-foreground">
                    {liveCount}
                  </p>
                  <p className="mt-2 text-sm text-muted-foreground">
                    Sessions currently joining, listening, or summarizing.
                  </p>
                </div>
                <div className="min-w-0 rounded-[1.4rem] border border-border bg-secondary p-4">
                  <p className="text-[11px] uppercase tracking-[0.2em] text-muted-foreground">
                    Workflow
                  </p>
                  <p className="mt-3 text-sm leading-6 text-foreground">
                    Paste the Meet link, admit Kodi, then review the summary and
                    transcript here.
                  </p>
                </div>
                <div className="min-w-0 rounded-[1.4rem] border border-border bg-secondary p-4 md:col-span-2 2xl:col-span-1">
                  <p className="text-[11px] uppercase tracking-[0.2em] text-muted-foreground">
                    Current scope
                  </p>
                  <p className="mt-3 text-sm leading-6 text-foreground">
                    Google Meet live start is ready now. Stable invite identity
                    is in place, with invite-by-email automation and auto-join
                    rules coming next.
                  </p>
                </div>
              </div>
            </section>

            <section className="space-y-4">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
                <div>
                  <h2 className="text-2xl font-semibold tracking-tight text-white">
                    Recent meetings
                  </h2>
                  <p className="mt-1 max-w-2xl text-sm text-zinc-400">
                    Open any session to review the summary, grouped transcript,
                    and the follow-up that seems worth acting on.
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
                        Start with a Meet link on the right. Once Kodi joins,
                        this page becomes the running record of summary,
                        transcript, and follow-up for the workspace.
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

          <div className="min-w-0 space-y-4 xl:sticky xl:top-6">
            <Card className="min-w-0 border-border bg-card">
              <CardContent className="p-6">
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0 space-y-2">
                    <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">
                      Start meeting
                    </p>
                    <h2 className="text-2xl font-semibold text-foreground">
                      Bring Kodi into a live Meet
                    </h2>
                    <p className="text-sm leading-6 text-muted-foreground">
                      Start from a live Google Meet URL. The meeting page will
                      become the control room once Kodi gets in.
                    </p>
                  </div>

                  <div className="hidden h-11 w-11 items-center justify-center rounded-[1.1rem] border border-border bg-secondary text-foreground sm:flex">
                    <Video size={18} />
                  </div>
                </div>

                <div className="mt-6 space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="meeting-url" className="text-foreground">
                      Google Meet URL
                    </Label>
                    <Input
                      id="meeting-url"
                      value={meetingUrl}
                      onChange={(event) => setMeetingUrl(event.target.value)}
                      placeholder="https://meet.google.com/abc-defg-hij"
                      className="h-11"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="meeting-title" className="text-foreground">
                      Meeting title
                    </Label>
                    <Input
                      id="meeting-title"
                      value={title}
                      onChange={(event) => setTitle(event.target.value)}
                      placeholder="Weekly product sync"
                      className="h-11"
                    />
                  </div>

                  <div className="rounded-[1.2rem] border border-border bg-secondary px-4 py-3 text-sm leading-6 text-muted-foreground">
                    Start here for a live call. Admit Kodi in Meet, then come
                    back to this workspace to review the summary and transcript.
                  </div>

                  <div className="flex flex-col gap-3 pt-1 sm:flex-row sm:items-center">
                    <Button
                      onClick={() => void startMeeting()}
                      disabled={isStarting || meetingUrl.trim().length === 0}
                      className="gap-2"
                    >
                      <Sparkles size={16} />
                      {isStarting ? 'Starting Kodi…' : 'Start meeting bot'}
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="border-border bg-card">
              <CardContent className="p-6">
                <div className="min-w-0 rounded-[1.4rem] border border-border bg-secondary p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0 space-y-2">
                        <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">
                          Workspace meeting agent
                        </p>
                        <h3 className="text-xl font-semibold text-foreground">
                          Stable identity for invites
                        </h3>
                        <p className="text-sm leading-6 text-muted-foreground">
                          This is the workspace-specific meeting agent identity
                          Kodi will keep using as invite-by-email comes online.
                        </p>
                      </div>
                      <Badge variant="outline">Phase F1</Badge>
                    </div>

                    <div className="mt-5 grid gap-3">
                      <div className="min-w-0 rounded-[1.2rem] border border-border bg-background p-4">
                        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                          <div className="flex min-w-0 flex-1 items-center gap-3">
                            <div className="flex h-10 w-10 items-center justify-center rounded-[1rem] border border-border bg-secondary text-foreground">
                              <UserRound size={17} />
                            </div>
                            <div className="min-w-0">
                              <p className="text-[11px] uppercase tracking-[0.2em] text-muted-foreground">
                                Display name
                              </p>
                              <p className="mt-1 break-words text-sm font-medium text-foreground">
                                {workspaceMeetingBotIdentity.displayName}
                              </p>
                            </div>
                          </div>

                          <Button
                            type="button"
                            variant="outline"
                            className="gap-2 self-start sm:self-center"
                            onClick={() =>
                              void copyIdentityValue(
                                workspaceMeetingBotIdentity.displayName,
                                'display-name'
                              )
                            }
                          >
                            {copiedField === 'display-name' ? (
                              <Check size={15} />
                            ) : (
                              <Copy size={15} />
                            )}
                            {copiedField === 'display-name' ? 'Copied' : 'Copy'}
                          </Button>
                        </div>
                      </div>

                      <div className="min-w-0 rounded-[1.2rem] border border-border bg-background p-4">
                        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                          <div className="flex min-w-0 flex-1 items-center gap-3">
                            <div className="flex h-10 w-10 items-center justify-center rounded-[1rem] border border-border bg-secondary text-foreground">
                              <Mail size={17} />
                            </div>
                            <div className="min-w-0">
                              <p className="text-[11px] uppercase tracking-[0.2em] text-muted-foreground">
                                Invite address
                              </p>
                              <p className="mt-1 break-all text-sm font-medium text-foreground">
                                {workspaceMeetingBotIdentity.inviteEmail}
                              </p>
                            </div>
                          </div>

                          <Button
                            type="button"
                            variant="outline"
                            className="gap-2 self-start sm:self-center"
                            onClick={() =>
                              void copyIdentityValue(
                                workspaceMeetingBotIdentity.inviteEmail,
                                'invite-email'
                              )
                            }
                          >
                            {copiedField === 'invite-email' ? (
                              <Check size={15} />
                            ) : (
                              <Copy size={15} />
                            )}
                            {copiedField === 'invite-email' ? 'Copied' : 'Copy'}
                          </Button>
                        </div>
                      </div>
                    </div>

                    <div className="mt-4 rounded-[1.2rem] border border-dashed border-border bg-background p-4 text-sm leading-6 text-foreground">
                      {workspaceMeetingBotIdentity.inviteInstructions.map((instruction) => (
                        <p key={instruction} className="break-words">
                          {instruction}
                        </p>
                      ))}
                    </div>
                </div>
              </CardContent>
            </Card>

            <Card className="border-border bg-card">
              <CardContent className="p-6">
                <div className="flex items-start justify-between gap-4">
                  <div className="space-y-2">
                    <div className="flex flex-wrap gap-2">
                      <Badge className={getStatusTone(zoomStatus)}>
                        {zoomStatus}
                      </Badge>
                      <Badge variant="outline">Meeting connection</Badge>
                    </div>
                    <h2 className="text-2xl font-semibold text-foreground">
                      Zoom belongs here
                    </h2>
                    <p className="text-sm leading-6 text-muted-foreground">
                      Zoom is a meeting integration, not a tool integration, so
                      it lives on the Meetings page. Tool integrations stay in
                      the separate Integrations surface.
                    </p>
                  </div>
                </div>

                <div className="mt-6 rounded-[1.4rem] border border-border bg-secondary p-4">
                  <p className="text-sm font-medium text-foreground">
                    {zoomInstallation
                      ? zoomInstallation.externalAccountEmail
                        ? `Connected account: ${zoomInstallation.externalAccountEmail}`
                        : 'A Zoom account is connected for this workspace.'
                      : isOwner
                        ? 'Zoom is not connected yet.'
                        : 'A workspace owner needs to connect Zoom.'}
                  </p>
                  <p className="mt-2 text-sm leading-6 text-muted-foreground">
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
                    >
                      {zoomAction === 'connect'
                        ? 'Connecting...'
                        : 'Connect Zoom'}
                    </Button>
                  )}

                  <Button
                    onClick={() => void refreshZoomStatus()}
                    variant="outline"
                    className="gap-2"
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
        </div>
      </div>
    </div>
  )
}
