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

function statusAccentColor(status: string) {
  switch (status) {
    case 'listening':
      return 'bg-brand-success'
    case 'admitted':
      return 'bg-brand-info'
    case 'processing':
    case 'summarizing':
    case 'joining':
    case 'scheduled':
    case 'preparing':
      return 'bg-brand-warning'
    case 'completed':
      return 'bg-brand-accent'
    case 'ended':
      return 'bg-brand-line'
    case 'failed':
      return 'bg-brand-danger'
    default:
      return 'bg-brand-line'
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
      <div className="mx-auto w-full max-w-4xl px-6 py-10">
        {error && (
          <Alert variant="destructive" className="mb-6">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {/* Page header */}
        <div className="flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h1 className="text-3xl font-semibold tracking-tight text-foreground">
              Meetings
            </h1>
            <p className="mt-2 max-w-lg text-sm leading-relaxed text-muted-foreground">
              Summaries, transcripts, and follow-ups from every conversation
              Kodi has joined.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button
              onClick={() => void refresh()}
              variant="ghost"
              size="sm"
              disabled={isRefreshing}
              className="gap-1.5 text-muted-foreground"
            >
              <RefreshCcw
                size={14}
                className={isRefreshing ? 'animate-spin' : ''}
              />
              Refresh
            </Button>
            <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
              <DialogTrigger asChild>
                <Button className="gap-2 shadow-soft">
                  <Plus size={15} />
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
          <div className="mt-6 inline-flex items-center gap-2 rounded-full bg-brand-success-soft px-3.5 py-1.5 text-xs font-medium text-brand-success ring-1 ring-brand-success/15">
            <span className="h-2 w-2 animate-pulse rounded-full bg-brand-success" />
            {liveCount} session{liveCount > 1 ? 's' : ''} live
          </div>
        )}

        {/* Meetings list */}
        <div className="mt-8">
          {loading ? (
            <div className="space-y-3">
              {Array.from({ length: 5 }).map((_, i) => (
                <div
                  key={i}
                  className="flex items-center gap-4 rounded-xl border border-border bg-card px-5 py-4 shadow-sm"
                >
                  <Skeleton className="h-5 w-16 rounded-full" />
                  <div className="flex-1 space-y-2">
                    <Skeleton className="h-4 w-48" />
                    <Skeleton className="h-3 w-64" />
                  </div>
                  <Skeleton className="h-4 w-24" />
                </div>
              ))}
            </div>
          ) : meetings.length === 0 ? (
            <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-border bg-card/50 py-20 text-center">
              <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-secondary text-muted-foreground shadow-sm ring-1 ring-border">
                <Video size={22} />
              </div>
              <h3 className="mt-5 text-lg font-medium text-foreground">
                No meetings yet
              </h3>
              <p className="mt-2 max-w-md text-sm leading-relaxed text-muted-foreground">
                Start with a Google Meet or Zoom link. Kodi joins the call,
                captures everything, and turns it into a useful summary.
              </p>
              <Button
                className="mt-6 gap-2 shadow-soft"
                onClick={() => setDialogOpen(true)}
              >
                <Plus size={15} />
                Start your first meeting
              </Button>
            </div>
          ) : (
            <div className="space-y-2">
              {meetings.map((meeting) => (
                <div
                  key={meeting.id}
                  className="group flex items-stretch overflow-hidden rounded-xl border border-border bg-card shadow-sm transition-all hover:shadow-md hover:border-brand-line-strong"
                >
                  {/* Status accent bar */}
                  <div
                    className={`w-1 shrink-0 ${statusAccentColor(meeting.status)}`}
                  />

                  {/* Clickable content area */}
                  <Link
                    href={`/meetings/${meeting.id}`}
                    className="flex min-w-0 flex-1 items-center gap-4 px-4 py-3.5 transition-colors hover:bg-secondary/50"
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
                    <div className="hidden items-center gap-3 text-xs text-muted-foreground sm:flex">
                      <span>{formatProviderLabel(meeting.provider)}</span>
                      <span className="whitespace-nowrap tabular-nums">
                        {formatDate(
                          meeting.actualStartAt ?? meeting.createdAt
                        )}
                      </span>
                      <ArrowRight
                        size={14}
                        className="transition-transform group-hover:translate-x-0.5"
                      />
                    </div>
                  </Link>

                  {/* Delete action — own space, no overlap */}
                  <div className="flex w-9 shrink-0 items-center justify-center">
                    <button
                      type="button"
                      onClick={(e) =>
                        void handleDeleteMeeting(e, meeting.id)
                      }
                      disabled={deletingId === meeting.id}
                      className="text-muted-foreground/0 transition-colors group-hover:text-muted-foreground hover:text-destructive disabled:opacity-50"
                      title="Delete meeting"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {nextCursor && !loading && (
            <div className="mt-6 flex justify-center">
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

        {/* Bot identity */}
        <div className="mt-12 rounded-xl border border-border bg-card px-5 py-4 shadow-sm">
          <p className="text-[11px] font-medium uppercase tracking-widest text-muted-foreground">
            Bot identity
          </p>
          <div className="mt-3 flex flex-col gap-4 sm:flex-row sm:items-center sm:gap-6">
            <div className="flex items-center gap-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-secondary text-muted-foreground ring-1 ring-border">
                <UserRound size={15} />
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
                className="rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
                title="Copy display name"
              >
                {copiedField === 'display-name' ? (
                  <Check size={13} />
                ) : (
                  <Copy size={13} />
                )}
              </button>
            </div>
            <div className="hidden h-8 w-px bg-border sm:block" />
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
                className="rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
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
