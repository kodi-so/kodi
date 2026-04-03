'use client'

import Link from 'next/link'
import { useParams } from 'next/navigation'
import { useEffect, useMemo, useState } from 'react'
import {
  ArrowLeft,
  Clock3,
  Mic2,
  RefreshCw,
  Sparkles,
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
type MeetingParticipants = MeetingConsole['participants']
type MeetingTranscript = MeetingConsole['transcript']
type MeetingLiveState = MeetingConsole['liveState'] | null
type MeetingEventFeed = MeetingConsole['events']

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

function statusDescription(status: string) {
  switch (status) {
    case 'preparing':
      return 'Kodi is assembling the meeting session and getting ready to join.'
    case 'joining':
      return 'Kodi is on the way into the call.'
    case 'admitted':
      return 'Kodi reached the meeting and is waiting to actively listen.'
    case 'listening':
      return 'Transcript and live meeting context are flowing now.'
    case 'processing':
      return 'The meeting is being compressed into notes, topics, and actions.'
    case 'ended':
      return 'This meeting session has ended.'
    case 'failed':
      return 'This meeting hit a provider issue and may need another attempt.'
    default:
      return 'Kodi has a record of this meeting and will update it as new context arrives.'
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
    default:
      return source.replace(/_/g, ' ')
  }
}

function formatEventLabel(eventType: string) {
  switch (eventType) {
    case 'meeting.joining':
      return 'Joining'
    case 'meeting.admitted':
      return 'Admitted'
    case 'meeting.started':
      return 'Started'
    case 'meeting.ended':
      return 'Ended'
    case 'meeting.failed':
      return 'Failed'
    case 'participant.joined':
      return 'Participant joined'
    case 'meeting.transcript.segment_received':
      return 'Transcript'
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

    return content ? `${speakerName}: ${content}` : speakerName
  }

  if (event.eventType === 'participant.joined') {
    const participant = asRecord(payload.participant)
    return (
      (typeof participant?.displayName === 'string' && participant.displayName) ||
      (typeof participant?.email === 'string' && participant.email) ||
      'Participant joined'
    )
  }

  const state = typeof payload.state === 'string' ? payload.state : null
  const errorMessage =
    typeof payload.errorMessage === 'string' ? payload.errorMessage : null
  return errorMessage ?? state
}

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
          eventLimit: 20,
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

  const chronologicalTranscript = useMemo(() => [...transcript].reverse(), [transcript])
  const inCallParticipants = useMemo(
    () => participants.filter((participant) => !participant.leftAt),
    [participants]
  )
  const meetingMetadata = useMemo(() => asRecord(meeting?.metadata), [meeting?.metadata])

  const failureReason = useMemo(() => {
    const failure = asRecord(meetingMetadata?.failure)
    const kind = typeof failure?.kind === 'string' ? failure.kind : null
    const message =
      typeof meetingMetadata?.lastErrorMessage === 'string'
        ? meetingMetadata.lastErrorMessage
        : null

    return [kind, message].filter(Boolean).join(' - ') || null
  }, [meetingMetadata])

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

  const timelineEvents = useMemo(
    () =>
      [...events]
        .filter((event) =>
          [
            'meeting.joining',
            'meeting.admitted',
            'meeting.started',
            'meeting.ended',
            'meeting.failed',
            'participant.joined',
            'meeting.transcript.segment_received',
          ].includes(event.eventType)
        )
        .slice(0, 8),
    [events]
  )

  const technicalDetails = useMemo(() => {
    if (!meeting) return []

    return [
      {
        label: 'Provider',
        value: formatProviderLabel(meeting.provider),
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
      {
        label: 'Last refresh',
        value: formatTime(lastRefreshedAt),
      },
      {
        label: 'Latest activity',
        value: formatTime(latestActivityAt),
      },
    ]
  }, [lastRefreshedAt, latestActivityAt, meeting])

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
        <div className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
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
    <div className="min-h-full bg-[radial-gradient(circle_at_top_left,_rgba(34,197,94,0.08),_transparent_28%),radial-gradient(circle_at_bottom_right,_rgba(84,103,255,0.08),_transparent_30%),linear-gradient(180deg,_rgba(23,23,28,0.45),_rgba(8,8,12,0.98))]">
      <div className="mx-auto flex max-w-6xl flex-col gap-6 px-4 py-8">
        <section className="overflow-hidden rounded-[2rem] border border-zinc-800 bg-[linear-gradient(180deg,_rgba(20,20,24,0.94),_rgba(10,10,14,0.92))] shadow-2xl shadow-black/25">
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
                <Badge className={statusTone(meeting.status)}>
                  {statusLabel(meeting.status)}
                </Badge>
                <Badge className="border-zinc-700 bg-zinc-800 text-zinc-300">
                  {formatProviderLabel(meeting.provider)}
                </Badge>
                <Badge className="border-zinc-700 bg-zinc-900/80 text-zinc-400">
                  refresh {Math.round(pollIntervalMs / 1000)}s
                </Badge>
              </div>

              <div>
                <h1 className="text-3xl font-semibold tracking-tight text-white">
                  {meeting.title ?? 'Untitled meeting'}
                </h1>
                <p className="mt-2 max-w-2xl text-sm leading-6 text-zinc-400">
                  {statusDescription(meeting.status)}
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
                  <RefreshCw size={14} />
                  Last activity
                </div>
                <p className="mt-3 text-white">{formatDate(latestActivityAt)}</p>
              </div>
            </div>
          </div>
        </section>

        {failureReason && (
          <Alert className="border-red-500/30 bg-red-500/10 text-red-200">
            <AlertDescription>{failureReason}</AlertDescription>
          </Alert>
        )}

        <div className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
          <div className="space-y-6">
            <Card className="border-zinc-800 bg-zinc-900/60">
              <CardHeader>
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-[1.15rem] border border-emerald-500/20 bg-emerald-500/10 text-emerald-300">
                    <Sparkles size={18} />
                  </div>
                  <div>
                    <CardTitle className="text-xl text-white">Live summary</CardTitle>
                    <CardDescription className="text-zinc-400">
                      The shortest useful version of the meeting so far.
                    </CardDescription>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-5">
                <div className="rounded-[1.5rem] border border-zinc-800 bg-zinc-950/60 p-5">
                  <p className="text-sm leading-7 text-zinc-100">
                    {meeting.liveSummary ??
                      liveState?.summary ??
                      'Kodi has not produced a live summary yet.'}
                  </p>
                </div>

                <div className="rounded-[1.5rem] border border-zinc-800 bg-zinc-950/60 p-5">
                  <p className="text-xs uppercase tracking-[0.18em] text-zinc-500">
                    Active topics
                  </p>
                  <div className="mt-4 flex flex-wrap gap-2">
                    {(liveState?.activeTopics ?? []).length > 0 ? (
                      (liveState?.activeTopics ?? []).map((topic) => (
                        <Badge
                          key={topic}
                          className="border-zinc-700 bg-zinc-800 text-zinc-300"
                        >
                          {topic}
                        </Badge>
                      ))
                    ) : (
                      <p className="text-sm text-zinc-500">
                        Topics will appear here as the meeting develops.
                      </p>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="border-zinc-800 bg-zinc-900/60">
              <CardHeader>
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-[1.15rem] border border-zinc-700 bg-zinc-950/80 text-zinc-300">
                    <Mic2 size={18} />
                  </div>
                  <div>
                    <CardTitle className="text-xl text-white">Transcript</CardTitle>
                    <CardDescription className="text-zinc-400">
                      Raw meeting language, newest lines at the bottom.
                    </CardDescription>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                {chronologicalTranscript.length === 0 ? (
                  <div className="rounded-[1.5rem] border border-dashed border-zinc-800 bg-zinc-950/50 p-5 text-sm text-zinc-500">
                    Transcript lines will appear here once Kodi starts hearing the call.
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
                          <Badge className="border-zinc-700 bg-zinc-900 text-zinc-400">
                            {formatSourceLabel(segment.source)}
                          </Badge>
                          {segment.isPartial && (
                            <Badge className="border-amber-500/30 bg-amber-500/15 text-amber-200">
                              Partial
                            </Badge>
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
          </div>

          <div className="space-y-6">
            <Card className="border-zinc-800 bg-zinc-900/60">
              <CardHeader>
                <CardTitle className="text-xl text-white">Session health</CardTitle>
                <CardDescription className="text-zinc-400">
                  The signals that tell you whether this meeting is healthy and useful.
                </CardDescription>
              </CardHeader>
              <CardContent className="grid gap-3 sm:grid-cols-2">
                <div className="rounded-[1.5rem] border border-zinc-800 bg-zinc-950/60 p-4">
                  <p className="text-[11px] uppercase tracking-[0.2em] text-zinc-500">
                    Status
                  </p>
                  <div className="mt-3">
                    <Badge className={statusTone(meeting.status)}>
                      {statusLabel(meeting.status)}
                    </Badge>
                  </div>
                </div>
                <div className="rounded-[1.5rem] border border-zinc-800 bg-zinc-950/60 p-4">
                  <p className="text-[11px] uppercase tracking-[0.2em] text-zinc-500">
                    Participants live
                  </p>
                  <p className="mt-3 text-2xl font-semibold text-white">
                    {inCallParticipants.length}
                  </p>
                </div>
                <div className="rounded-[1.5rem] border border-zinc-800 bg-zinc-950/60 p-4">
                  <p className="text-[11px] uppercase tracking-[0.2em] text-zinc-500">
                    Transcript chunks
                  </p>
                  <p className="mt-3 text-2xl font-semibold text-white">
                    {transcript.length}
                  </p>
                </div>
                <div className="rounded-[1.5rem] border border-zinc-800 bg-zinc-950/60 p-4">
                  <p className="text-[11px] uppercase tracking-[0.2em] text-zinc-500">
                    Last refresh
                  </p>
                  <p className="mt-3 text-lg font-medium text-white">
                    {formatTime(lastRefreshedAt)}
                  </p>
                </div>
              </CardContent>
            </Card>

            <Card className="border-zinc-800 bg-zinc-900/60">
              <CardHeader>
                <CardTitle className="text-xl text-white">Timeline</CardTitle>
                <CardDescription className="text-zinc-400">
                  The few updates that matter most while the call is live.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                {timelineEvents.length === 0 ? (
                  <div className="rounded-[1.5rem] border border-dashed border-zinc-800 bg-zinc-950/50 p-5 text-sm text-zinc-500">
                    Kodi will add the important meeting moments here.
                  </div>
                ) : (
                  timelineEvents.map((event) => (
                    <div
                      key={event.id}
                      className="rounded-[1.5rem] border border-zinc-800 bg-zinc-950/60 p-4"
                    >
                      <div className="flex flex-wrap items-center gap-2 text-xs text-zinc-500">
                        <Badge className="border-zinc-700 bg-zinc-900 text-zinc-300">
                          {formatEventLabel(event.eventType)}
                        </Badge>
                        <span>{formatDate(event.occurredAt)}</span>
                      </div>
                      {describeEvent(event) && (
                        <p className="mt-3 text-sm leading-6 text-zinc-200">
                          {describeEvent(event)}
                        </p>
                      )}
                    </div>
                  ))
                )}
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
                      Who Kodi currently sees in the meeting.
                    </CardDescription>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                {participants.length === 0 ? (
                  <div className="rounded-[1.5rem] border border-dashed border-zinc-800 bg-zinc-950/50 p-5 text-sm text-zinc-500">
                    Participant activity will appear here.
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
                        <Badge
                          className={
                            participant.leftAt
                              ? 'border-zinc-700 bg-zinc-800 text-zinc-300'
                              : 'border-emerald-500/30 bg-emerald-500/15 text-emerald-300'
                          }
                        >
                          {participant.leftAt ? 'Left' : 'In call'}
                        </Badge>
                      </div>
                      <p className="mt-3 text-xs text-zinc-500">
                        Joined {formatDate(participant.joinedAt)}
                      </p>
                    </div>
                  ))
                )}
              </CardContent>
            </Card>

            <details className="group rounded-[1.75rem] border border-zinc-800 bg-zinc-900/50 p-5">
              <summary className="cursor-pointer list-none text-sm font-medium text-zinc-200 marker:hidden">
                Technical details
              </summary>
              <p className="mt-2 text-sm leading-6 text-zinc-500">
                Provider identifiers and refresh timing for debugging when needed.
              </p>

              <div className="mt-4 rounded-[1.5rem] border border-zinc-800 bg-zinc-950/60 px-4 py-3">
                {technicalDetails.map((detail, index) => (
                  <div key={detail.label}>
                    {index > 0 && <Separator className="bg-zinc-800" />}
                    <div className="flex items-start justify-between gap-4 py-3">
                      <p className="text-xs uppercase tracking-[0.18em] text-zinc-500">
                        {detail.label}
                      </p>
                      <p className="max-w-[16rem] text-right text-sm text-zinc-300">
                        {detail.value}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </details>
          </div>
        </div>
      </div>
    </div>
  )
}
