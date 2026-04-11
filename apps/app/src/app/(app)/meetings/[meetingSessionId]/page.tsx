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
import { useSession } from '@/lib/auth-client'
import { trpc } from '@/lib/trpc'
import {
  dashedPanelClass,
  heroPanelClass,
  pageShellClass,
  quietTextClass,
  subtleTextClass,
} from '@/lib/brand-styles'
import {
  describeMeetingLifecycleEvent,
  getMeetingRuntimeCopy,
} from '../_lib/runtime-state'
import {
  buildMeetingCopilotDisclosure,
  formatRetentionDays,
  getMeetingParticipationModeDescription,
  getMeetingParticipationModeLabel,
} from '@kodi/db'

type MeetingConsole = NonNullable<
  Awaited<ReturnType<typeof trpc.meeting.getConsole.query>>
>
type MeetingParticipants = MeetingConsole['participants']
type MeetingTranscript = MeetingConsole['transcript']
type MeetingLiveState = MeetingConsole['liveState'] | null
type MeetingEventFeed = MeetingConsole['events']
type MeetingWorkspaceSettings = MeetingConsole['workspaceSettings'] | null
type MeetingControls = MeetingConsole['controls'] | null
type MeetingTranscriptSegment = MeetingTranscript[number]
type MeetingTranscriptTurn = MeetingTranscriptSegment & {
  mergedSegmentCount: number
}
type MeetingChatItem = {
  id: string
  eventType: string
  content: string
  senderName: string
  recipient: string
  occurredAt: Date | string
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
      return 'success' as const
    case 'admitted':
      return 'info' as const
    case 'processing':
      return 'warning' as const
    case 'joining':
    case 'scheduled':
    case 'preparing':
      return 'warning' as const
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
    case 'meeting.chat_message.received':
      return 'Chat received'
    case 'meeting.chat_message.sent':
      return 'Chat sent'
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

function describeEvent(event: MeetingEventFeed[number], provider: string) {
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

  return describeMeetingLifecycleEvent({
    provider,
    eventType: event.eventType,
    payload,
  })
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
  const { data: session } = useSession()
  const orgId = activeOrg?.orgId ?? null
  const currentUserId = session?.user?.id ?? null

  const [consoleData, setConsoleData] = useState<MeetingConsole | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [lastRefreshedAt, setLastRefreshedAt] = useState<Date | null>(null)
  const [controlsSaving, setControlsSaving] = useState(false)

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
  const workspaceSettings: MeetingWorkspaceSettings =
    consoleData?.workspaceSettings ?? null
  const controls: MeetingControls = consoleData?.controls ?? null

  const chronologicalTranscript = useMemo(
    () => collapseTranscriptSegments([...transcript].reverse()),
    [transcript]
  )
  const meetingMetadata = useMemo(
    () => asRecord(meeting?.metadata),
    [meeting?.metadata]
  )
  const runtimeCopy = useMemo(
    () =>
      getMeetingRuntimeCopy({
        provider: meeting?.provider ?? 'meeting',
        status: meeting?.status ?? 'scheduled',
        metadata: meeting?.metadata ?? null,
      }),
    [meeting?.metadata, meeting?.provider, meeting?.status]
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

  const chatMessages = useMemo(
    () =>
      [...events]
        .filter((event) =>
          [
            'meeting.chat_message.received',
            'meeting.chat_message.sent',
          ].includes(event.eventType)
        )
        .reverse()
        .reduce<MeetingChatItem[]>((items, event) => {
          const payload = asRecord(event.payload)
          const message = asRecord(payload?.message)
          const sender = asRecord(message?.sender)
          const content =
            typeof message?.content === 'string' ? message.content.trim() : ''

          if (!content) return items

          items.push({
            id: event.id,
            eventType: event.eventType,
            content,
            senderName:
              typeof sender?.displayName === 'string' && sender.displayName
                ? sender.displayName
                : event.eventType === 'meeting.chat_message.sent'
                  ? 'Kodi'
                  : 'Unknown sender',
            recipient:
              typeof message?.to === 'string' ? message.to : 'everyone',
            occurredAt: event.occurredAt,
          })

          return items
        }, []),
    [events]
  )

  const canManageControls =
    activeOrg?.role === 'owner' ||
    (currentUserId != null && meeting?.hostUserId === currentUserId)

  async function updateControls(input: {
    participationMode?: 'listen_only' | 'chat_enabled' | 'voice_enabled'
    liveResponsesDisabled?: boolean
    liveResponsesDisabledReason?: string
  }) {
    if (!orgId || !meetingSessionId) return

    setControlsSaving(true)

    try {
      await trpc.meeting.updateSessionControls.mutate({
        orgId,
        meetingSessionId,
        ...input,
      })

      const next = await trpc.meeting.getConsole.query({
        orgId,
        meetingSessionId,
        transcriptLimit: 200,
        eventLimit: 20,
      })

      setConsoleData(next as MeetingConsole | null)
      setLastRefreshedAt(new Date())
      setError(null)
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'Failed to update live meeting controls.'
      )
    } finally {
      setControlsSaving(false)
    }
  }

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
              typeof record.title === 'string'
                ? record.title
                : 'Untitled draft',
            toolkitSlug:
              typeof record.toolkitSlug === 'string'
                ? record.toolkitSlug
                : null,
            toolkitName:
              typeof record.toolkitName === 'string'
                ? record.toolkitName
                : null,
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
              typeof record.reviewState === 'string'
                ? record.reviewState
                : null,
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
      <div className="flex min-h-full items-center justify-center p-6 text-sm text-brand-subtle">
        Select a workspace to view meetings.
      </div>
    )
  }

  if (loading) {
    return (
      <div className="mx-auto flex max-w-6xl flex-col gap-6 px-4 py-8">
        <Skeleton className="h-9 w-48 bg-brand-muted" />
        <Skeleton className="h-[220px] bg-brand-muted" />
        <div className="grid gap-6 lg:grid-cols-[1.18fr_0.82fr]">
          <Skeleton className="h-[640px] bg-brand-muted" />
          <Skeleton className="h-[640px] bg-brand-muted" />
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-8">
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      </div>
    )
  }

  if (!meeting) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-8">
        <Alert>
          <AlertDescription>
            This meeting session was not found for the current workspace.
          </AlertDescription>
        </Alert>
      </div>
    )
  }

  return (
    <div className={pageShellClass}>
      <div className="mx-auto flex max-w-6xl flex-col gap-6 px-4 py-8">
        <section className={`${heroPanelClass} rounded-[2rem]`}>
          <div className="border-b border-brand-line px-6 py-5">
            <Link
              href="/meetings"
              className="inline-flex w-fit items-center gap-2 text-sm text-brand-quiet transition hover:text-foreground"
            >
              <ArrowLeft size={16} />
              Back to meetings
            </Link>
          </div>

          <div className="grid gap-6 px-6 py-6 lg:grid-cols-[minmax(0,1.15fr)_minmax(320px,0.85fr)]">
            <div className="space-y-4">
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant={statusTone(meeting.status)}>
                  {statusLabel(meeting.status)}
                </Badge>
                <Badge variant="neutral">
                  {formatProviderLabel(meeting.provider)}
                </Badge>
                <Badge variant="neutral">
                  refresh {Math.round(pollIntervalMs / 1000)}s
                </Badge>
              </div>

              <div className="space-y-3">
                <h1 className="text-3xl font-semibold tracking-tight text-foreground">
                  {meeting.title ?? 'Untitled meeting'}
                </h1>
                <p className={`max-w-2xl text-sm leading-7 ${quietTextClass}`}>
                  {runtimeCopy.description}
                </p>
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="rounded-[1.4rem] border border-brand-line bg-brand-elevated px-4 py-4">
                <div className={`flex items-center gap-2 ${subtleTextClass}`}>
                  <Clock3 size={14} />
                  Started
                </div>
                <p className="mt-3 text-sm text-foreground">
                  {formatDate(meeting.actualStartAt ?? meeting.createdAt)}
                </p>
              </div>
              <div className="rounded-[1.4rem] border border-brand-line bg-brand-elevated px-4 py-4">
                <div className={`flex items-center gap-2 ${subtleTextClass}`}>
                  <RefreshCw size={14} />
                  Last activity
                </div>
                <p className="mt-3 text-sm text-foreground">
                  {formatDate(latestActivityAt)}
                </p>
              </div>
            </div>
          </div>
        </section>

        {failureReason && (
          <Alert variant="destructive">
            <AlertDescription>{failureReason}</AlertDescription>
          </Alert>
        )}

        {runtimeCopy.alertTitle && runtimeCopy.alertDescription && (
          <Alert
            variant={
              runtimeCopy.alertTone === 'danger'
                ? 'destructive'
                : runtimeCopy.alertTone === 'warning'
                  ? 'warning'
                  : 'info'
            }
          >
            <AlertDescription>
              <span className="font-medium">{runtimeCopy.alertTitle}: </span>
              {runtimeCopy.alertDescription}
            </AlertDescription>
          </Alert>
        )}

        <div className="grid gap-6 xl:grid-cols-[minmax(0,1.2fr)_minmax(22rem,0.8fr)]">
          <div className="space-y-6">
            <Card className="border-brand-line">
              <CardHeader>
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-[1.1rem] border border-brand-accent/20 bg-brand-accent-soft text-brand-accent-strong">
                    <Sparkles size={18} />
                  </div>
                  <div>
                    <CardTitle className="text-xl text-foreground">
                      Meeting summary
                    </CardTitle>
                    <CardDescription>
                      The shortest useful version of the meeting so far.
                    </CardDescription>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                {activeTopics.length > 0 && (
                  <div className="flex flex-wrap gap-2">
                    {activeTopics.map((topic) => (
                      <Badge key={topic} variant="neutral">
                        {topic}
                      </Badge>
                    ))}
                  </div>
                )}

                <div className="rounded-[1.5rem] border border-brand-line bg-brand-elevated p-5">
                  <p className="text-sm leading-7 text-foreground">
                    {meeting.liveSummary ??
                      liveState?.summary ??
                      'Kodi has not produced a meeting summary yet.'}
                  </p>
                </div>

                <details className="group rounded-[1.5rem] border border-brand-line bg-brand-elevated p-5">
                  <summary className="cursor-pointer list-none text-sm font-medium text-foreground marker:hidden">
                    Working notes
                  </summary>
                  <p
                    className={`mt-4 whitespace-pre-wrap text-sm leading-6 ${quietTextClass}`}
                  >
                    {rollingNotes ??
                      'Kodi will keep a tighter running set of notes here as the meeting develops.'}
                  </p>
                </details>
              </CardContent>
            </Card>

            <Card className="border-brand-line">
              <CardHeader>
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-[1.1rem] border border-brand-line bg-brand-elevated text-brand-quiet">
                    <Mic2 size={18} />
                  </div>
                  <div>
                    <CardTitle className="text-xl text-foreground">
                      Transcript
                    </CardTitle>
                    <CardDescription>
                      Raw meeting language, grouped into readable speaker turns.
                    </CardDescription>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                {chronologicalTranscript.length === 0 ? (
                  <div
                    className={`${dashedPanelClass} rounded-[1.5rem] p-5 text-sm ${quietTextClass}`}
                  >
                    Transcript lines will appear here once Kodi starts hearing
                    the call.
                  </div>
                ) : (
                  <div className="space-y-3">
                    {chronologicalTranscript.map((segment) => (
                      <div
                        key={segment.id}
                        className="rounded-[1.5rem] border border-brand-line bg-brand-elevated p-4"
                      >
                        <div
                          className={`flex flex-wrap items-center gap-2 text-xs ${subtleTextClass}`}
                        >
                          <span className="font-medium text-foreground">
                            {segment.speakerName ?? 'Unknown speaker'}
                          </span>
                          <span>{formatDate(segment.createdAt)}</span>
                          <Badge variant="neutral">
                            {formatSourceLabel(segment.source)}
                          </Badge>
                          {segment.isPartial && (
                            <Badge variant="warning">Partial</Badge>
                          )}
                        </div>
                        <p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-foreground">
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
            {workspaceSettings && controls && (
              <Card className="border-brand-line">
                <CardHeader>
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-[1.1rem] border border-brand-line bg-brand-elevated text-brand-quiet">
                      <CheckCircle2 size={18} />
                    </div>
                    <div>
                      <CardTitle className="text-xl text-foreground">
                        Live participation controls
                      </CardTitle>
                      <CardDescription>
                        These controls narrow how Kodi can participate in this
                        meeting without changing the workspace defaults.
                      </CardDescription>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant="outline">
                      {getMeetingParticipationModeLabel(
                        controls.participationMode
                      )}
                    </Badge>
                    {controls.liveResponsesDisabled ? (
                      <Badge variant="destructive">Live replies paused</Badge>
                    ) : (
                      <Badge variant="success">Live replies allowed</Badge>
                    )}
                    {controls.allowHostControls && (
                      <Badge variant="neutral">Starter controls on</Badge>
                    )}
                  </div>

                  <div className="grid gap-3">
                    {(
                      ['listen_only', 'chat_enabled', 'voice_enabled'] as const
                    ).map((mode) => {
                      const active = controls.participationMode === mode

                      return (
                        <button
                          key={mode}
                          type="button"
                          disabled={!canManageControls || controlsSaving}
                          onClick={() =>
                            void updateControls({
                              participationMode: mode,
                            })
                          }
                          className={`rounded-[1.25rem] border px-4 py-4 text-left transition ${
                            active
                              ? 'border-foreground bg-brand-accent-soft text-foreground'
                              : 'border-brand-line bg-brand-elevated text-brand-quiet hover:border-foreground/20 hover:text-foreground'
                          }`}
                        >
                          <p className="text-sm font-medium">
                            {getMeetingParticipationModeLabel(mode)}
                          </p>
                          <p className="mt-2 text-xs leading-5">
                            {getMeetingParticipationModeDescription(mode)}
                          </p>
                        </button>
                      )
                    })}
                  </div>

                  <div className="rounded-[1.25rem] border border-brand-line bg-brand-elevated p-4">
                    <p className="text-sm font-medium text-foreground">
                      Live reply kill switch
                    </p>
                    <p className={`mt-2 text-sm leading-6 ${quietTextClass}`}>
                      Pause live chat and voice replies immediately without
                      ending the meeting session. Owners can always do this. If
                      starter controls are enabled, the meeting starter can too.
                    </p>
                    <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center">
                      <Button
                        type="button"
                        variant={
                          controls.liveResponsesDisabled
                            ? 'outline'
                            : 'destructive'
                        }
                        disabled={!canManageControls || controlsSaving}
                        onClick={() =>
                          void updateControls({
                            liveResponsesDisabled:
                              !controls.liveResponsesDisabled,
                            liveResponsesDisabledReason:
                              controls.liveResponsesDisabled
                                ? undefined
                                : 'Paused from the meeting detail page.',
                          })
                        }
                      >
                        {controlsSaving
                          ? 'Updating...'
                          : controls.liveResponsesDisabled
                            ? 'Resume live replies'
                            : 'Pause live replies'}
                      </Button>
                      {controls.liveResponsesDisabledReason && (
                        <span className="text-xs text-brand-quiet">
                          {controls.liveResponsesDisabledReason}
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="rounded-[1.25rem] border border-dashed border-brand-line bg-brand-elevated p-4">
                    <p className="text-[11px] uppercase tracking-[0.2em] text-brand-subtle">
                      Meeting trust contract
                    </p>
                    <div className="mt-3 space-y-2 text-sm leading-6 text-foreground">
                      {buildMeetingCopilotDisclosure(workspaceSettings).map(
                        (line) => (
                          <p key={line}>{line}</p>
                        )
                      )}
                    </div>
                    <Separator className="my-4" />
                    <div className="flex flex-wrap gap-3 text-xs text-brand-quiet">
                      <span>
                        Transcript retention:{' '}
                        {formatRetentionDays(
                          workspaceSettings.transcriptRetentionDays
                        )}
                      </span>
                      <span>
                        Artifact retention:{' '}
                        {formatRetentionDays(
                          workspaceSettings.artifactRetentionDays
                        )}
                      </span>
                    </div>
                  </div>

                  {!canManageControls && (
                    <Alert>
                      <AlertDescription>
                        Only workspace owners and, when enabled, the meeting
                        starter can change these live controls.
                      </AlertDescription>
                    </Alert>
                  )}
                </CardContent>
              </Card>
            )}

            <Card className="border-brand-line">
              <CardHeader>
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-[1.1rem] border border-brand-line bg-brand-elevated text-brand-quiet">
                    <Users size={18} />
                  </div>
                  <div>
                    <CardTitle className="text-xl text-foreground">
                      Meeting chat
                    </CardTitle>
                    <CardDescription>
                      Review in-meeting Zoom chat messages that Kodi observed
                      during the session.
                    </CardDescription>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                {meeting.provider === 'zoom' ? (
                  <>
                    <div
                      className={`${dashedPanelClass} rounded-[1.4rem] p-4 text-sm ${quietTextClass}`}
                    >
                      This branch keeps meeting chat as a read-only activity
                      feed. Sending new in-meeting chat messages is not included
                      here.
                    </div>

                    {chatMessages.length === 0 ? (
                      <div
                        className={`${dashedPanelClass} rounded-[1.4rem] p-4 text-sm ${quietTextClass}`}
                      >
                        In-meeting Zoom chat messages will appear here once Kodi
                        receives or sends them.
                      </div>
                    ) : (
                      <div className="space-y-3">
                        {chatMessages.map((message) => (
                          <div
                            key={message.id}
                            className="rounded-[1.4rem] border border-brand-line bg-brand-elevated p-4"
                          >
                            <div
                              className={`flex flex-wrap items-center gap-2 text-xs ${subtleTextClass}`}
                            >
                              <span className="font-medium text-foreground">
                                {message.senderName}
                              </span>
                              <Badge variant="neutral">
                                {formatEventLabel(message.eventType)}
                              </Badge>
                              <span>{formatDate(message.occurredAt)}</span>
                              <span>
                                to {message.recipient.replace(/_/g, ' ')}
                              </span>
                            </div>
                            <p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-foreground">
                              {message.content}
                            </p>
                          </div>
                        ))}
                      </div>
                    )}
                  </>
                ) : (
                  <div
                    className={`${dashedPanelClass} rounded-[1.4rem] p-4 text-sm ${quietTextClass}`}
                  >
                    In-meeting chat activity is available for Zoom sessions
                    right now.
                  </div>
                )}
              </CardContent>
            </Card>

            <Card className="border-brand-line">
              <CardHeader>
                <CardTitle className="text-xl text-foreground">
                  Follow-up
                </CardTitle>
                <CardDescription>
                  The handful of outputs that are actually worth acting on.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-5">
                <div className="space-y-3">
                  <div>
                    <p
                      className={`text-[11px] uppercase tracking-[0.2em] ${subtleTextClass}`}
                    >
                      Draft actions
                    </p>
                    <div className="mt-3 space-y-3">
                      {draftActions.length > 0 ? (
                        draftActions.map((draft, index) => (
                          <div
                            key={`${draft.title}-${index}`}
                            className="rounded-[1.4rem] border border-brand-line bg-brand-elevated p-4"
                          >
                            <div className="flex items-start justify-between gap-3">
                              <div className="space-y-2">
                                <p className="text-sm font-medium text-foreground">
                                  {draft.title}
                                </p>
                                <div className="flex flex-wrap gap-2 text-xs">
                                  {(draft.toolkitName ?? draft.toolkitSlug) && (
                                    <Badge variant="neutral">
                                      {draft.toolkitName ?? draft.toolkitSlug}
                                    </Badge>
                                  )}
                                  {draft.actionType && (
                                    <Badge variant="neutral">
                                      {draft.actionType.replace(/_/g, ' ')}
                                    </Badge>
                                  )}
                                  {draft.approvalRequired && (
                                    <Badge variant="warning">
                                      Approval required
                                    </Badge>
                                  )}
                                </div>
                              </div>
                              {draft.confidence != null && (
                                <Badge variant="neutral">
                                  {Math.round(draft.confidence * 100)}%
                                </Badge>
                              )}
                            </div>

                            {draft.targetSummary && (
                              <p className={`mt-3 text-sm ${quietTextClass}`}>
                                Target: {draft.targetSummary}
                              </p>
                            )}

                            {draft.rationale && (
                              <p className="mt-2 text-sm leading-6 text-foreground">
                                {draft.rationale}
                              </p>
                            )}

                            {draft.sourceEvidence.length > 0 && (
                              <details className="mt-3">
                                <summary
                                  className={`cursor-pointer text-sm ${subtleTextClass}`}
                                >
                                  Why Kodi suggested this
                                </summary>
                                <p
                                  className={`mt-2 text-sm leading-6 ${quietTextClass}`}
                                >
                                  {draft.sourceEvidence[0]}
                                </p>
                              </details>
                            )}
                          </div>
                        ))
                      ) : (
                        <div
                          className={`${dashedPanelClass} rounded-[1.4rem] p-4 text-sm ${quietTextClass}`}
                        >
                          Draft actions will appear here once Kodi can connect
                          meeting follow-up to tools available in the workspace.
                        </div>
                      )}
                    </div>
                  </div>

                  <div>
                    <p
                      className={`text-[11px] uppercase tracking-[0.2em] ${subtleTextClass}`}
                    >
                      Candidate action items
                    </p>
                    <div className="mt-3 space-y-3">
                      {candidateTasks.length > 0 ? (
                        candidateTasks.map((task, index) => (
                          <div
                            key={`${task.title}-${index}`}
                            className="rounded-[1.4rem] border border-brand-line bg-brand-elevated p-4"
                          >
                            <div className="flex items-start justify-between gap-3">
                              <p className="text-sm font-medium text-foreground">
                                {task.title}
                              </p>
                              {task.confidence != null && (
                                <Badge variant="neutral">
                                  {Math.round(task.confidence * 100)}%
                                </Badge>
                              )}
                            </div>
                            {task.ownerHint && (
                              <p className={`mt-2 text-sm ${quietTextClass}`}>
                                Owner hint: {task.ownerHint}
                              </p>
                            )}
                            {task.sourceEvidence.length > 0 && (
                              <details className="mt-3">
                                <summary
                                  className={`cursor-pointer text-sm ${subtleTextClass}`}
                                >
                                  Why Kodi suggested this
                                </summary>
                                <p
                                  className={`mt-2 text-sm leading-6 ${quietTextClass}`}
                                >
                                  {task.sourceEvidence[0]}
                                </p>
                              </details>
                            )}
                          </div>
                        ))
                      ) : (
                        <div
                          className={`${dashedPanelClass} rounded-[1.4rem] p-4 text-sm ${quietTextClass}`}
                        >
                          Candidate follow-up will appear here when Kodi finds
                          concrete next steps in the conversation.
                        </div>
                      )}
                    </div>
                  </div>

                  {(decisions.length > 0 ||
                    openQuestions.length > 0 ||
                    risks.length > 0) && (
                    <div className="grid gap-3">
                      {decisions.length > 0 && (
                        <div className="rounded-[1.4rem] border border-brand-line bg-brand-elevated p-4">
                          <p
                            className={`text-[11px] uppercase tracking-[0.2em] ${subtleTextClass}`}
                          >
                            Decisions
                          </p>
                          <div className="mt-3 space-y-2">
                            {decisions.map((decision) => (
                              <div
                                key={decision}
                                className="flex items-start gap-3 text-sm text-foreground"
                              >
                                <CheckCircle2
                                  size={15}
                                  className="mt-0.5 text-brand-success"
                                />
                                <span>{decision}</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {openQuestions.length > 0 && (
                        <div className="rounded-[1.4rem] border border-brand-line bg-brand-elevated p-4">
                          <p
                            className={`text-[11px] uppercase tracking-[0.2em] ${subtleTextClass}`}
                          >
                            Open questions
                          </p>
                          <div className="mt-3 space-y-2 text-sm text-foreground">
                            {openQuestions.map((question) => (
                              <p key={question}>{question}</p>
                            ))}
                          </div>
                        </div>
                      )}

                      {risks.length > 0 && (
                        <div className="rounded-[1.4rem] border border-brand-line bg-brand-elevated p-4">
                          <p
                            className={`text-[11px] uppercase tracking-[0.2em] ${subtleTextClass}`}
                          >
                            Risks
                          </p>
                          <div className="mt-3 space-y-2 text-sm text-foreground">
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

            <details className="group kodi-panel-surface rounded-[1.75rem] border border-brand-line p-5 shadow-brand-panel">
              <summary className="cursor-pointer list-none text-sm font-medium text-foreground marker:hidden">
                People, activity, and diagnostics
              </summary>
              <p className={`mt-2 text-sm leading-6 ${quietTextClass}`}>
                Keep the meeting page focused by tucking roster, raw lifecycle,
                and provider details here.
              </p>

              <div className="mt-4 space-y-3">
                <div className="rounded-[1.5rem] border border-brand-line bg-brand-elevated p-4">
                  <div className="flex items-center gap-2 text-sm font-medium text-foreground">
                    <Users size={16} className="text-brand-quiet" />
                    People
                  </div>
                  {participants.length === 0 ? (
                    <p className={`mt-3 text-sm ${quietTextClass}`}>
                      Participant activity will appear here.
                    </p>
                  ) : (
                    <div className="mt-3 space-y-3">
                      {participants.map((participant) => (
                        <div
                          key={participant.id}
                          className="rounded-[1.2rem] border border-brand-line bg-background p-4"
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                              <p className="truncate text-sm font-medium text-foreground">
                                {participant.displayName ??
                                  participant.email ??
                                  'Unknown participant'}
                              </p>
                              <p
                                className={`mt-1 truncate text-xs ${subtleTextClass}`}
                              >
                                {participant.email ?? 'No email captured'}
                              </p>
                            </div>
                            <Badge
                              variant={
                                participant.leftAt ? 'neutral' : 'success'
                              }
                            >
                              {participant.leftAt ? 'Left' : 'In call'}
                            </Badge>
                          </div>
                          <p className={`mt-3 text-xs ${subtleTextClass}`}>
                            Joined {formatDate(participant.joinedAt)}
                          </p>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {compactTimelineEvents.length === 0 ? (
                  <div
                    className={`${dashedPanelClass} rounded-[1.4rem] p-5 text-sm ${quietTextClass}`}
                  >
                    Kodi will add the important meeting moments here.
                  </div>
                ) : (
                  compactTimelineEvents.map((event) => (
                    <div
                      key={event.id}
                      className="rounded-[1.4rem] border border-brand-line bg-brand-elevated p-4"
                    >
                      <div
                        className={`flex flex-wrap items-center gap-2 text-xs ${subtleTextClass}`}
                      >
                        <Badge variant="neutral">
                          {formatEventLabel(event.eventType)}
                        </Badge>
                        <span>{formatDate(event.occurredAt)}</span>
                      </div>
                      {describeEvent(event, meeting.provider) && (
                        <p className="mt-3 text-sm leading-6 text-foreground">
                          {describeEvent(event, meeting.provider)}
                        </p>
                      )}
                    </div>
                  ))
                )}
              </div>

              <div className="mt-4 rounded-[1.5rem] border border-brand-line bg-brand-elevated px-4 py-3">
                {technicalDetails.map((detail, index) => (
                  <div key={detail.label}>
                    {index > 0 && <Separator className="bg-border" />}
                    <div className="flex items-start justify-between gap-4 py-3">
                      <p
                        className={`text-xs uppercase tracking-[0.18em] ${subtleTextClass}`}
                      >
                        {detail.label}
                      </p>
                      <p className="max-w-[16rem] text-right text-sm text-foreground">
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
