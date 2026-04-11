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

function formatProviderLabel(provider: string) {
  switch (provider) {
    case 'google_meet':
      return 'Google Meet'
    case 'zoom':
      return 'Zoom'
    default:
      return 'Meeting'
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
          <div className="min-w-0 space-y-4">
            <div className="flex items-center justify-between gap-4">
              <h1 className="text-2xl font-semibold tracking-tight text-foreground">
                Meetings
              </h1>
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
              <div className="overflow-hidden rounded-[1.5rem] border border-zinc-800">
                {Array.from({ length: 4 }).map((_, index) => (
                  <div
                    key={index}
                    className="flex items-center gap-4 border-b border-zinc-800 px-5 py-4 last:border-b-0"
                  >
                    <Skeleton className="h-5 w-16 rounded-full bg-zinc-800" />
                    <Skeleton className="h-4 w-48 bg-zinc-800" />
                    <Skeleton className="ml-auto h-4 w-24 bg-zinc-800" />
                  </div>
                ))}
              </div>
            ) : meetings.length === 0 ? (
              <div className="flex flex-col items-start gap-4 rounded-[1.5rem] border border-zinc-800 bg-zinc-900/60 p-8">
                <div className="flex h-10 w-10 items-center justify-center rounded-[1.1rem] border border-zinc-800 bg-zinc-950 text-zinc-300">
                  <Video size={18} />
                </div>
                <div className="space-y-1">
                  <p className="text-sm font-medium text-white">
                    No meetings yet
                  </p>
                  <p className="text-sm text-zinc-400">
                    Paste a Meet or Zoom link on the right to get started.
                  </p>
                </div>
              </div>
            ) : (
              <div className="overflow-hidden rounded-[1.5rem] border border-zinc-800">
                {meetings.map((meeting, index) => (
                  <Link
                    key={meeting.id}
                    href={`/meetings/${meeting.id}`}
                    className={`group flex items-center gap-4 px-5 py-4 transition hover:bg-zinc-900/80 ${
                      index < meetings.length - 1
                        ? 'border-b border-zinc-800'
                        : ''
                    }`}
                  >
                    <Badge className={`shrink-0 ${statusTone(meeting.status)}`}>
                      {statusLabel(meeting.status)}
                    </Badge>
                    <span className="min-w-0 flex-1 truncate text-sm font-medium text-white">
                      {meeting.title ?? 'Untitled meeting'}
                    </span>
                    <span className="shrink-0 text-xs text-zinc-500">
                      {formatDate(meeting.actualStartAt ?? meeting.createdAt)}
                    </span>
                    <span className="shrink-0 text-xs text-zinc-500">
                      {formatProviderLabel(meeting.provider)}
                    </span>
                    <ArrowRight
                      size={14}
                      className="shrink-0 text-zinc-600 transition group-hover:translate-x-0.5 group-hover:text-zinc-300"
                    />
                  </Link>
                ))}
              </div>
            )}
          </div>

          <div className="min-w-0 space-y-4 xl:sticky xl:top-6">
            <Card className="min-w-0 border-border bg-card">
              <CardContent className="p-6">
                <h2 className="text-lg font-semibold text-foreground">
                  Start meeting
                </h2>

                <div className="mt-5 space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="meeting-url" className="text-foreground">
                      Meeting URL
                    </Label>
                    <Input
                      id="meeting-url"
                      value={meetingUrl}
                      onChange={(event) => setMeetingUrl(event.target.value)}
                      placeholder="https://meet.google.com/… or https://zoom.us/j/…"
                      className="h-11"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="meeting-title" className="text-foreground">
                      Title
                    </Label>
                    <Input
                      id="meeting-title"
                      value={title}
                      onChange={(event) => setTitle(event.target.value)}
                      placeholder="Weekly product sync"
                      className="h-11"
                    />
                  </div>

                  <Button
                    onClick={() => void startMeeting()}
                    disabled={isStarting || meetingUrl.trim().length === 0}
                    className="w-full gap-2"
                  >
                    <Sparkles size={16} />
                    {isStarting ? 'Starting Kodi…' : 'Start meeting bot'}
                  </Button>
                </div>
              </CardContent>
            </Card>

            <details className="group rounded-[1.5rem] border border-border bg-card">
              <summary className="cursor-pointer list-none px-6 py-5 text-sm font-medium text-foreground marker:hidden">
                Meeting bot identity
              </summary>
              <div className="space-y-3 px-6 pb-5">
                <div className="min-w-0 rounded-[1.2rem] border border-border bg-background p-4">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div className="flex min-w-0 flex-1 items-center gap-3">
                      <div className="flex h-9 w-9 items-center justify-center rounded-[0.9rem] border border-border bg-secondary text-foreground">
                        <UserRound size={15} />
                      </div>
                      <div className="min-w-0">
                        <p className="text-[11px] uppercase tracking-[0.2em] text-muted-foreground">
                          Display name
                        </p>
                        <p className="mt-0.5 break-words text-sm font-medium text-foreground">
                          {workspaceMeetingBotIdentity.displayName}
                        </p>
                      </div>
                    </div>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="gap-1.5 self-start sm:self-center"
                      onClick={() =>
                        void copyIdentityValue(
                          workspaceMeetingBotIdentity.displayName,
                          'display-name'
                        )
                      }
                    >
                      {copiedField === 'display-name' ? (
                        <Check size={13} />
                      ) : (
                        <Copy size={13} />
                      )}
                      {copiedField === 'display-name' ? 'Copied' : 'Copy'}
                    </Button>
                  </div>
                </div>

                <div className="min-w-0 rounded-[1.2rem] border border-border bg-background p-4">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div className="flex min-w-0 flex-1 items-center gap-3">
                      <div className="flex h-9 w-9 items-center justify-center rounded-[0.9rem] border border-border bg-secondary text-foreground">
                        <Mail size={15} />
                      </div>
                      <div className="min-w-0">
                        <p className="text-[11px] uppercase tracking-[0.2em] text-muted-foreground">
                          Invite address
                        </p>
                        <p className="mt-0.5 break-all text-sm font-medium text-foreground">
                          {workspaceMeetingBotIdentity.inviteEmail}
                        </p>
                      </div>
                    </div>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="gap-1.5 self-start sm:self-center"
                      onClick={() =>
                        void copyIdentityValue(
                          workspaceMeetingBotIdentity.inviteEmail,
                          'invite-email'
                        )
                      }
                    >
                      {copiedField === 'invite-email' ? (
                        <Check size={13} />
                      ) : (
                        <Copy size={13} />
                      )}
                      {copiedField === 'invite-email' ? 'Copied' : 'Copy'}
                    </Button>
                  </div>
                </div>

                <div className="rounded-[1.2rem] border border-dashed border-border bg-background p-4 text-sm leading-6 text-foreground">
                  {workspaceMeetingBotIdentity.inviteInstructions.map(
                    (instruction) => (
                      <p key={instruction} className="break-words">
                        {instruction}
                      </p>
                    )
                  )}
                </div>
              </div>
            </details>

            <Card className="border-border bg-card">
              <CardContent className="p-6">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge className={getStatusTone(zoomStatus)}>
                    {zoomStatus}
                  </Badge>
                  <span className="text-sm font-medium text-foreground">
                    Zoom
                  </span>
                </div>

                <div className="mt-4 rounded-[1.2rem] border border-border bg-secondary p-4 text-sm leading-6">
                  <p className="font-medium text-foreground">
                    {zoomInstallation
                      ? zoomInstallation.externalAccountEmail
                        ? `Connected: ${zoomInstallation.externalAccountEmail}`
                        : 'A Zoom account is connected.'
                      : isOwner
                        ? 'Zoom is not connected yet.'
                        : 'A workspace owner needs to connect Zoom.'}
                  </p>
                  <p className="mt-1 text-muted-foreground">
                    {zoomInstallation
                      ? `Last updated ${formatDate(zoomInstallation.updatedAt)}.`
                      : zoomInstallStatus?.setup.configured
                        ? 'Connect Zoom to unlock Zoom meeting support.'
                        : `Zoom still needs setup: ${(missingZoomSetup.length > 0 ? missingZoomSetup : ['Zoom config']).join(', ')}.`}
                  </p>
                </div>

                <div className="mt-4 flex flex-wrap gap-3">
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
                      size={15}
                      className={zoomAction === 'refresh' ? 'animate-spin' : ''}
                    />
                    Refresh
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
