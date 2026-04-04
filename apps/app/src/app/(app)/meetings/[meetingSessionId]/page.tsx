'use client'

import Link from 'next/link'
import { useParams } from 'next/navigation'
import { useEffect, useMemo, useState } from 'react'
import {
  ArrowLeft,
  CheckCircle2,
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
  Button,
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
type MeetingTranscriptSegment = MeetingTranscript[number]

function asRecord(value: unknown) {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null
}

function asArray(value: unknown) {
  return Array.isArray(value) ? value : []
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
      return 'border-[#6FA88C]/30 bg-[#6FA88C]/14 text-[#d6eadf]'
    case 'admitted':
      return 'border-cyan-500/30 bg-cyan-500/15 text-cyan-200'
    case 'processing':
      return 'border-[#DFAE56]/30 bg-[#DFAE56]/14 text-[#f6d289]'
    case 'joining':
    case 'scheduled':
    case 'preparing':
      return 'border-[#DFAE56]/28 bg-[#DFAE56]/14 text-[#f6d289]'
    case 'ended':
      return 'border-white/12 bg-white/10 text-[#dce5e7]'
    case 'failed':
      return 'border-red-500/30 bg-red-500/15 text-red-200'
    default:
      return 'border-white/12 bg-white/10 text-[#dce5e7]'
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
      return 'Kodi is getting ready to join the meeting.'
    case 'joining':
      return 'Kodi is on the way into the call.'
    case 'admitted':
      return 'Kodi is in the meeting and waiting to actively listen.'
    case 'listening':
      return 'Transcript and live meeting context are flowing now.'
    case 'processing':
      return 'Kodi is turning the meeting into notes and follow-up.'
    case 'ended':
      return 'This meeting has ended.'
    case 'failed':
      return 'This meeting hit a provider issue and may need another attempt.'
    default:
      return 'Kodi will keep updating this meeting as new context arrives.'
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

function normalizeTranscriptContent(value: string) {
  return value.trim().replace(/\s+/g, ' ').toLowerCase()
}

function shouldCollapseTranscriptSegments(
  previous: MeetingTranscriptSegment,
  current: MeetingTranscriptSegment
) {
  const previousSpeaker = previous.speakerName ?? 'Unknown speaker'
  const currentSpeaker = current.speakerName ?? 'Unknown speaker'

  if (previousSpeaker !== currentSpeaker) return false
  if (previous.source !== current.source) return false
  if (!previous.isPartial && !current.isPartial) return false

  const previousCreatedAt = new Date(previous.createdAt).getTime()
  const currentCreatedAt = new Date(current.createdAt).getTime()
  if (
    Number.isNaN(previousCreatedAt) ||
    Number.isNaN(currentCreatedAt) ||
    currentCreatedAt - previousCreatedAt > 90_000
  ) {
    return false
  }

  const previousContent = normalizeTranscriptContent(previous.content)
  const currentContent = normalizeTranscriptContent(current.content)

  if (!previousContent || !currentContent) return false

  return (
    previousContent === currentContent ||
    previousContent.startsWith(currentContent) ||
    currentContent.startsWith(previousContent)
  )
}

function collapseTranscriptSegments(segments: MeetingTranscript) {
  const collapsed: MeetingTranscript = []

  for (const segment of segments) {
    const previous = collapsed[collapsed.length - 1]
    if (!previous || !shouldCollapseTranscriptSegments(previous, segment)) {
      collapsed.push(segment)
      continue
    }

    const preferCurrent =
      (!segment.isPartial && previous.isPartial) ||
      segment.content.length >= previous.content.length

    if (preferCurrent) {
      collapsed[collapsed.length - 1] = segment
    }
  }

  return collapsed
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

  const chronologicalTranscript = useMemo(
    () => collapseTranscriptSegments([...transcript].reverse()),
    [transcript]
  )
  const inCallParticipants = useMemo(
    () => participants.filter((participant) => !participant.leftAt),
    [participants]
  )
  const meetingMetadata = useMemo(
    () => asRecord(meeting?.metadata),
    [meeting?.metadata]
  )

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
          ].includes(event.eventType)
        )
        .slice(0, 8),
    [events]
  )

  const rollingNotes = useMemo(
    () =>
      typeof liveState?.rollingNotes === 'string' ? liveState.rollingNotes : null,
    [liveState?.rollingNotes]
  )

  const activeTopics = useMemo(() => {
    if (!Array.isArray(liveState?.activeTopics)) return []
    return liveState.activeTopics.filter(
      (topic): topic is string => typeof topic === 'string'
    )
  }, [liveState?.activeTopics])

  const candidateTasks = useMemo(
    () =>
      asArray(liveState?.candidateTasks)
        .map((task) => {
          const record = asRecord(task)
          if (!record) return null

          return {
            title:
              typeof record.title === 'string' ? record.title : 'Untitled follow-up',
            ownerHint:
              typeof record.ownerHint === 'string' ? record.ownerHint : null,
            confidence:
              typeof record.confidence === 'number' ? record.confidence : null,
            sourceEvidence: asArray(record.sourceEvidence).filter(
              (item): item is string => typeof item === 'string'
            ),
          }
        })
        .filter(
          (
            task
          ): task is {
            title: string
            ownerHint: string | null
            confidence: number | null
            sourceEvidence: string[]
          } => task !== null
        ),
    [liveState?.candidateTasks]
  )

  const draftActions = useMemo(
    () =>
      asArray(liveState?.draftActions)
        .map((draft) => {
          const record = asRecord(draft)
          if (!record) return null

          return {
            title:
              typeof record.title === 'string' ? record.title : 'Untitled draft',
            toolkitSlug:
              typeof record.toolkitSlug === 'string' ? record.toolkitSlug : null,
            toolkitName:
              typeof record.toolkitName === 'string' ? record.toolkitName : null,
            actionType:
              typeof record.actionType === 'string' ? record.actionType : null,
            targetSummary:
              typeof record.targetSummary === 'string'
                ? record.targetSummary
                : null,
            rationale:
              typeof record.rationale === 'string' ? record.rationale : null,
            confidence:
              typeof record.confidence === 'number' ? record.confidence : null,
            sourceEvidence: asArray(record.sourceEvidence).filter(
              (item): item is string => typeof item === 'string'
            ),
            reviewState:
              typeof record.reviewState === 'string' ? record.reviewState : null,
            approvalRequired: record.approvalRequired === true,
          }
        })
        .filter(
          (
            draft
          ): draft is {
            title: string
            toolkitSlug: string | null
            toolkitName: string | null
            actionType: string | null
            targetSummary: string | null
            rationale: string | null
            confidence: number | null
            sourceEvidence: string[]
            reviewState: string | null
            approvalRequired: boolean
          } => draft !== null
        ),
    [liveState?.draftActions]
  )

  const decisions = useMemo(
    () =>
      asArray(liveState?.decisions)
        .map((item) => {
          const record = asRecord(item)
          if (!record) return null

          return (
            (typeof record.summary === 'string' && record.summary) ||
            (typeof record.title === 'string' && record.title) ||
            (typeof record.decision === 'string' && record.decision) ||
            null
          )
        })
        .filter((value): value is string => Boolean(value)),
    [liveState?.decisions]
  )

  const openQuestions = useMemo(
    () =>
      asArray(liveState?.openQuestions)
        .map((item) => {
          const record = asRecord(item)
          if (!record) return null

          return (
            (typeof record.summary === 'string' && record.summary) ||
            (typeof record.question === 'string' && record.question) ||
            (typeof record.title === 'string' && record.title) ||
            null
          )
        })
        .filter((value): value is string => Boolean(value)),
    [liveState?.openQuestions]
  )

  const risks = useMemo(
    () =>
      asArray(liveState?.risks)
        .map((item) => {
          const record = asRecord(item)
          if (!record) return null

          return (
            (typeof record.summary === 'string' && record.summary) ||
            (typeof record.risk === 'string' && record.risk) ||
            (typeof record.title === 'string' && record.title) ||
            null
          )
        })
        .filter((value): value is string => Boolean(value)),
    [liveState?.risks]
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
      <div className="flex min-h-full items-center justify-center p-6 text-sm text-[#8ea3a8]">
        Select a workspace to view meetings.
      </div>
    )
  }

  if (loading) {
    return (
      <div className="mx-auto flex max-w-6xl flex-col gap-6 px-4 py-8">
        <Skeleton className="h-9 w-48 bg-white/10" />
        <Skeleton className="h-[220px] bg-white/10" />
        <div className="grid gap-6 lg:grid-cols-[1.18fr_0.82fr]">
          <Skeleton className="h-[640px] bg-white/10" />
          <Skeleton className="h-[640px] bg-white/10" />
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
        <Alert className="border-white/12 bg-[rgba(49,66,71,0.82)] text-[#dce5e7]">
          <AlertDescription>
            This meeting session was not found for the current workspace.
          </AlertDescription>
        </Alert>
      </div>
    )
  }

  return (
    <div className="min-h-full bg-[radial-gradient(circle_at_top_left,_rgba(20,184,166,0.10),_transparent_26%),radial-gradient(circle_at_bottom_right,_rgba(59,130,246,0.08),_transparent_32%),linear-gradient(180deg,_rgba(16,17,21,0.88),_rgba(7,8,10,1))]">
      <div className="mx-auto flex max-w-6xl flex-col gap-6 px-4 py-8">
        <section className="overflow-hidden rounded-[2rem] border border-white/10 bg-[linear-gradient(180deg,_rgba(19,20,24,0.96),_rgba(11,12,15,0.96))] shadow-2xl shadow-black/20">
          <div className="border-b border-white/10/80 px-6 py-5">
            <Link
              href="/meetings"
              className="inline-flex w-fit items-center gap-2 text-sm text-[#9bb0b5] transition hover:text-white"
            >
              <ArrowLeft size={16} />
              Back to meetings
            </Link>
          </div>

          <div className="grid gap-6 px-6 py-6 lg:grid-cols-[minmax(0,1.15fr)_minmax(320px,0.85fr)]">
            <div className="space-y-4">
              <div className="flex flex-wrap items-center gap-2">
                <Badge className={statusTone(meeting.status)}>
                  {statusLabel(meeting.status)}
                </Badge>
                <Badge className="border-white/12 bg-[#314247] text-[#dce5e7]">
                  {formatProviderLabel(meeting.provider)}
                </Badge>
                <Badge className="border-white/12 bg-[rgba(49,66,71,0.92)] text-[#9bb0b5]">
                  refresh {Math.round(pollIntervalMs / 1000)}s
                </Badge>
              </div>

              <div className="space-y-3">
                <h1 className="text-3xl font-semibold tracking-tight text-white">
                  {meeting.title ?? 'Untitled meeting'}
                </h1>
                <p className="max-w-2xl text-sm leading-7 text-[#9bb0b5]">
                  {statusDescription(meeting.status)}
                </p>
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="rounded-[1.4rem] border border-white/10 bg-black/12 px-4 py-4">
                <div className="flex items-center gap-2 text-[#8ea3a8]">
                  <Clock3 size={14} />
                  Started
                </div>
                <p className="mt-3 text-sm text-white">
                  {formatDate(meeting.actualStartAt ?? meeting.createdAt)}
                </p>
              </div>
              <div className="rounded-[1.4rem] border border-white/10 bg-black/12 px-4 py-4">
                <div className="flex items-center gap-2 text-[#8ea3a8]">
                  <RefreshCw size={14} />
                  Last activity
                </div>
                <p className="mt-3 text-sm text-white">
                  {formatDate(latestActivityAt)}
                </p>
              </div>
            </div>
          </div>
        </section>

        {failureReason && (
          <Alert className="border-red-500/30 bg-red-500/10 text-red-200">
            <AlertDescription>{failureReason}</AlertDescription>
          </Alert>
        )}

        <div className="grid gap-6 lg:grid-cols-[minmax(0,1.18fr)_minmax(300px,0.82fr)]">
          <div className="space-y-6">
            <Card className="border-white/10 bg-[rgba(49,66,71,0.78)]">
              <CardHeader>
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-[1.1rem] border border-emerald-500/20 bg-emerald-500/10 text-[#d6eadf]">
                    <Sparkles size={18} />
                  </div>
                  <div>
                    <CardTitle className="text-xl text-white">
                      Meeting summary
                    </CardTitle>
                    <CardDescription className="text-[#9bb0b5]">
                      The shortest useful version of the meeting so far.
                    </CardDescription>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-5">
                <div className="rounded-[1.5rem] border border-white/10 bg-black/12 p-5">
                  <p className="text-sm leading-7 text-white">
                    {meeting.liveSummary ??
                      liveState?.summary ??
                      'Kodi has not produced a meeting summary yet.'}
                  </p>
                </div>

                <div className="grid gap-4 lg:grid-cols-[0.95fr_1.05fr]">
                  <div className="rounded-[1.5rem] border border-white/10 bg-black/12 p-5">
                    <p className="text-[11px] uppercase tracking-[0.2em] text-[#8ea3a8]">
                      Active topics
                    </p>
                    <div className="mt-4 flex flex-wrap gap-2">
                      {activeTopics.length > 0 ? (
                        activeTopics.map((topic) => (
                          <Badge
                            key={topic}
                            className="border-white/12 bg-white/10 text-[#dce5e7]"
                          >
                            {topic}
                          </Badge>
                        ))
                      ) : (
                        <p className="text-sm text-[#8ea3a8]">
                          Topics will appear here as the meeting develops.
                        </p>
                      )}
                    </div>
                  </div>

                  <div className="rounded-[1.5rem] border border-white/10 bg-black/12 p-5">
                    <p className="text-[11px] uppercase tracking-[0.2em] text-[#8ea3a8]">
                      Running notes
                    </p>
                    <p className="mt-4 whitespace-pre-wrap text-sm leading-6 text-[#eef2ea]">
                      {rollingNotes ??
                        'Kodi will keep a tighter running set of notes here as the meeting develops.'}
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="border-white/10 bg-[rgba(49,66,71,0.78)]">
              <CardHeader>
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-[1.1rem] border border-white/12 bg-[rgba(31,44,49,0.9)] text-[#dce5e7]">
                    <Mic2 size={18} />
                  </div>
                  <div>
                    <CardTitle className="text-xl text-white">Transcript</CardTitle>
                    <CardDescription className="text-[#9bb0b5]">
                      Raw meeting language, newest lines at the bottom.
                    </CardDescription>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                {chronologicalTranscript.length === 0 ? (
                  <div className="rounded-[1.5rem] border border-dashed border-white/10 bg-black/8 p-5 text-sm text-[#8ea3a8]">
                    Transcript lines will appear here once Kodi starts hearing the
                    call.
                  </div>
                ) : (
                  <div className="space-y-3">
                    {chronologicalTranscript.map((segment) => (
                      <div
                        key={segment.id}
                        className="rounded-[1.5rem] border border-white/10 bg-black/12 p-4"
                      >
                        <div className="flex flex-wrap items-center gap-2 text-xs text-[#8ea3a8]">
                          <span className="font-medium text-[#dce5e7]">
                            {segment.speakerName ?? 'Unknown speaker'}
                          </span>
                          <span>{formatDate(segment.createdAt)}</span>
                          <Badge className="border-white/12 bg-[#314247] text-[#9bb0b5]">
                            {formatSourceLabel(segment.source)}
                          </Badge>
                          {segment.isPartial && (
                            <Badge className="border-[#DFAE56]/28 bg-[#DFAE56]/14 text-[#f6d289]">
                              Partial
                            </Badge>
                          )}
                        </div>
                        <p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-white">
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
            <Card className="border-white/10 bg-[rgba(49,66,71,0.78)]">
              <CardHeader>
                <CardTitle className="text-xl text-white">
                  Follow-up
                </CardTitle>
                <CardDescription className="text-[#9bb0b5]">
                  The outputs that should help the team move after the call.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-5">
                <div className="grid gap-3 sm:grid-cols-3">
                  <div className="rounded-[1.3rem] border border-white/10 bg-black/12 p-4">
                    <p className="text-[11px] uppercase tracking-[0.2em] text-[#8ea3a8]">
                      Status
                    </p>
                    <div className="mt-3">
                      <Badge className={statusTone(meeting.status)}>
                        {statusLabel(meeting.status)}
                      </Badge>
                    </div>
                  </div>
                  <div className="rounded-[1.3rem] border border-white/10 bg-black/12 p-4">
                    <p className="text-[11px] uppercase tracking-[0.2em] text-[#8ea3a8]">
                      People live
                    </p>
                    <p className="mt-3 text-2xl font-semibold text-white">
                      {inCallParticipants.length}
                    </p>
                  </div>
                  <div className="rounded-[1.3rem] border border-white/10 bg-black/12 p-4">
                    <p className="text-[11px] uppercase tracking-[0.2em] text-[#8ea3a8]">
                      Transcript
                    </p>
                    <p className="mt-3 text-2xl font-semibold text-white">
                      {transcript.length}
                    </p>
                  </div>
                </div>

                <div className="space-y-3">
                  <div>
                    <p className="text-[11px] uppercase tracking-[0.2em] text-[#8ea3a8]">
                      Draft actions
                    </p>
                    <div className="mt-3 space-y-3">
                      {draftActions.length > 0 ? (
                        draftActions.map((draft, index) => (
                          <div
                            key={`${draft.title}-${index}`}
                            className="rounded-[1.4rem] border border-white/10 bg-black/12 p-4"
                          >
                            <div className="flex items-start justify-between gap-3">
                              <div className="space-y-2">
                                <p className="text-sm font-medium text-white">
                                  {draft.title}
                                </p>
                                <div className="flex flex-wrap gap-2 text-xs">
                                  {(draft.toolkitName ?? draft.toolkitSlug) && (
                                    <Badge className="border-white/12 bg-[#314247] text-[#dce5e7]">
                                      {draft.toolkitName ?? draft.toolkitSlug}
                                    </Badge>
                                  )}
                                  {draft.actionType && (
                                    <Badge className="border-white/12 bg-black/18 text-[#9bb0b5]">
                                      {draft.actionType.replace(/_/g, ' ')}
                                    </Badge>
                                  )}
                                  {draft.approvalRequired && (
                                    <Badge className="border-[#DFAE56]/28 bg-[#DFAE56]/14 text-[#f6d289]">
                                      Approval required
                                    </Badge>
                                  )}
                                </div>
                              </div>
                              {draft.confidence != null && (
                                <Badge className="border-white/12 bg-[#314247] text-[#9bb0b5]">
                                  {Math.round(draft.confidence * 100)}%
                                </Badge>
                              )}
                            </div>

                            {draft.targetSummary && (
                              <p className="mt-3 text-sm text-[#9bb0b5]">
                                Target: {draft.targetSummary}
                              </p>
                            )}

                            {draft.rationale && (
                              <p className="mt-2 text-sm leading-6 text-[#eef2ea]">
                                {draft.rationale}
                              </p>
                            )}

                            {draft.sourceEvidence.length > 0 && (
                              <p className="mt-3 text-sm leading-6 text-[#8ea3a8]">
                                {draft.sourceEvidence[0]}
                              </p>
                            )}
                          </div>
                        ))
                      ) : (
                        <div className="rounded-[1.4rem] border border-dashed border-white/10 bg-black/8 p-4 text-sm text-[#8ea3a8]">
                          Draft actions will appear here once Kodi can connect
                          meeting follow-up to tools available in the workspace.
                        </div>
                      )}
                    </div>
                  </div>

                  <div>
                    <p className="text-[11px] uppercase tracking-[0.2em] text-[#8ea3a8]">
                      Candidate action items
                    </p>
                    <div className="mt-3 space-y-3">
                      {candidateTasks.length > 0 ? (
                        candidateTasks.map((task, index) => (
                          <div
                            key={`${task.title}-${index}`}
                            className="rounded-[1.4rem] border border-white/10 bg-black/12 p-4"
                          >
                            <div className="flex items-start justify-between gap-3">
                              <p className="text-sm font-medium text-white">
                                {task.title}
                              </p>
                              {task.confidence != null && (
                                <Badge className="border-white/12 bg-[#314247] text-[#9bb0b5]">
                                  {Math.round(task.confidence * 100)}%
                                </Badge>
                              )}
                            </div>
                            {task.ownerHint && (
                              <p className="mt-2 text-sm text-[#9bb0b5]">
                                Owner hint: {task.ownerHint}
                              </p>
                            )}
                            {task.sourceEvidence.length > 0 && (
                              <p className="mt-3 text-sm leading-6 text-[#8ea3a8]">
                                {task.sourceEvidence[0]}
                              </p>
                            )}
                          </div>
                        ))
                      ) : (
                        <div className="rounded-[1.4rem] border border-dashed border-white/10 bg-black/8 p-4 text-sm text-[#8ea3a8]">
                          Candidate follow-up will appear here when Kodi finds
                          concrete next steps in the conversation.
                        </div>
                      )}
                    </div>
                  </div>

                  {(decisions.length > 0 || openQuestions.length > 0 || risks.length > 0) && (
                    <div className="grid gap-3">
                      {decisions.length > 0 && (
                        <div className="rounded-[1.4rem] border border-white/10 bg-black/12 p-4">
                          <p className="text-[11px] uppercase tracking-[0.2em] text-[#8ea3a8]">
                            Decisions
                          </p>
                          <div className="mt-3 space-y-2">
                            {decisions.map((decision) => (
                              <div
                                key={decision}
                                className="flex items-start gap-3 text-sm text-[#eef2ea]"
                              >
                                <CheckCircle2
                                  size={15}
                                  className="mt-0.5 text-[#d6eadf]"
                                />
                                <span>{decision}</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {openQuestions.length > 0 && (
                        <div className="rounded-[1.4rem] border border-white/10 bg-black/12 p-4">
                          <p className="text-[11px] uppercase tracking-[0.2em] text-[#8ea3a8]">
                            Open questions
                          </p>
                          <div className="mt-3 space-y-2 text-sm text-[#eef2ea]">
                            {openQuestions.map((question) => (
                              <p key={question}>{question}</p>
                            ))}
                          </div>
                        </div>
                      )}

                      {risks.length > 0 && (
                        <div className="rounded-[1.4rem] border border-white/10 bg-black/12 p-4">
                          <p className="text-[11px] uppercase tracking-[0.2em] text-[#8ea3a8]">
                            Risks
                          </p>
                          <div className="mt-3 space-y-2 text-sm text-[#eef2ea]">
                            {risks.map((risk) => (
                              <p key={risk}>{risk}</p>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>

            <Card className="border-white/10 bg-[rgba(49,66,71,0.78)]">
              <CardHeader>
                <CardTitle className="text-xl text-white">Timeline</CardTitle>
                <CardDescription className="text-[#9bb0b5]">
                  The handful of meeting moments worth keeping in view.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                {timelineEvents.length === 0 ? (
                  <div className="rounded-[1.4rem] border border-dashed border-white/10 bg-black/8 p-5 text-sm text-[#8ea3a8]">
                    Kodi will add the important meeting moments here.
                  </div>
                ) : (
                  timelineEvents.map((event) => (
                    <div
                      key={event.id}
                      className="rounded-[1.4rem] border border-white/10 bg-black/12 p-4"
                    >
                      <div className="flex flex-wrap items-center gap-2 text-xs text-[#8ea3a8]">
                        <Badge className="border-white/12 bg-[#314247] text-[#dce5e7]">
                          {formatEventLabel(event.eventType)}
                        </Badge>
                        <span>{formatDate(event.occurredAt)}</span>
                      </div>
                      {describeEvent(event) && (
                        <p className="mt-3 text-sm leading-6 text-[#eef2ea]">
                          {describeEvent(event)}
                        </p>
                      )}
                    </div>
                  ))
                )}
              </CardContent>
            </Card>

            <Card className="border-white/10 bg-[rgba(49,66,71,0.78)]">
              <CardHeader>
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-[1.1rem] border border-white/12 bg-white/8 text-[#dbeaf0]">
                    <Users size={18} />
                  </div>
                  <div>
                    <CardTitle className="text-xl text-white">People</CardTitle>
                    <CardDescription className="text-[#9bb0b5]">
                      Who Kodi currently sees in the meeting.
                    </CardDescription>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                {participants.length === 0 ? (
                  <div className="rounded-[1.4rem] border border-dashed border-white/10 bg-black/8 p-5 text-sm text-[#8ea3a8]">
                    Participant activity will appear here.
                  </div>
                ) : (
                  participants.map((participant) => (
                    <div
                      key={participant.id}
                      className="rounded-[1.4rem] border border-white/10 bg-black/12 p-4"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium text-white">
                            {participant.displayName ??
                              participant.email ??
                              'Unknown participant'}
                          </p>
                          <p className="mt-1 truncate text-xs text-[#8ea3a8]">
                            {participant.email ?? 'No email captured'}
                          </p>
                        </div>
                        <Badge
                          className={
                            participant.leftAt
                              ? 'border-white/12 bg-white/10 text-[#dce5e7]'
                              : 'border-[#6FA88C]/30 bg-[#6FA88C]/14 text-[#d6eadf]'
                          }
                        >
                          {participant.leftAt ? 'Left' : 'In call'}
                        </Badge>
                      </div>
                      <p className="mt-3 text-xs text-[#8ea3a8]">
                        Joined {formatDate(participant.joinedAt)}
                      </p>
                    </div>
                  ))
                )}
              </CardContent>
            </Card>

            <details className="group rounded-[1.75rem] border border-white/10 bg-[rgba(49,66,71,0.72)] p-5">
              <summary className="cursor-pointer list-none text-sm font-medium text-[#eef2ea] marker:hidden">
                Technical details
              </summary>
              <p className="mt-2 text-sm leading-6 text-[#8ea3a8]">
                Provider identifiers and refresh timing for debugging when needed.
              </p>

              <div className="mt-4 rounded-[1.5rem] border border-white/10 bg-black/12 px-4 py-3">
                {technicalDetails.map((detail, index) => (
                  <div key={detail.label}>
                    {index > 0 && <Separator className="bg-white/10" />}
                    <div className="flex items-start justify-between gap-4 py-3">
                      <p className="text-xs uppercase tracking-[0.18em] text-[#8ea3a8]">
                        {detail.label}
                      </p>
                      <p className="max-w-[16rem] text-right text-sm text-[#dce5e7]">
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
