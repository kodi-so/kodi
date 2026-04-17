'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useEffect, useMemo, useState, useTransition } from 'react'
import {
  ArrowRight,
  Check,
  Copy,
  Plus,
  RefreshCcw,
  Sparkles,
  Trash2,
  UserRound,
  Video,
} from 'lucide-react'
import {
  deriveMeetingBotIdentity,
  getMeetingParticipationModeLabel,
} from '@kodi/db/client'
import {
  Alert,
  AlertDescription,
  Badge,
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  Input,
  Label,
  Skeleton,
} from '@kodi/ui'
import { useOrg } from '@/lib/org-context'
import { trpc } from '@/lib/trpc'
import { pageShellClass } from '@/lib/brand-styles'
import { getMeetingRuntimeCopy } from './_lib/runtime-state'

type MeetingListResponse = Awaited<ReturnType<typeof trpc.meeting.list.query>>
type MeetingListItem = MeetingListResponse['items']
type MeetingCopilotConfig = Awaited<
  ReturnType<typeof trpc.meeting.getCopilotSettings.query>
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
    case 'listening':
      return 'success' as const
    case 'admitted':
      return 'info' as const
    case 'processing':
    case 'summarizing':
    case 'joining':
    case 'scheduled':
    case 'preparing':
      return 'warning' as const
    case 'completed':
    case 'ended':
      return 'neutral' as const
    case 'failed':
      return 'destructive' as const
    default:
      return 'neutral' as const
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
    case 'summarizing':
      return 'Generating recap'
    case 'completed':
      return 'Recap ready'
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
  return getMeetingRuntimeCopy({
    provider: meeting.provider,
    status: meeting.status,
    metadata: meeting.metadata,
  }).snapshot
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
  const { activeOrg } = useOrg()
  const [meetings, setMeetings] = useState<MeetingListItem>([])
  const [nextCursor, setNextCursor] = useState<string | null>(null)
  const [loadingMore, setLoadingMore] = useState(false)
  const [copilotConfig, setCopilotConfig] =
    useState<MeetingCopilotConfig | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [meetingUrl, setMeetingUrl] = useState('')
  const [title, setTitle] = useState('')
  const [isStarting, startStartTransition] = useTransition()
  const [isRefreshing, startRefreshTransition] = useTransition()
  const [copiedField, setCopiedField] = useState<
    'display-name' | 'invite-email' | null
  >(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [dialogOpen, setDialogOpen] = useState(false)

  async function handleDeleteMeeting(e: React.MouseEvent, meetingId: string) {
    e.preventDefault()
    e.stopPropagation()
    if (deletingId || !activeOrg) return
    if (!confirm('Delete this meeting? This cannot be undone.')) return
    setDeletingId(meetingId)
    try {
      await trpc.meeting.delete.mutate({
        orgId: activeOrg.orgId,
        meetingSessionId: meetingId,
      })
      setMeetings((prev) => prev.filter((m) => m.id !== meetingId))
    } catch {
      // silently ignore — meeting may already be gone
    } finally {
      setDeletingId(null)
    }
  }

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
        const [listResult, nextCopilotConfig] = await Promise.all([
          trpc.meeting.list.query({ orgId, limit: 20 }),
          trpc.meeting.getCopilotSettings.query({ orgId }),
        ])
        if (cancelled) return
        setMeetings(listResult.items)
        setNextCursor(listResult.nextCursor)
        setCopilotConfig(nextCopilotConfig)
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
          const listResult = await trpc.meeting.list.query({
            orgId: activeOrg.orgId,
            limit: 20,
          })
          setMeetings(listResult.items)
          setNextCursor(listResult.nextCursor)
          setError(null)
        } catch (err) {
          setError(
            err instanceof Error ? err.message : 'Failed to refresh meetings.'
          )
        }
      })()
    })
  }

  async function loadMore() {
    if (!activeOrg || !nextCursor || loadingMore) return
    setLoadingMore(true)
    try {
      const listResult = await trpc.meeting.list.query({
        orgId: activeOrg.orgId,
        limit: 20,
        cursor: nextCursor,
      })
      setMeetings((prev) => [...prev, ...listResult.items])
      setNextCursor(listResult.nextCursor)
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Failed to load more meetings.'
      )
    } finally {
      setLoadingMore(false)
    }
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
          setDialogOpen(false)
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
          'summarizing',
        ].includes(meeting.status)
      ).length,
    [meetings]
  )

  const workspaceCopilotSettings = copilotConfig?.settings ?? null
  const meetingBotIdentity = useMemo(
    () =>
      activeOrg && workspaceCopilotSettings
        ? deriveMeetingBotIdentity({
            orgName: activeOrg.orgName,
            orgSlug: activeOrg.orgSlug,
            displayNameOverride: workspaceCopilotSettings.botDisplayName,
          })
        : null,
    [activeOrg, workspaceCopilotSettings]
  )

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

  if (!activeOrg) {
    return (
      <div className="flex min-h-full items-center justify-center p-6 text-sm text-muted-foreground">
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
    <div className={pageShellClass}>
      <div className="mx-auto w-full max-w-4xl px-6 py-8">
        {error && (
          <Alert variant="destructive" className="mb-6">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {/* Page header */}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-foreground">
              Meetings
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Review summaries, transcripts, and follow-ups from your meetings.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button
              onClick={() => void refresh()}
              variant="outline"
              size="sm"
              disabled={isRefreshing}
              className="gap-1.5"
            >
              <RefreshCcw
                size={14}
                className={isRefreshing ? 'animate-spin' : ''}
              />
              Refresh
            </Button>
            <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
              <DialogTrigger asChild>
                <Button size="sm" className="gap-1.5">
                  <Plus size={14} />
                  Start meeting
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Start a meeting</DialogTitle>
                  <DialogDescription>
                    Paste a Google Meet or Zoom link. Kodi will join, capture the
                    transcript, and generate a summary.
                  </DialogDescription>
                </DialogHeader>
                <div className="mt-5 space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="dialog-meeting-url">Meeting URL</Label>
                    <Input
                      id="dialog-meeting-url"
                      value={meetingUrl}
                      onChange={(e) => setMeetingUrl(e.target.value)}
                      placeholder="https://meet.google.com/abc-defg-hij"
                      className="h-10"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="dialog-meeting-title">
                      Title (optional)
                    </Label>
                    <Input
                      id="dialog-meeting-title"
                      value={title}
                      onChange={(e) => setTitle(e.target.value)}
                      placeholder="Weekly product sync"
                      className="h-10"
                    />
                  </div>
                  {workspaceCopilotSettings && (
                    <div className="flex flex-wrap gap-1.5">
                      <Badge variant="outline" className="text-xs">
                        {getMeetingParticipationModeLabel(
                          workspaceCopilotSettings.defaultParticipationMode
                        )}
                      </Badge>
                      {workspaceCopilotSettings.consentNoticeEnabled && (
                        <Badge variant="neutral" className="text-xs">
                          Disclosure on
                        </Badge>
                      )}
                    </div>
                  )}
                  <Button
                    onClick={() => void startMeeting()}
                    disabled={isStarting || meetingUrl.trim().length === 0}
                    className="w-full gap-2"
                  >
                    <Sparkles size={15} />
                    {isStarting ? 'Starting Kodi...' : 'Start meeting bot'}
                  </Button>
                </div>
              </DialogContent>
            </Dialog>
          </div>
        </div>

        {/* Live indicator */}
        {liveCount > 0 && (
          <div className="mt-5 inline-flex items-center gap-2 rounded-full border border-brand-success/20 bg-brand-success-soft px-3 py-1.5 text-xs font-medium text-brand-success">
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-brand-success" />
            {liveCount} live now
          </div>
        )}

        {/* Meetings list */}
        <div className="mt-6">
          {loading ? (
            <div className="space-y-2">
              {Array.from({ length: 5 }).map((_, i) => (
                <div
                  key={i}
                  className="rounded-xl border border-border bg-card p-4"
                >
                  <div className="flex items-center gap-3">
                    <Skeleton className="h-5 w-16 rounded-full" />
                    <Skeleton className="h-4 w-48" />
                    <div className="ml-auto">
                      <Skeleton className="h-4 w-24" />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : meetings.length === 0 ? (
            <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-border py-16 text-center">
              <div className="flex h-12 w-12 items-center justify-center rounded-xl border border-border bg-secondary text-muted-foreground">
                <Video size={20} />
              </div>
              <h3 className="mt-4 text-base font-medium text-foreground">
                No meetings yet
              </h3>
              <p className="mt-1.5 max-w-sm text-sm text-muted-foreground">
                Start with a Google Meet or Zoom link. Kodi will join the call
                and generate a summary when it's done.
              </p>
              <Button
                size="sm"
                className="mt-5 gap-1.5"
                onClick={() => setDialogOpen(true)}
              >
                <Plus size={14} />
                Start your first meeting
              </Button>
            </div>
          ) : (
            <div className="space-y-1.5">
              {meetings.map((meeting) => (
                <div key={meeting.id} className="group relative">
                  <Link
                    href={`/meetings/${meeting.id}`}
                    className="flex items-center gap-4 rounded-xl border border-border bg-card px-4 py-3.5 transition-colors hover:bg-secondary"
                  >
                    <Badge
                      variant={statusTone(meeting.status)}
                      className="shrink-0"
                    >
                      {statusLabel(meeting.status)}
                    </Badge>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-foreground">
                        {meeting.title ?? 'Untitled meeting'}
                      </p>
                      <p className="mt-0.5 truncate text-xs text-muted-foreground">
                        {meetingSnapshot(meeting)}
                      </p>
                    </div>
                    <div className="hidden items-center gap-3 sm:flex">
                      <span className="text-xs text-muted-foreground">
                        {formatProviderLabel(meeting.provider)}
                      </span>
                      <span className="whitespace-nowrap text-xs tabular-nums text-muted-foreground">
                        {formatDate(
                          meeting.actualStartAt ?? meeting.createdAt
                        )}
                      </span>
                      <ArrowRight
                        size={14}
                        className="text-muted-foreground transition-transform group-hover:translate-x-0.5"
                      />
                    </div>
                  </Link>
                  <button
                    type="button"
                    onClick={(e) => void handleDeleteMeeting(e, meeting.id)}
                    disabled={deletingId === meeting.id}
                    className="absolute right-14 top-1/2 hidden -translate-y-1/2 rounded-lg p-1.5 text-muted-foreground opacity-0 transition-opacity hover:text-destructive group-hover:opacity-100 disabled:opacity-50 sm:block"
                    title="Delete meeting"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              ))}
            </div>
          )}

          {nextCursor && !loading && (
            <div className="mt-4 flex justify-center">
              <Button
                variant="outline"
                size="sm"
                onClick={() => void loadMore()}
                disabled={loadingMore}
                className="gap-1.5"
              >
                {loadingMore && (
                  <RefreshCcw size={14} className="animate-spin" />
                )}
                {loadingMore ? 'Loading...' : 'Load more'}
              </Button>
            </div>
          )}
        </div>

        {/* Bot identity bar */}
        <div className="mt-10 rounded-xl border border-border bg-card px-5 py-4">
          <p className="text-[11px] font-medium uppercase tracking-widest text-muted-foreground">
            Bot identity
          </p>
          <div className="mt-3 flex flex-col gap-4 sm:flex-row sm:items-center sm:gap-6">
            <div className="flex items-center gap-3">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg border border-border bg-secondary text-muted-foreground">
                <UserRound size={14} />
              </div>
              <div className="min-w-0">
                <p className="text-[11px] text-muted-foreground">
                  Display name
                </p>
                <p className="text-sm font-medium text-foreground">
                  {workspaceMeetingBotIdentity.displayName}
                </p>
              </div>
              <button
                type="button"
                onClick={() =>
                  void copyIdentityValue(
                    workspaceMeetingBotIdentity.displayName,
                    'display-name'
                  )
                }
                className="rounded-md p-1 text-muted-foreground transition-colors hover:text-foreground"
                title="Copy display name"
              >
                {copiedField === 'display-name' ? (
                  <Check size={13} />
                ) : (
                  <Copy size={13} />
                )}
              </button>
            </div>
            <div className="hidden h-6 w-px bg-border sm:block" />
            <div className="flex items-center gap-3">
              <div className="min-w-0">
                <p className="text-[11px] text-muted-foreground">
                  Invite email
                </p>
                <p className="break-all text-sm font-medium text-foreground">
                  {workspaceMeetingBotIdentity.inviteEmail}
                </p>
              </div>
              <button
                type="button"
                onClick={() =>
                  void copyIdentityValue(
                    workspaceMeetingBotIdentity.inviteEmail,
                    'invite-email'
                  )
                }
                className="rounded-md p-1 text-muted-foreground transition-colors hover:text-foreground"
                title="Copy invite email"
              >
                {copiedField === 'invite-email' ? (
                  <Check size={13} />
                ) : (
                  <Copy size={13} />
                )}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
