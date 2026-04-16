'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useEffect, useMemo, useState, useTransition } from 'react'
import {
  ArrowRight,
  Check,
  CheckCircle2,
  Copy,
  Mail,
  RefreshCcw,
  Sparkles,
  Trash2,
  UserRound,
  Video,
} from 'lucide-react'
import {
  buildMeetingCopilotDisclosure,
  deriveMeetingBotIdentity,
  formatRetentionDays,
  getMeetingParticipationModeLabel,
} from '@kodi/db/client'
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
  heroPanelClass,
  pageShellClass,
  quietTextClass,
} from '@/lib/brand-styles'
import { getMeetingRuntimeCopy } from './_lib/runtime-state'

type MeetingListResponse = Awaited<ReturnType<typeof trpc.meeting.list.query>>
type MeetingListItem = MeetingListResponse['items']
type MeetingCopilotConfig = Awaited<
  ReturnType<typeof trpc.meeting.getCopilotSettings.query>
>

function setupCheckVariant(
  state: MeetingCopilotConfig['setup']['checks'][number]['state']
) {
  switch (state) {
    case 'ready':
      return 'success' as const
    case 'missing':
      return 'destructive' as const
    default:
      return 'warning' as const
  }
}

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
      return 'warning' as const
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

function meetingOutcomeLabel(meeting: MeetingListItem[number]) {
  switch (meeting.status) {
    case 'completed':
      return 'Recap ready'
    case 'summarizing':
      return 'Generating recap'
    case 'listening':
      return 'Transcript live'
    case 'processing':
      return 'Notes incoming'
    case 'failed':
      return 'Needs retry'
    case 'ended':
      return meeting.liveSummary ? 'Summary ready' : 'Review available'
    default:
      return 'In progress'
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

  async function handleDeleteMeeting(e: React.MouseEvent, meetingId: string) {
    e.preventDefault()
    e.stopPropagation()
    if (deletingId || !activeOrg) return
    if (!confirm('Delete this meeting? This cannot be undone.')) return
    setDeletingId(meetingId)
    try {
      await trpc.meeting.delete.mutate({ orgId: activeOrg.orgId, meetingSessionId: meetingId })
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
      setError(err instanceof Error ? err.message : 'Failed to load more meetings.')
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
      <div className="flex min-h-full items-center justify-center p-6 text-sm text-brand-subtle">
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
      <div className="mx-auto flex w-full max-w-[96rem] flex-col gap-6 px-4 py-8">
        {error && (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1.18fr)_minmax(21rem,27rem)]">
          <div className="min-w-0 space-y-6">
            <section
              className={`${heroPanelClass} min-w-0 rounded-[2rem] p-6 lg:p-8`}
            >
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
                    Paste the meeting link, admit Kodi if needed, then review
                    the summary and transcript here.
                  </p>
                </div>
                <div className="min-w-0 rounded-[1.4rem] border border-border bg-secondary p-4 md:col-span-2 2xl:col-span-1">
                  <p className="text-[11px] uppercase tracking-[0.2em] text-muted-foreground">
                    Current scope
                  </p>
                  <p className="mt-3 text-sm leading-6 text-foreground">
                    Live start now supports Google Meet and Zoom links through
                    the shared meeting runtime. Stable invite identity is in
                    place, with invite-by-email automation and auto-join rules
                    coming next.
                  </p>
                </div>
              </div>
            </section>

            <section className="space-y-4">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
                <div>
                  <h2 className="text-2xl font-semibold tracking-tight text-foreground">
                    Recent meetings
                  </h2>
                  <p className={`mt-1 max-w-2xl text-sm ${quietTextClass}`}>
                    Open any session to review the summary, grouped transcript,
                    and the follow-up that seems worth acting on.
                  </p>
                </div>

                <Button
                  onClick={() => void refresh()}
                  variant="ghost"
                  className="gap-2 border border-brand-line bg-brand-elevated text-brand-quiet hover:bg-secondary hover:text-foreground"
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
                    <Card key={index} className="border-brand-line">
                      <CardContent className="space-y-4 p-5">
                        <Skeleton className="h-4 w-28" />
                        <Skeleton className="h-5 w-56" />
                        <Skeleton className="h-10" />
                      </CardContent>
                    </Card>
                  ))}
                </div>
              ) : meetings.length === 0 ? (
                <Card className="border-brand-line">
                  <CardContent className="flex flex-col gap-5 p-8">
                    <div className="flex h-12 w-12 items-center justify-center rounded-[1.15rem] border border-brand-line bg-brand-elevated text-foreground">
                      <Video size={18} />
                    </div>
                    <div className="space-y-2">
                      <h3 className="text-xl font-medium text-foreground">
                        No meetings yet
                      </h3>
                      <p
                        className={`max-w-xl text-sm leading-6 ${quietTextClass}`}
                      >
                        Start with a Google Meet or Zoom link on the right. Once
                        Kodi joins, this page becomes the running record of
                        summary, transcript, and follow-up for the workspace.
                      </p>
                    </div>
                  </CardContent>
                </Card>
              ) : (
                <div className="overflow-hidden rounded-[1.75rem] border border-brand-line bg-card">
                  <div className="max-h-[30rem] overflow-y-auto">
                  {meetings.map((meeting, index) => (
                    <div
                      key={meeting.id}
                      className={`group relative ${index < meetings.length - 1 ? 'border-b border-brand-line' : ''}`}
                    >
                      <Link
                        href={`/meetings/${meeting.id}`}
                        className="block px-5 py-4 transition hover:bg-secondary"
                      >
                        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                          <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-center gap-2">
                              <Badge variant={statusTone(meeting.status)}>
                                {statusLabel(meeting.status)}
                              </Badge>
                              <Badge variant="neutral">
                                {meetingOutcomeLabel(meeting)}
                              </Badge>
                              <span className="text-xs text-brand-subtle">
                                {formatProviderLabel(meeting.provider)}
                              </span>
                            </div>

                            <div className="mt-3 flex items-start justify-between gap-4">
                              <div className="min-w-0 flex-1">
                                <h3 className="truncate text-base font-medium text-foreground">
                                  {meeting.title ?? 'Untitled meeting'}
                                </h3>
                                <p className={`mt-1 truncate text-sm ${quietTextClass}`}>
                                  {meetingSnapshot(meeting)}
                                </p>
                              </div>

                              <div className="hidden shrink-0 items-center gap-2 text-sm text-brand-quiet sm:flex pr-8">
                                <span>
                                  {formatDate(meeting.actualStartAt ?? meeting.createdAt)}
                                </span>
                                <ArrowRight
                                  size={15}
                                  className="transition group-hover:translate-x-0.5"
                                />
                              </div>
                            </div>

                            <div className="mt-3 flex items-center justify-between gap-3 text-xs text-brand-subtle sm:hidden">
                              <span>
                                {formatDate(meeting.actualStartAt ?? meeting.createdAt)}
                              </span>
                              <span className="inline-flex items-center gap-2 text-foreground">
                                Open meeting
                                <ArrowRight size={14} />
                              </span>
                            </div>
                          </div>
                        </div>
                      </Link>
                      <button
                        type="button"
                        onClick={(e) => void handleDeleteMeeting(e, meeting.id)}
                        disabled={deletingId === meeting.id}
                        className="absolute right-4 top-1/2 -translate-y-1/2 rounded-lg p-1.5 text-muted-foreground opacity-0 transition-opacity hover:text-destructive group-hover:opacity-100 disabled:opacity-50"
                        title="Delete meeting"
                      >
                        <Trash2 size={15} />
                      </button>
                    </div>
                  ))}
                  </div>
                </div>
              )}

              {nextCursor && !loading && (
                <div className="flex justify-center pt-2">
                  <Button
                    variant="ghost"
                    className="gap-2 border border-brand-line bg-brand-elevated text-brand-quiet hover:bg-secondary hover:text-foreground"
                    onClick={() => void loadMore()}
                    disabled={loadingMore}
                  >
                    {loadingMore ? (
                      <RefreshCcw size={15} className="animate-spin" />
                    ) : null}
                    {loadingMore ? 'Loading…' : 'Load more'}
                  </Button>
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
                      Bring Kodi into a live meeting
                    </h2>
                    <p className="text-sm leading-6 text-muted-foreground">
                      Start from a live Google Meet or Zoom URL. The meeting
                      page becomes the control room once Kodi gets in.
                    </p>
                  </div>

                  <div className="hidden h-11 w-11 items-center justify-center rounded-[1.1rem] border border-border bg-secondary text-foreground sm:flex">
                    <Video size={18} />
                  </div>
                </div>

                <div className="mt-6 space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="meeting-url" className="text-foreground">
                      Meeting URL
                    </Label>
                    <Input
                      id="meeting-url"
                      value={meetingUrl}
                      onChange={(event) => setMeetingUrl(event.target.value)}
                      placeholder="https://meet.google.com/abc-defg-hij or https://zoom.us/j/123456789"
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
                    Start here for a live call. Admit Kodi if the room requires
                    it, then come back to this workspace to review the summary
                    and transcript.
                  </div>

                  {workspaceCopilotSettings && (
                    <div className="rounded-[1.2rem] border border-brand-line bg-brand-elevated p-4">
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge variant="outline">
                          {getMeetingParticipationModeLabel(
                            workspaceCopilotSettings.defaultParticipationMode
                          )}
                        </Badge>
                        {workspaceCopilotSettings.allowMeetingHostControls && (
                          <Badge variant="neutral">Starter controls on</Badge>
                        )}
                        {workspaceCopilotSettings.consentNoticeEnabled && (
                          <Badge variant="neutral">Disclosure on</Badge>
                        )}
                      </div>
                      <div className="mt-3 space-y-2 text-sm leading-6 text-foreground">
                        {buildMeetingCopilotDisclosure(
                          workspaceCopilotSettings
                        ).map((line) => (
                          <p key={line}>{line}</p>
                        ))}
                      </div>
                    </div>
                  )}

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
                        Workspace meeting copilot
                      </p>
                      <h3 className="text-xl font-semibold text-foreground">
                        Identity and live defaults
                      </h3>
                      <p className="text-sm leading-6 text-muted-foreground">
                        This is the identity and default live participation
                        contract that new meetings inherit before any
                        meeting-level override is applied.
                      </p>
                    </div>
                    <Badge variant="outline">Phase 0</Badge>
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

                  {workspaceCopilotSettings && (
                    <div className="rounded-[1.2rem] border border-border bg-background p-4">
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge variant="outline">
                          {getMeetingParticipationModeLabel(
                            workspaceCopilotSettings.defaultParticipationMode
                          )}
                        </Badge>
                        {workspaceCopilotSettings.chatResponsesRequireExplicitAsk && (
                          <Badge variant="neutral">Chat asks only</Badge>
                        )}
                        {workspaceCopilotSettings.voiceResponsesRequireExplicitPrompt && (
                          <Badge variant="neutral">
                            Voice requests only
                          </Badge>
                        )}
                      </div>
                      <div className="mt-4 grid gap-3 sm:grid-cols-2">
                        <div className="rounded-[1rem] border border-brand-line bg-brand-elevated px-4 py-3">
                          <p className="text-[11px] uppercase tracking-[0.2em] text-brand-subtle">
                            Transcript retention
                          </p>
                          <p className="mt-2 text-sm text-foreground">
                            {formatRetentionDays(
                              workspaceCopilotSettings.transcriptRetentionDays
                            )}
                          </p>
                        </div>
                        <div className="rounded-[1rem] border border-brand-line bg-brand-elevated px-4 py-3">
                          <p className="text-[11px] uppercase tracking-[0.2em] text-brand-subtle">
                            Artifact retention
                          </p>
                          <p className="mt-2 text-sm text-foreground">
                            {formatRetentionDays(
                              workspaceCopilotSettings.artifactRetentionDays
                            )}
                          </p>
                        </div>
                      </div>
                    </div>
                  )}

                  <div className="mt-4 rounded-[1.2rem] border border-dashed border-border bg-background p-4 text-sm leading-6 text-foreground">
                    {workspaceMeetingBotIdentity.inviteInstructions.map(
                      (instruction) => (
                        <p key={instruction} className="break-words">
                          {instruction}
                        </p>
                      )
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="border-border bg-card">
              <CardContent className="p-6">
                <div className="space-y-2">
                  <Badge variant="outline">Recall-based join</Badge>
                  <h2 className="text-2xl font-semibold text-foreground">
                    Zoom works through the same join flow
                  </h2>
                  <p className="text-sm leading-6 text-muted-foreground">
                    Paste a live Zoom or Google Meet URL above and Kodi will
                    join through Recall. There is no separate Zoom connection
                    step anymore.
                  </p>
                </div>
              </CardContent>
            </Card>

            {copilotConfig && (
              <Card className="border-border bg-card">
                <CardContent className="p-6">
                  <div className="space-y-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge variant="outline">Pilot contract</Badge>
                      <Badge variant="neutral">Phase 0</Badge>
                    </div>
                    <h2 className="text-2xl font-semibold text-foreground">
                      Launch checklist
                    </h2>
                    <p className="text-sm leading-6 text-muted-foreground">
                      The production path is Recall-first. Use this checklist to
                      verify the environment and run a real validation call
                      before broad rollout.
                    </p>
                  </div>

                  <div className="mt-6 space-y-3">
                    {copilotConfig.setup.checks.map((check) => (
                      <div
                        key={check.key}
                        className="rounded-[1.25rem] border border-brand-line bg-brand-elevated p-4"
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="space-y-1">
                            <p className="text-sm font-medium text-foreground">
                              {check.label}
                            </p>
                            <p className="text-xs leading-5 text-brand-quiet">
                              {check.detail}
                            </p>
                          </div>
                          <Badge variant={setupCheckVariant(check.state)}>
                            {check.state === 'ready'
                              ? 'Ready'
                              : check.state === 'missing'
                                ? 'Missing'
                                : 'Manual'}
                          </Badge>
                        </div>
                      </div>
                    ))}
                  </div>

                  <div className="mt-4 rounded-[1.25rem] border border-dashed border-brand-line bg-brand-elevated p-4 text-sm leading-6 text-brand-quiet">
                    <div className="flex items-start gap-3">
                      <CheckCircle2
                        size={16}
                        className="mt-1 shrink-0 text-brand-success"
                      />
                      <p>
                        Settings and setup defaults can be updated from the
                        General settings page before the next meeting starts.
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
