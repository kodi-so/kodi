'use client'

import Link from 'next/link'
import { useParams } from 'next/navigation'
import { useEffect, useMemo, useState } from 'react'
import { ArrowLeft, CheckCircle2, Users } from 'lucide-react'
import {
  Alert,
  AlertDescription,
  Badge,
  Card,
  CardContent,
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
type MeetingTranscriptTurn = MeetingTranscriptSegment & {
  mergedSegmentCount: number
}

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
      (typeof participant?.displayName === 'string' &&
        participant.displayName) ||
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

function shouldMergeTranscriptTurns(
  previous: MeetingTranscriptSegment,
  current: MeetingTranscriptSegment
) {
  const previousSpeaker = previous.speakerName ?? 'Unknown speaker'
  const currentSpeaker = current.speakerName ?? 'Unknown speaker'

  if (previousSpeaker !== currentSpeaker) return false
  if (previous.source !== current.source) return false

  const previousCreatedAt = new Date(previous.createdAt).getTime()
  const currentCreatedAt = new Date(current.createdAt).getTime()
  if (
    Number.isNaN(previousCreatedAt) ||
    Number.isNaN(currentCreatedAt) ||
    currentCreatedAt - previousCreatedAt > 90_000
  ) {
    return false
  }

  return !previous.isPartial && !current.isPartial
}

function joinTranscriptContent(previous: string, current: string) {
  const previousNormalized = normalizeTranscriptContent(previous)
  const currentNormalized = normalizeTranscriptContent(current)

  if (!previousNormalized) return current.trim()
  if (!currentNormalized) return previous.trim()

  if (previousNormalized === currentNormalized) {
    return previous.length >= current.length ? previous.trim() : current.trim()
  }

  if (previousNormalized.startsWith(currentNormalized)) {
    return previous.trim()
  }

  if (currentNormalized.startsWith(previousNormalized)) {
    return current.trim()
  }

  const left = previous.trim()
  const right = current.trim()
  if (!left) return right
  if (!right) return left

  return `${left}${/\s$/.test(left) ? '' : ' '}${right}`
}

function collapseTranscriptSegments(segments: MeetingTranscript) {
  const collapsed: MeetingTranscriptTurn[] = []

  for (const segment of segments) {
    const previous = collapsed[collapsed.length - 1]
    if (!previous || !shouldCollapseTranscriptSegments(previous, segment)) {
      collapsed.push({
        ...segment,
        mergedSegmentCount: 1,
      })
      continue
    }

    const preferCurrent =
      (!segment.isPartial && previous.isPartial) ||
      segment.content.length >= previous.content.length

    if (preferCurrent) {
      collapsed[collapsed.length - 1] = {
        ...segment,
        mergedSegmentCount: previous.mergedSegmentCount,
      }
    }
  }

  const grouped: MeetingTranscriptTurn[] = []

  for (const segment of collapsed) {
    const previous = grouped[grouped.length - 1]

    if (!previous || !shouldMergeTranscriptTurns(previous, segment)) {
      grouped.push(segment)
      continue
    }

    grouped[grouped.length - 1] = {
      ...segment,
      id: previous.id,
      createdAt: previous.createdAt,
      content: joinTranscriptContent(previous.content, segment.content),
      mergedSegmentCount:
        previous.mergedSegmentCount + segment.mergedSegmentCount,
    }
  }

  return grouped
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

  const compactTimelineEvents = useMemo(() => {
    if (timelineEvents.length === 0) return []

    return timelineEvents.filter((event, index, list) => {
      if (event.eventType !== 'meeting.failed') {
        return true
      }

      const previous = list[index - 1]
      const next = list[index + 1]
      return !(
        previous?.eventType === 'meeting.ended' ||
        next?.eventType === 'meeting.ended'
      )
    })
  }, [timelineEvents])

  const rollingNotes = useMemo(
    () =>
      typeof liveState?.rollingNotes === 'string'
        ? liveState.rollingNotes
        : null,
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
              typeof record.title === 'string'
                ? record.title
                : 'Untitled follow-up',
            ownerHint:
              typeof record.ownerHint === 'string' ? record.ownerHint : null,
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
              typeof record.title === 'string'
                ? record.title
                : 'Untitled draft',
            toolkitName:
              typeof record.toolkitName === 'string'
                ? record.toolkitName
                : (typeof record.toolkitSlug === 'string'
                    ? record.toolkitSlug
                    : null),
            approvalRequired: record.approvalRequired === true,
            sourceEvidence: asArray(record.sourceEvidence).filter(
              (item): item is string => typeof item === 'string'
            ),
          }
        })
        .filter(
          (
            draft
          ): draft is {
            title: string
            toolkitName: string | null
            approvalRequired: boolean
            sourceEvidence: string[]
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
        <Skeleton className="h-[160px] bg-white/10" />
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
        {/* Header */}
        <section className="overflow-hidden rounded-[2rem] border border-white/10 bg-[linear-gradient(180deg,_rgba(19,20,24,0.96),_rgba(11,12,15,0.96))]">
          <div className="border-b border-white/10 px-6 py-4">
            <Link
              href="/meetings"
              className="inline-flex w-fit items-center gap-2 text-sm text-[#9bb0b5] transition hover:text-white"
            >
              <ArrowLeft size={16} />
              Back to meetings
            </Link>
          </div>

          <div className="px-6 py-5">
            <div className="flex flex-wrap items-center gap-2">
              <Badge className={statusTone(meeting.status)}>
                {statusLabel(meeting.status)}
              </Badge>
              <Badge className="border-white/12 bg-[#314247] text-[#dce5e7]">
                {formatProviderLabel(meeting.provider)}
              </Badge>
            </div>
            <h1 className="mt-3 text-2xl font-semibold tracking-tight text-white">
              {meeting.title ?? 'Untitled meeting'}
            </h1>
            <p className="mt-1 text-sm text-[#8ea3a8]">
              Started {formatDate(meeting.actualStartAt ?? meeting.createdAt)}
              {latestActivityAt && (
                <> · Last activity {formatDate(latestActivityAt)}</>
              )}
            </p>
          </div>
        </section>

        {failureReason && (
          <Alert className="border-red-500/30 bg-red-500/10 text-red-200">
            <AlertDescription>{failureReason}</AlertDescription>
          </Alert>
        )}

        <div className="grid gap-6 xl:grid-cols-[minmax(0,1.2fr)_minmax(22rem,0.8fr)]">
          {/* Left column */}
          <div className="space-y-6">
            {/* Summary */}
            <Card className="border-white/10 bg-[rgba(49,66,71,0.78)]">
              <CardHeader className="pb-3">
                <CardTitle className="text-base font-medium text-white">
                  Summary
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {activeTopics.length > 0 && (
                  <div className="flex flex-wrap gap-2">
                    {activeTopics.map((topic) => (
                      <Badge
                        key={topic}
                        className="border-white/12 bg-white/10 text-[#dce5e7]"
                      >
                        {topic}
                      </Badge>
                    ))}
                  </div>
                )}

                <p className="text-sm leading-7 text-white">
                  {meeting.liveSummary ??
                    liveState?.summary ??
                    'No summary yet.'}
                </p>

                {(rollingNotes || (!meeting.liveSummary && !liveState?.summary)) && (
                  <details className="group pt-1">
                    <summary className="cursor-pointer list-none text-xs text-[#8ea3a8] marker:hidden hover:text-[#9bb0b5]">
                      Working notes
                    </summary>
                    <p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-[#9bb0b5]">
                      {rollingNotes ??
                        'Kodi will keep running notes here as the meeting develops.'}
                    </p>
                  </details>
                )}
              </CardContent>
            </Card>

            {/* Transcript */}
            <Card className="border-white/10 bg-[rgba(49,66,71,0.78)]">
              <CardHeader className="pb-3">
                <CardTitle className="text-base font-medium text-white">
                  Transcript
                </CardTitle>
              </CardHeader>
              <CardContent>
                {chronologicalTranscript.length === 0 ? (
                  <p className="text-sm text-[#8ea3a8]">No transcript yet.</p>
                ) : (
                  <div className="divide-y divide-white/8">
                    {chronologicalTranscript.map((segment) => (
                      <div
                        key={segment.id}
                        className="py-4 first:pt-0 last:pb-0"
                      >
                        <div className="mb-1.5 flex items-baseline gap-3">
                          <span className="text-sm font-medium text-[#dce5e7]">
                            {segment.speakerName ?? 'Unknown'}
                          </span>
                          <span className="text-xs text-[#8ea3a8]">
                            {formatDate(segment.createdAt)}
                          </span>
                          {segment.isPartial && (
                            <span className="text-xs text-[#f6d289]">
                              partial
                            </span>
                          )}
                        </div>
                        <p className="whitespace-pre-wrap text-sm leading-6 text-white">
                          {segment.content}
                        </p>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Right column */}
          <div className="space-y-6">
            {/* Follow-up */}
            <Card className="border-white/10 bg-[rgba(49,66,71,0.78)]">
              <CardHeader className="pb-3">
                <CardTitle className="text-base font-medium text-white">
                  Follow-up
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-5">
                {/* Action items — draft actions and candidate tasks merged */}
                <div>
                  <p className="text-[11px] uppercase tracking-[0.2em] text-[#8ea3a8]">
                    Action items
                  </p>
                  <div className="mt-3 space-y-2">
                    {draftActions.length === 0 && candidateTasks.length === 0 ? (
                      <p className="text-sm text-[#8ea3a8]">
                        No action items yet.
                      </p>
                    ) : (
                      <>
                        {draftActions.map((draft, index) => (
                          <div
                            key={`draft-${index}`}
                            className="rounded-[1.2rem] border border-white/10 bg-black/12 px-4 py-3"
                          >
                            <div className="flex items-start gap-2">
                              <p className="flex-1 text-sm font-medium text-white">
                                {draft.title}
                              </p>
                              <div className="flex shrink-0 flex-wrap gap-1.5">
                                {draft.toolkitName && (
                                  <Badge className="border-white/12 bg-[#314247] text-[#dce5e7]">
                                    {draft.toolkitName}
                                  </Badge>
                                )}
                                {draft.approvalRequired && (
                                  <Badge className="border-[#DFAE56]/28 bg-[#DFAE56]/14 text-[#f6d289]">
                                    Needs approval
                                  </Badge>
                                )}
                              </div>
                            </div>
                            {draft.sourceEvidence.length > 0 && (
                              <details className="mt-2">
                                <summary className="cursor-pointer text-xs text-[#8ea3a8] marker:hidden hover:text-[#9bb0b5]">
                                  Why Kodi suggested this
                                </summary>
                                <p className="mt-1.5 text-sm leading-6 text-[#8ea3a8]">
                                  {draft.sourceEvidence[0]}
                                </p>
                              </details>
                            )}
                          </div>
                        ))}
                        {candidateTasks.map((task, index) => (
                          <div
                            key={`task-${index}`}
                            className="rounded-[1.2rem] border border-white/10 bg-black/12 px-4 py-3"
                          >
                            <p className="text-sm font-medium text-white">
                              {task.title}
                            </p>
                            {task.ownerHint && (
                              <p className="mt-1 text-xs text-[#9bb0b5]">
                                {task.ownerHint}
                              </p>
                            )}
                            {task.sourceEvidence.length > 0 && (
                              <details className="mt-2">
                                <summary className="cursor-pointer text-xs text-[#8ea3a8] marker:hidden hover:text-[#9bb0b5]">
                                  Why Kodi suggested this
                                </summary>
                                <p className="mt-1.5 text-sm leading-6 text-[#8ea3a8]">
                                  {task.sourceEvidence[0]}
                                </p>
                              </details>
                            )}
                          </div>
                        ))}
                      </>
                    )}
                  </div>
                </div>

                {/* Decisions, open questions, risks — flat lists, no separate boxes */}
                {decisions.length > 0 && (
                  <div>
                    <p className="text-[11px] uppercase tracking-[0.2em] text-[#8ea3a8]">
                      Decisions
                    </p>
                    <div className="mt-2 space-y-1.5">
                      {decisions.map((decision) => (
                        <div
                          key={decision}
                          className="flex items-start gap-2 text-sm text-[#eef2ea]"
                        >
                          <CheckCircle2
                            size={14}
                            className="mt-0.5 shrink-0 text-[#d6eadf]"
                          />
                          <span>{decision}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {openQuestions.length > 0 && (
                  <div>
                    <p className="text-[11px] uppercase tracking-[0.2em] text-[#8ea3a8]">
                      Open questions
                    </p>
                    <div className="mt-2 space-y-1.5">
                      {openQuestions.map((question) => (
                        <p key={question} className="text-sm text-[#eef2ea]">
                          {question}
                        </p>
                      ))}
                    </div>
                  </div>
                )}

                {risks.length > 0 && (
                  <div>
                    <p className="text-[11px] uppercase tracking-[0.2em] text-[#8ea3a8]">
                      Risks
                    </p>
                    <div className="mt-2 space-y-1.5">
                      {risks.map((risk) => (
                        <p key={risk} className="text-sm text-[#eef2ea]">
                          {risk}
                        </p>
                      ))}
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* People, activity, and diagnostics — collapsed by default */}
            <details className="group rounded-[1.75rem] border border-white/10 bg-[rgba(49,66,71,0.72)] p-5">
              <summary className="cursor-pointer list-none text-sm font-medium text-[#eef2ea] marker:hidden">
                People &amp; diagnostics
              </summary>

              <div className="mt-4 space-y-3">
                {/* Participants */}
                <div className="rounded-[1.4rem] border border-white/10 bg-black/12 p-4">
                  <div className="flex items-center gap-2 text-sm font-medium text-white">
                    <Users size={14} className="text-[#dbeaf0]" />
                    People
                  </div>
                  {participants.length === 0 ? (
                    <p className="mt-2 text-sm text-[#8ea3a8]">
                      No participants recorded.
                    </p>
                  ) : (
                    <div className="mt-3 divide-y divide-white/8">
                      {participants.map((participant) => (
                        <div
                          key={participant.id}
                          className="flex items-center justify-between gap-3 py-2.5 first:pt-0 last:pb-0"
                        >
                          <div className="min-w-0">
                            <p className="truncate text-sm text-white">
                              {participant.displayName ??
                                participant.email ??
                                'Unknown participant'}
                            </p>
                            {participant.email && participant.displayName && (
                              <p className="truncate text-xs text-[#8ea3a8]">
                                {participant.email}
                              </p>
                            )}
                          </div>
                          <Badge
                            className={
                              participant.leftAt
                                ? 'shrink-0 border-white/12 bg-white/10 text-[#dce5e7]'
                                : 'shrink-0 border-[#6FA88C]/30 bg-[#6FA88C]/14 text-[#d6eadf]'
                            }
                          >
                            {participant.leftAt ? 'Left' : 'In call'}
                          </Badge>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Timeline events */}
                {compactTimelineEvents.length > 0 && (
                  <div className="rounded-[1.4rem] border border-white/10 bg-black/12 p-4">
                    <div className="divide-y divide-white/8">
                      {compactTimelineEvents.map((event) => (
                        <div
                          key={event.id}
                          className="flex items-center gap-3 py-2.5 text-sm first:pt-0 last:pb-0"
                        >
                          <Badge className="shrink-0 border-white/12 bg-[#314247] text-[#9bb0b5]">
                            {formatEventLabel(event.eventType)}
                          </Badge>
                          <span className="text-xs text-[#8ea3a8]">
                            {formatDate(event.occurredAt)}
                          </span>
                          {describeEvent(event) && (
                            <span className="min-w-0 truncate text-xs text-[#dce5e7]">
                              {describeEvent(event)}
                            </span>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Technical details */}
                <div className="rounded-[1.4rem] border border-white/10 bg-black/12 px-4 py-3">
                  {technicalDetails.map((detail, index) => (
                    <div key={detail.label}>
                      {index > 0 && <Separator className="bg-white/8" />}
                      <div className="flex items-center justify-between gap-4 py-2.5">
                        <p className="text-xs text-[#8ea3a8]">{detail.label}</p>
                        <p className="text-right text-xs text-[#dce5e7]">
                          {detail.value}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </details>
          </div>
        </div>
      </div>
    </div>
  )
}
