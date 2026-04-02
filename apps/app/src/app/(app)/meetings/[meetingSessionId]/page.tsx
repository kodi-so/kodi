'use client'

import Link from 'next/link'
import { useParams } from 'next/navigation'
import type { ReactNode } from 'react'
import { useEffect, useMemo, useState } from 'react'
import {
  ArrowLeft,
  Bot,
  Clock3,
  Mic2,
  Radio,
  RefreshCw,
  Users,
} from 'lucide-react'
import {
  Alert,
  AlertDescription,
  Badge,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Separator,
  Skeleton,
} from '@kodi/ui'
import { useOrg } from '@/lib/org-context'
import { trpc } from '@/lib/trpc'

type MeetingConsole = NonNullable<
  Awaited<ReturnType<typeof trpc.meeting.getConsole.query>>
>
type MeetingRecord = MeetingConsole['meeting']
type MeetingParticipants = MeetingConsole['participants']
type MeetingTranscript = MeetingConsole['transcript']
type MeetingLiveState = MeetingConsole['liveState'] | null
type MeetingEventFeed = MeetingConsole['events']
type LooseBadgeProps = {
  className?: string
  children?: ReactNode
}

function asRecord(value: unknown) {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null
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

function formatTime(value: Date | string | null | undefined) {
  if (!value) return 'Not available'
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return 'Not available'
  return parsed.toLocaleTimeString([], {
    hour: 'numeric',
    minute: '2-digit',
    second: '2-digit',
  })
}

function truncateMiddle(value: string | null | undefined, max = 28) {
  if (!value) return 'Not available'
  if (value.length <= max) return value

  const edge = Math.max(6, Math.floor((max - 3) / 2))
  return `${value.slice(0, edge)}...${value.slice(-edge)}`
}

function pollIntervalForStatus(status: string | null | undefined) {
  switch (status) {
    case 'preparing':
    case 'joining':
    case 'admitted':
    case 'listening':
      return 3000
    case 'processing':
    case 'scheduled':
      return 8000
    case 'ended':
    case 'failed':
      return 15000
    default:
      return 10000
  }
}

function statusTone(status: string) {
  switch (status) {
    case 'listening':
      return 'border-emerald-500/30 bg-emerald-500/15 text-emerald-300'
    case 'admitted':
      return 'border-cyan-500/30 bg-cyan-500/15 text-cyan-200'
    case 'processing':
      return 'border-violet-500/30 bg-violet-500/15 text-violet-200'
    case 'joining':
    case 'scheduled':
    case 'preparing':
      return 'border-amber-500/30 bg-amber-500/15 text-amber-200'
    case 'ended':
      return 'border-sky-500/30 bg-sky-500/15 text-sky-200'
    case 'failed':
      return 'border-red-500/30 bg-red-500/15 text-red-200'
    default:
      return 'border-zinc-700 bg-zinc-800 text-zinc-300'
  }
}

function statusLabel(status: string) {
  switch (status) {
    case 'listening':
      return 'listening'
    case 'admitted':
      return 'admitted'
    case 'processing':
      return 'processing'
    case 'preparing':
      return 'preparing'
    case 'ended':
      return 'ended'
    default:
      return status
  }
}

function statusDescription(status: string) {
  switch (status) {
    case 'scheduled':
      return 'Kodi has a meeting record but has not started preparing a live bot session yet.'
    case 'preparing':
      return 'Kodi is preparing the provider session and assembling the meeting bot request.'
    case 'joining':
      return 'The meeting bot is trying to join the call and may still be waiting on provider setup.'
    case 'admitted':
      return 'The bot has reached the call and is waiting to begin active listening.'
    case 'listening':
      return 'The bot is in the meeting and Kodi should be receiving realtime participant or transcript updates.'
    case 'processing':
      return 'The live session has moved into downstream processing or review work.'
    case 'ended':
      return 'The meeting session has ended and no further live updates are expected.'
    case 'failed':
      return 'The live meeting session failed and likely needs a retry or setup fix before it can continue.'
    default:
      return 'Kodi has recorded this meeting session but has not attached a richer runtime explanation yet.'
  }
}

function formatProviderLabel(provider: string) {
  switch (provider) {
    case 'google_meet':
      return 'Google Meet'
    case 'zoom':
      return 'Zoom'
    default:
      return provider.replace(/_/g, ' ')
  }
}

function formatSourceLabel(source: string) {
  switch (source) {
    case 'recall_webhook':
      return 'Recall webhook'
    case 'zoom_webhook':
      return 'Zoom webhook'
    case 'rtms':
      return 'RTMS'
    case 'agent':
      return 'Agent'
    case 'worker':
      return 'Worker'
    case 'kodi_ui':
      return 'Kodi UI'
    default:
      return source.replace(/_/g, ' ')
  }
}

function formatEventLabel(eventType: string) {
  switch (eventType) {
    case 'meeting.transcript.segment_received':
      return 'Transcript'
    case 'participant.joined':
      return 'Participant joined'
    case 'participant.updated':
      return 'Participant updated'
    case 'participant.left':
      return 'Participant left'
    case 'meeting.prepared':
      return 'Prepared'
    case 'meeting.joining':
      return 'Joining'
    case 'meeting.joined':
      return 'Joined'
    case 'meeting.admitted':
      return 'Admitted'
    case 'meeting.started':
      return 'Started'
    case 'meeting.ended':
      return 'Ended'
    case 'meeting.failed':
      return 'Failed'
    case 'meeting.health.updated':
      return 'Health'
    default:
      return eventType.replace(/^meeting\./, '').replace(/\./g, ' ')
  }
}

function describeEvent(event: MeetingEventFeed[number]) {
  const payload = asRecord(event.payload)
  if (!payload) return null

  if (event.eventType === 'meeting.transcript.segment_received') {
    const transcript = asRecord(payload.transcript)
    const speaker = asRecord(transcript?.speaker)
    const speakerName =
      typeof speaker?.displayName === 'string'
        ? speaker.displayName
        : typeof transcript?.speakerName === 'string'
          ? transcript.speakerName
          : 'Unknown speaker'
    const content =
      typeof transcript?.content === 'string' ? transcript.content : null

    if (!content) return speakerName
    return `${speakerName}: ${content}`
  }

  if (
    event.eventType === 'participant.joined' ||
    event.eventType === 'participant.updated' ||
    event.eventType === 'participant.left'
  ) {
    const participant = asRecord(payload.participant)
    return (
      (typeof participant?.displayName === 'string' && participant.displayName) ||
      (typeof participant?.email === 'string' && participant.email) ||
      'Participant record updated'
    )
  }

  if (
    event.eventType === 'meeting.joining' ||
    event.eventType === 'meeting.joined' ||
    event.eventType === 'meeting.admitted' ||
    event.eventType === 'meeting.started' ||
    event.eventType === 'meeting.ended' ||
    event.eventType === 'meeting.failed'
  ) {
    const errorMessage =
      typeof payload.errorMessage === 'string' ? payload.errorMessage : null
    const state = typeof payload.state === 'string' ? payload.state : null
    return errorMessage ?? state
  }

  if (event.eventType === 'meeting.health.updated') {
    const health = asRecord(payload.health)
    const status = typeof health?.status === 'string' ? health.status : null
    const detail = typeof health?.detail === 'string' ? health.detail : null
    return [status, detail].filter(Boolean).join(' - ') || null
  }

  return null
}

function ConsoleMetric(props: {
  label: string
  value: string
  hint?: string
}) {
  return (
    <div className="rounded-[1.5rem] border border-zinc-800 bg-[linear-gradient(180deg,_rgba(18,18,22,0.96),_rgba(10,10,14,0.9))] px-4 py-4">
      <p className="text-[11px] uppercase tracking-[0.2em] text-zinc-500">
        {props.label}
      </p>
      <p className="mt-3 text-lg font-semibold text-white">{props.value}</p>
      {props.hint && <p className="mt-2 text-xs leading-5 text-zinc-500">{props.hint}</p>}
    </div>
  )
}

function ConsoleDetail(props: {
  label: string
  value: string
  tone?: 'default' | 'accent'
}) {
  return (
    <div className="flex items-start justify-between gap-4 py-3">
      <p className="text-xs uppercase tracking-[0.18em] text-zinc-500">
        {props.label}
      </p>
      <p
        className={
          props.tone === 'accent'
            ? 'max-w-[16rem] text-right text-sm font-medium text-zinc-100'
            : 'max-w-[16rem] text-right text-sm text-zinc-300'
        }
      >
        {props.value}
      </p>
    </div>
  )
}

const UiBadge = Badge as unknown as (props: LooseBadgeProps) => JSX.Element

export default function MeetingDetailsPage() {
  const params = useParams<{ meetingSessionId: string }>()
  const meetingSessionId = params.meetingSessionId
  const { activeOrg } = useOrg()
  const orgId = activeOrg?.orgId ?? null

  const [consoleData, setConsoleData] = useState<MeetingConsole | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [lastRefreshedAt, setLastRefreshedAt] = useState<Date | null>(null)

  const pollIntervalMs = useMemo(
    () => pollIntervalForStatus(consoleData?.meeting.status),
    [consoleData?.meeting.status]
  )

  useEffect(() => {
    if (!orgId || !meetingSessionId) {
      setLoading(false)
      return
    }

    const currentOrgId = orgId
    let cancelled = false

    async function load(showLoadingState = false) {
      if (showLoadingState) setLoading(true)

      try {
        const next = await trpc.meeting.getConsole.query({
          orgId: currentOrgId,
          meetingSessionId,
          transcriptLimit: 200,
          eventLimit: 60,
        })

        if (cancelled) return
        setConsoleData(next as MeetingConsole | null)
        setLastRefreshedAt(new Date())
        setError(null)
      } catch (err) {
        if (cancelled) return
        setError(
          err instanceof Error ? err.message : 'Failed to load meeting session.'
        )
      } finally {
        if (!cancelled && showLoadingState) setLoading(false)
      }
    }

    void load(true)
    const interval = window.setInterval(() => {
      void load()
    }, pollIntervalMs)

    return () => {
      cancelled = true
      window.clearInterval(interval)
    }
  }, [orgId, meetingSessionId, pollIntervalMs])

  const meeting = consoleData?.meeting ?? null
  const participants: MeetingParticipants = consoleData?.participants ?? []
  const transcript: MeetingTranscript = consoleData?.transcript ?? []
  const liveState: MeetingLiveState = consoleData?.liveState ?? null
  const events: MeetingEventFeed = consoleData?.events ?? []

  const chronologicalTranscript = useMemo(() => {
    return [...transcript].reverse()
  }, [transcript])

  const meetingMetadata = useMemo(() => asRecord(meeting?.metadata), [meeting?.metadata])

  const rtmsGateway = useMemo(() => {
    const candidate = asRecord(meetingMetadata?.rtmsGateway)
    return candidate
  }, [meetingMetadata])

  const failureReason = useMemo(() => {
    const failure = asRecord(meetingMetadata?.failure)
    const kind = typeof failure?.kind === 'string' ? failure.kind : null
    const retryable =
      typeof failure?.retryable === 'boolean' ? failure.retryable : null
    const message =
      typeof meetingMetadata?.lastErrorMessage === 'string'
        ? meetingMetadata.lastErrorMessage
        : typeof failure?.message === 'string'
          ? failure.message
          : null

    if (!kind && !message) return null

    const retryText =
      retryable === null ? null : retryable ? 'Retryable' : 'Needs manual fix'

    return [kind, retryText, message].filter(Boolean).join(' - ')
  }, [meetingMetadata])

  const providerRuntimeSource = useMemo(() => {
    const transport =
      typeof meetingMetadata?.transport === 'string'
        ? meetingMetadata.transport
        : rtmsGateway && typeof rtmsGateway.status === 'string'
          ? 'rtms'
          : null

    if (!meeting) return 'Unknown provider'
    if (!transport) return formatProviderLabel(meeting.provider)

    return `${formatProviderLabel(meeting.provider)} via ${transport}`
  }, [meeting, meetingMetadata, rtmsGateway])

  const sourceLabels = useMemo(() => {
    return [...new Set(events.map((event) => formatSourceLabel(event.source)))]
  }, [events])

  const inCallParticipants = useMemo(() => {
    return participants.filter((participant) => !participant.leftAt)
  }, [participants])

  const latestActivityAt = useMemo(() => {
    const candidates = [
      events[0]?.occurredAt,
      transcript[0]?.createdAt,
      liveState?.createdAt,
      meeting?.updatedAt,
    ]
      .filter(Boolean)
      .map((value) => new Date(value as Date | string))
      .filter((value) => !Number.isNaN(value.getTime()))

    if (candidates.length === 0) return null

    return candidates.sort((left, right) => right.getTime() - left.getTime())[0]
  }, [events, transcript, liveState?.createdAt, meeting?.updatedAt])

  const runtimeDetails = useMemo(() => {
    if (!meeting) return []

    return [
      {
        label: 'Provider source',
        value: providerRuntimeSource,
      },
      {
        label: 'Bot session',
        value: truncateMiddle(meeting.providerBotSessionId),
      },
      {
        label: 'Meeting ID',
        value: truncateMiddle(meeting.providerMeetingId),
      },
      {
        label: 'Instance ID',
        value: truncateMiddle(
          meeting.providerMeetingInstanceId ?? meeting.providerMeetingUuid
        ),
      },
    ]
  }, [meeting, providerRuntimeSource])

  if (!activeOrg) {
    return (
      <div className="flex min-h-full items-center justify-center p-6 text-sm text-zinc-500">
        Select a workspace to view meetings.
      </div>
    )
  }

  if (loading) {
    return (
      <div className="mx-auto flex max-w-6xl flex-col gap-6 px-4 py-8">
        <Skeleton className="h-9 w-48 bg-zinc-800" />
        <Skeleton className="h-[220px] bg-zinc-800" />
        <div className="grid gap-6 lg:grid-cols-[1.15fr_0.85fr]">
          <Skeleton className="h-[520px] bg-zinc-800" />
          <Skeleton className="h-[520px] bg-zinc-800" />
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-8">
        <Alert className="border-red-500/30 bg-red-500/10 text-red-200">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      </div>
    )
  }

  if (!meeting) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-8">
        <Alert className="border-zinc-700 bg-zinc-900/70 text-zinc-300">
          <AlertDescription>
            This meeting session was not found for the current workspace.
          </AlertDescription>
        </Alert>
      </div>
    )
  }

  return (
    <div className="min-h-full bg-[radial-gradient(circle_at_top_left,_rgba(96,165,250,0.08),_transparent_34%),linear-gradient(180deg,_rgba(23,23,28,0.45),_rgba(8,8,12,0.98))]">
      <div className="mx-auto flex max-w-6xl flex-col gap-6 px-4 py-8">
        <div className="overflow-hidden rounded-[2rem] border border-zinc-800 bg-[linear-gradient(180deg,_rgba(20,20,24,0.94),_rgba(10,10,14,0.92))] shadow-2xl shadow-black/25">
          <div className="border-b border-zinc-800/80 px-6 py-5">
            <Link
              href="/meetings"
              className="inline-flex w-fit items-center gap-2 text-sm text-zinc-400 transition hover:text-white"
            >
              <ArrowLeft size={16} />
              Back to meetings
            </Link>
          </div>

          <div className="grid gap-6 px-6 py-6 lg:grid-cols-[1.2fr_0.8fr]">
            <div className="space-y-4">
              <div className="flex flex-wrap items-center gap-2">
                <UiBadge className={statusTone(meeting.status)}>
                  {statusLabel(meeting.status)}
                </UiBadge>
                <UiBadge className="border-zinc-700 bg-zinc-800 text-zinc-300">
                  {formatProviderLabel(meeting.provider)}
                </UiBadge>
                <UiBadge className="border-zinc-700 bg-zinc-900/80 text-zinc-400">
                  refresh {Math.round(pollIntervalMs / 1000)}s
                </UiBadge>
              </div>

              <div>
                <h1 className="text-3xl font-semibold tracking-tight text-white">
                  {meeting.title ?? 'Untitled meeting'}
                </h1>
                <p className="mt-2 max-w-2xl text-sm leading-6 text-zinc-400">
                  Live meeting console for provider state, participant activity, and transcript flow.
                </p>
                <p className="mt-3 text-xs uppercase tracking-[0.18em] text-zinc-500">
                  Meeting session {meeting.id}
                </p>
              </div>
            </div>

            <div className="grid gap-3 text-sm text-zinc-300 sm:grid-cols-2">
              <div className="rounded-[1.5rem] border border-zinc-800 bg-zinc-950/70 px-4 py-4">
                <div className="flex items-center gap-2 text-zinc-500">
                  <Clock3 size={14} />
                  Started
                </div>
                <p className="mt-3 text-white">
                  {formatDate(meeting.actualStartAt ?? meeting.createdAt)}
                </p>
              </div>
              <div className="rounded-[1.5rem] border border-zinc-800 bg-zinc-950/70 px-4 py-4">
                <div className="flex items-center gap-2 text-zinc-500">
                  <Clock3 size={14} />
                  Ended
                </div>
                <p className="mt-3 text-white">{formatDate(meeting.endedAt)}</p>
              </div>
            </div>
          </div>
        </div>

        <Card className="overflow-hidden border-zinc-800 bg-[linear-gradient(180deg,_rgba(18,18,22,0.94),_rgba(9,9,13,0.92))]">
          <CardHeader className="border-b border-zinc-800/80">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
              <div>
                <CardTitle className="text-xl text-white">Realtime console</CardTitle>
                <CardDescription className="mt-2 max-w-2xl text-zinc-400">
                  Provider runtime context, refresh cadence, and delivery signals for this live meeting session.
                </CardDescription>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {sourceLabels.map((source) => (
                  <UiBadge
                    key={source}
                    className="border-zinc-700 bg-zinc-900/80 text-zinc-300"
                  >
                    {source}
                  </UiBadge>
                ))}
              </div>
            </div>
          </CardHeader>

          <CardContent className="grid gap-6 px-6 py-6 xl:grid-cols-[1.05fr_0.95fr_1fr]">
            <div className="space-y-4">
              <div className="flex items-center gap-3 text-zinc-200">
                <div className="flex h-11 w-11 items-center justify-center rounded-[1.25rem] border border-emerald-500/20 bg-emerald-500/10 text-emerald-300">
                  <Radio size={18} />
                </div>
                <div>
                  <p className="text-sm font-medium text-white">{providerRuntimeSource}</p>
                  <p className="text-sm text-zinc-500">
                    {statusDescription(meeting.status)}
                  </p>
                </div>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <ConsoleMetric
                  label="Participants live"
                  value={`${inCallParticipants.length}`}
                  hint={`${participants.length} participant records stored`}
                />
                <ConsoleMetric
                  label="Transcript chunks"
                  value={`${transcript.length}`}
                  hint="Latest stored transcript segments"
                />
              </div>
            </div>

            <div className="space-y-4">
              <div className="flex items-center gap-3 text-zinc-200">
                <div className="flex h-11 w-11 items-center justify-center rounded-[1.25rem] border border-sky-500/20 bg-sky-500/10 text-sky-300">
                  <RefreshCw size={18} />
                </div>
                <div>
                  <p className="text-sm font-medium text-white">Adaptive refresh</p>
                  <p className="text-sm text-zinc-500">
                    Polling every {Math.round(pollIntervalMs / 1000)} seconds while the session is active.
                  </p>
                </div>
              </div>

              <div className="rounded-[1.5rem] border border-zinc-800 bg-zinc-950/60 px-4 py-3">
                <ConsoleDetail
                  label="Last refresh"
                  value={formatTime(lastRefreshedAt)}
                  tone="accent"
                />
                <Separator className="bg-zinc-800" />
                <ConsoleDetail
                  label="Latest activity"
                  value={formatTime(latestActivityAt)}
                  tone="accent"
                />
                <Separator className="bg-zinc-800" />
                <ConsoleDetail
                  label="Active topics"
                  value={`${liveState?.activeTopics?.length ?? 0}`}
                />
              </div>
            </div>

            <div className="space-y-4">
              <div className="flex items-center gap-3 text-zinc-200">
                <div className="flex h-11 w-11 items-center justify-center rounded-[1.25rem] border border-amber-500/20 bg-amber-500/10 text-amber-300">
                  <Bot size={18} />
                </div>
                <div>
                  <p className="text-sm font-medium text-white">Provider identity</p>
                  <p className="text-sm text-zinc-500">
                    Stable IDs Kodi can use while correlating callbacks and runtime events.
                  </p>
                </div>
              </div>

              <div className="rounded-[1.5rem] border border-zinc-800 bg-zinc-950/60 px-4 py-3">
                {runtimeDetails.map((detail, index) => (
                  <div key={detail.label}>
                    {index > 0 && <Separator className="bg-zinc-800" />}
                    <ConsoleDetail
                      label={detail.label}
                      value={detail.value}
                      tone={index === 0 ? 'accent' : 'default'}
                    />
                  </div>
                ))}
              </div>
            </div>
          </CardContent>
        </Card>

        <div className="grid gap-6 lg:grid-cols-[1.15fr_0.85fr]">
          <Card className="border-zinc-800 bg-zinc-900/60">
            <CardHeader>
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-[1.15rem] border border-zinc-700 bg-zinc-950/80 text-zinc-300">
                  <Mic2 size={18} />
                </div>
                <div>
                  <CardTitle className="text-xl text-white">Transcript stream</CardTitle>
                  <CardDescription className="text-zinc-400">
                    Latest transcript segments stored for this meeting.
                  </CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              {chronologicalTranscript.length === 0 ? (
                <div className="rounded-[1.5rem] border border-dashed border-zinc-800 bg-zinc-950/50 p-5 text-sm text-zinc-500">
                  Transcript segments will appear here once provider events begin streaming.
                </div>
              ) : (
                <div className="space-y-3">
                  {chronologicalTranscript.map((segment) => (
                    <div
                      key={segment.id}
                      className="rounded-[1.5rem] border border-zinc-800 bg-zinc-950/60 p-4"
                    >
                      <div className="flex flex-wrap items-center gap-2 text-xs text-zinc-500">
                        <span className="font-medium text-zinc-300">
                          {segment.speakerName ?? 'Unknown speaker'}
                        </span>
                        <span>{formatDate(segment.createdAt)}</span>
                        <UiBadge className="border-zinc-700 bg-zinc-900 text-zinc-400">
                          {formatSourceLabel(segment.source)}
                        </UiBadge>
                        {segment.isPartial && (
                          <UiBadge className="border-amber-500/30 bg-amber-500/15 text-amber-200">
                            Partial
                          </UiBadge>
                        )}
                      </div>
                      <p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-zinc-100">
                        {segment.content}
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          <div className="flex flex-col gap-6">
            <Card className="border-zinc-800 bg-zinc-900/60">
              <CardHeader>
                <CardTitle className="text-xl text-white">Live status</CardTitle>
                <CardDescription className="text-zinc-400">
                  Current meeting runtime state and provider delivery context.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4 text-sm text-zinc-300">
                <div className="rounded-[1.5rem] border border-zinc-800 bg-zinc-950/50 p-4">
                  <div className="flex flex-wrap items-center gap-2">
                    <UiBadge className={statusTone(meeting.status)}>
                      {statusLabel(meeting.status)}
                    </UiBadge>
                    <UiBadge className="border-zinc-700 bg-zinc-800 text-zinc-300">
                      {providerRuntimeSource}
                    </UiBadge>
                  </div>
                  <p className="mt-3 leading-6 text-zinc-200">
                    {statusDescription(meeting.status)}
                  </p>
                  {failureReason && (
                    <div className="mt-4 rounded-[1.5rem] border border-red-500/20 bg-red-500/10 px-4 py-3 text-red-100">
                      <p className="text-xs uppercase tracking-[0.18em] text-red-200/80">
                        Failure reason
                      </p>
                      <p className="mt-2 leading-6">{failureReason}</p>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>

            <Card className="border-zinc-800 bg-zinc-900/60">
              <CardHeader>
                <CardTitle className="text-xl text-white">Recent provider events</CardTitle>
                <CardDescription className="text-zinc-400">
                  Newest lifecycle, participant, transcript, and health events seen by Kodi.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                {events.length === 0 ? (
                  <div className="rounded-[1.5rem] border border-dashed border-zinc-800 bg-zinc-950/50 p-5 text-sm text-zinc-500">
                    Provider callbacks and normalized meeting events will appear here.
                  </div>
                ) : (
                  events.map((event) => {
                    const detail = describeEvent(event)

                    return (
                      <div
                        key={event.id}
                        className="rounded-[1.5rem] border border-zinc-800 bg-zinc-950/60 p-4"
                      >
                        <div className="flex flex-wrap items-center gap-2 text-xs text-zinc-500">
                          <UiBadge className="border-zinc-700 bg-zinc-900 text-zinc-300">
                            {formatEventLabel(event.eventType)}
                          </UiBadge>
                          <UiBadge className="border-zinc-700 bg-zinc-900 text-zinc-400">
                            {formatSourceLabel(event.source)}
                          </UiBadge>
                          <span>#{event.sequence}</span>
                          <span>{formatDate(event.occurredAt)}</span>
                        </div>
                        {detail && (
                          <p className="mt-3 text-sm leading-6 text-zinc-200">
                            {detail}
                          </p>
                        )}
                      </div>
                    )
                  })
                )}
              </CardContent>
            </Card>

            <Card className="border-zinc-800 bg-zinc-900/60">
              <CardHeader>
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-[1.15rem] border border-indigo-500/20 bg-indigo-500/10 text-indigo-300">
                    <Mic2 size={18} />
                  </div>
                  <div>
                    <CardTitle className="text-xl text-white">Runtime state</CardTitle>
                    <CardDescription className="text-zinc-400">
                      Most recent state snapshot generated for this meeting.
                    </CardDescription>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-4 text-sm text-zinc-300">
                <div className="rounded-[1.5rem] border border-zinc-800 bg-zinc-950/50 p-4">
                  <p className="text-xs uppercase tracking-[0.18em] text-zinc-500">
                    Summary
                  </p>
                  <p className="mt-3 leading-6 text-zinc-200">
                    {meeting.liveSummary ??
                      liveState?.summary ??
                      'No live summary has been generated yet.'}
                  </p>
                </div>

                <div className="rounded-[1.5rem] border border-zinc-800 bg-zinc-950/50 p-4">
                  <p className="text-xs uppercase tracking-[0.18em] text-zinc-500">
                    Active topics
                  </p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {(liveState?.activeTopics ?? []).length > 0 ? (
                      (liveState?.activeTopics ?? []).map((topic) => (
                        <UiBadge
                          key={topic}
                          className="border-zinc-700 bg-zinc-800 text-zinc-300"
                        >
                          {topic}
                        </UiBadge>
                      ))
                    ) : (
                      <p className="text-zinc-500">No active topics yet.</p>
                    )}
                  </div>
                </div>

                <div className="rounded-[1.5rem] border border-zinc-800 bg-zinc-950/50 p-4">
                  <p className="text-xs uppercase tracking-[0.18em] text-zinc-500">
                    RTMS gateway
                  </p>
                  {rtmsGateway ? (
                    <div className="mt-3 space-y-2 text-sm text-zinc-300">
                      <div className="flex flex-wrap gap-2">
                        {typeof rtmsGateway.status === 'string' && (
                          <UiBadge className={statusTone(rtmsGateway.status)}>
                            {rtmsGateway.status}
                          </UiBadge>
                        )}
                        {typeof rtmsGateway.retryCount === 'number' && (
                          <UiBadge className="border-zinc-700 bg-zinc-800 text-zinc-300">
                            retries {rtmsGateway.retryCount}
                          </UiBadge>
                        )}
                      </div>
                      {typeof rtmsGateway.joinedAt === 'string' && (
                        <p>Joined {formatDate(rtmsGateway.joinedAt)}</p>
                      )}
                      {typeof rtmsGateway.stoppedAt === 'string' && (
                        <p>Stopped {formatDate(rtmsGateway.stoppedAt)}</p>
                      )}
                      {typeof rtmsGateway.reason === 'string' && (
                        <p className="text-zinc-400">Reason: {rtmsGateway.reason}</p>
                      )}
                    </div>
                  ) : (
                    <p className="mt-3 text-zinc-500">
                      No RTMS runtime state has been written yet.
                    </p>
                  )}
                </div>
              </CardContent>
            </Card>

            <Card className="border-zinc-800 bg-zinc-900/60">
              <CardHeader>
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-[1.15rem] border border-sky-500/20 bg-sky-500/10 text-sky-300">
                    <Users size={18} />
                  </div>
                  <div>
                    <CardTitle className="text-xl text-white">Participants</CardTitle>
                    <CardDescription className="text-zinc-400">
                      Current participant records associated with the meeting.
                    </CardDescription>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                {participants.length === 0 ? (
                  <div className="rounded-[1.5rem] border border-dashed border-zinc-800 bg-zinc-950/50 p-5 text-sm text-zinc-500">
                    Participant join and leave events will populate this panel.
                  </div>
                ) : (
                  participants.map((participant) => (
                    <div
                      key={participant.id}
                      className="rounded-[1.5rem] border border-zinc-800 bg-zinc-950/60 p-4"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium text-white">
                            {participant.displayName ??
                              participant.email ??
                              'Unknown participant'}
                          </p>
                          <p className="mt-1 truncate text-xs text-zinc-500">
                            {participant.email ?? 'No email captured'}
                          </p>
                        </div>
                        <div className="flex flex-wrap gap-2">
                          {participant.isHost && (
                            <UiBadge className="border-indigo-500/30 bg-indigo-500/15 text-indigo-200">
                              Host
                            </UiBadge>
                          )}
                          <UiBadge
                            className={
                              participant.leftAt
                                ? 'border-zinc-700 bg-zinc-800 text-zinc-300'
                                : 'border-emerald-500/30 bg-emerald-500/15 text-emerald-300'
                            }
                          >
                            {participant.leftAt ? 'Left' : 'In call'}
                          </UiBadge>
                        </div>
                      </div>
                      <div className="mt-3 flex flex-wrap gap-4 text-xs text-zinc-500">
                        <span>Joined {formatDate(participant.joinedAt)}</span>
                        {participant.leftAt && (
                          <span>Left {formatDate(participant.leftAt)}</span>
                        )}
                      </div>
                    </div>
                  ))
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </div>
  )
}
