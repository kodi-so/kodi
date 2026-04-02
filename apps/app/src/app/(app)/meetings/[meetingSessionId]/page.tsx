'use client'

import Link from 'next/link'
import { useParams } from 'next/navigation'
import { useEffect, useMemo, useState } from 'react'
import { ArrowLeft, Clock3, Mic2, Users } from 'lucide-react'
import {
  Alert,
  AlertDescription,
  Badge,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Skeleton,
} from '@kodi/ui'
import { useOrg } from '@/lib/org-context'
import { trpc } from '@/lib/trpc'

type MeetingRecord = NonNullable<
  Awaited<ReturnType<typeof trpc.meeting.getById.query>>
>
type MeetingParticipants = Awaited<ReturnType<typeof trpc.meeting.getParticipants.query>>
type MeetingTranscript = Awaited<ReturnType<typeof trpc.meeting.getTranscript.query>>
type MeetingLiveState = Awaited<ReturnType<typeof trpc.meeting.getLiveState.query>>

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

export default function MeetingDetailsPage() {
  const params = useParams<{ meetingSessionId: string }>()
  const meetingSessionId = params.meetingSessionId
  const { activeOrg } = useOrg()

  const [meeting, setMeeting] = useState<MeetingRecord | null>(null)
  const [participants, setParticipants] = useState<MeetingParticipants>([])
  const [transcript, setTranscript] = useState<MeetingTranscript>([])
  const [liveState, setLiveState] = useState<MeetingLiveState>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!activeOrg || !meetingSessionId) {
      setLoading(false)
      return
    }

    const orgId = activeOrg.orgId
    let cancelled = false

    async function load() {
      try {
        const [meetingRecord, participantItems, transcriptItems, state] =
          await Promise.all([
            trpc.meeting.getById.query({
              orgId,
              meetingSessionId,
            }),
            trpc.meeting.getParticipants.query({
              orgId,
              meetingSessionId,
            }),
            trpc.meeting.getTranscript.query({
              orgId,
              meetingSessionId,
              limit: 200,
            }),
            trpc.meeting.getLiveState.query({
              orgId,
              meetingSessionId,
            }),
          ])

        if (cancelled) return
        setMeeting(meetingRecord as MeetingRecord | null)
        setParticipants(participantItems)
        setTranscript(transcriptItems)
        setLiveState(state)
        setError(null)
      } catch (err) {
        if (cancelled) return
        setError(
          err instanceof Error ? err.message : 'Failed to load meeting session.'
        )
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    void load()
    const interval = window.setInterval(() => {
      void load()
    }, 5000)

    return () => {
      cancelled = true
      window.clearInterval(interval)
    }
  }, [activeOrg?.orgId, meetingSessionId])

  const chronologicalTranscript = useMemo(() => {
    return [...transcript].reverse()
  }, [transcript])
  const rtmsGateway = useMemo(() => {
    if (
      !meeting?.metadata ||
      typeof meeting.metadata !== 'object' ||
      Array.isArray(meeting.metadata)
    ) {
      return null
    }

    const candidate = (meeting.metadata as Record<string, unknown>).rtmsGateway
    if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate)) {
      return null
    }

    return candidate as Record<string, unknown>
  }, [meeting?.metadata])
  const meetingMetadata = useMemo(() => {
    if (
      !meeting?.metadata ||
      typeof meeting.metadata !== 'object' ||
      Array.isArray(meeting.metadata)
    ) {
      return null
    }

    return meeting.metadata as Record<string, unknown>
  }, [meeting?.metadata])
  const failureReason = useMemo(() => {
    const failure =
      meetingMetadata?.failure &&
      typeof meetingMetadata.failure === 'object' &&
      !Array.isArray(meetingMetadata.failure)
        ? (meetingMetadata.failure as Record<string, unknown>)
        : null

    const kind =
      failure && typeof failure.kind === 'string' ? failure.kind : null
    const retryable =
      failure && typeof failure.retryable === 'boolean'
        ? failure.retryable
        : null
    const message =
      typeof meetingMetadata?.lastErrorMessage === 'string'
        ? meetingMetadata.lastErrorMessage
        : typeof failure?.message === 'string'
          ? failure.message
          : null

    if (!kind && !message) return null

    const retryText =
      retryable === null ? null : retryable ? 'Retryable' : 'Needs manual fix'

    return [kind, retryText, message].filter(Boolean).join(' · ')
  }, [meetingMetadata])
  const providerRuntimeSource = useMemo(() => {
    const transport =
      typeof meetingMetadata?.transport === 'string'
        ? meetingMetadata.transport
        : rtmsGateway && typeof rtmsGateway.status === 'string'
          ? 'rtms'
          : null

    if (!transport) return formatProviderLabel(meeting.provider)

    return `${formatProviderLabel(meeting.provider)} via ${transport}`
  }, [meeting.provider, meetingMetadata, rtmsGateway])

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
    <div className="min-h-full bg-[linear-gradient(180deg,_rgba(24,24,27,0.45),_rgba(10,10,15,0.95))]">
      <div className="mx-auto flex max-w-6xl flex-col gap-6 px-4 py-8">
        <div className="flex flex-col gap-4 rounded-3xl border border-zinc-800 bg-zinc-950/80 p-6 shadow-2xl shadow-black/20">
          <Link
            href="/meetings"
            className="inline-flex w-fit items-center gap-2 text-sm text-zinc-400 transition hover:text-white"
          >
            <ArrowLeft size={16} />
            Back to meetings
          </Link>

          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div className="space-y-3">
              <div className="flex flex-wrap items-center gap-2">
                <Badge className={statusTone(meeting.status)}>
                  {statusLabel(meeting.status)}
                </Badge>
                <Badge className="border-zinc-700 bg-zinc-800 text-zinc-300">
                  {formatProviderLabel(meeting.provider)}
                </Badge>
              </div>
              <div>
                <h1 className="text-3xl font-semibold tracking-tight text-white">
                  {meeting.title ?? 'Untitled meeting'}
                </h1>
                <p className="mt-2 text-sm text-zinc-400">
                  Meeting session {meeting.id}
                </p>
              </div>
            </div>

            <div className="grid gap-3 text-sm text-zinc-300 sm:grid-cols-2">
              <div className="rounded-2xl border border-zinc-800 bg-zinc-900/70 px-4 py-3">
                <div className="flex items-center gap-2 text-zinc-500">
                  <Clock3 size={14} />
                  Started
                </div>
                <p className="mt-2 text-white">
                  {formatDate(meeting.actualStartAt ?? meeting.createdAt)}
                </p>
              </div>
              <div className="rounded-2xl border border-zinc-800 bg-zinc-900/70 px-4 py-3">
                <div className="flex items-center gap-2 text-zinc-500">
                  <Clock3 size={14} />
                  Ended
                </div>
                <p className="mt-2 text-white">{formatDate(meeting.endedAt)}</p>
              </div>
            </div>
          </div>
        </div>

        <div className="grid gap-6 lg:grid-cols-[1.15fr_0.85fr]">
          <Card className="border-zinc-800 bg-zinc-900/60">
            <CardHeader>
              <CardTitle className="text-xl text-white">Transcript stream</CardTitle>
              <CardDescription className="text-zinc-400">
                Latest transcript segments stored for this meeting.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {chronologicalTranscript.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-zinc-800 bg-zinc-950/50 p-5 text-sm text-zinc-500">
                  RTMS transcript segments will appear here once the gateway begins forwarding them.
                </div>
              ) : (
                <div className="space-y-3">
                  {chronologicalTranscript.map((segment) => (
                    <div
                      key={segment.id}
                      className="rounded-2xl border border-zinc-800 bg-zinc-950/60 p-4"
                    >
                      <div className="flex flex-wrap items-center gap-2 text-xs text-zinc-500">
                        <span className="font-medium text-zinc-300">
                          {segment.speakerName ?? 'Unknown speaker'}
                        </span>
                        <span>{formatDate(segment.createdAt)}</span>
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

          <div className="flex flex-col gap-6">
            <Card className="border-zinc-800 bg-zinc-900/60">
              <CardHeader>
                <CardTitle className="text-xl text-white">Live status</CardTitle>
                <CardDescription className="text-zinc-400">
                  Current meeting runtime state and provider delivery context.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4 text-sm text-zinc-300">
                <div className="rounded-2xl border border-zinc-800 bg-zinc-950/50 p-4">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge className={statusTone(meeting.status)}>
                      {statusLabel(meeting.status)}
                    </Badge>
                    <Badge className="border-zinc-700 bg-zinc-800 text-zinc-300">
                      {providerRuntimeSource}
                    </Badge>
                  </div>
                  <p className="mt-3 leading-6 text-zinc-200">
                    {statusDescription(meeting.status)}
                  </p>
                  {failureReason && (
                    <div className="mt-4 rounded-2xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-red-100">
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
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-2xl border border-indigo-500/20 bg-indigo-500/10 text-indigo-300">
                    <Mic2 size={18} />
                  </div>
                  <div>
                    <CardTitle className="text-xl text-white">Live state</CardTitle>
                    <CardDescription className="text-zinc-400">
                      Most recent state snapshot generated for this meeting.
                    </CardDescription>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-4 text-sm text-zinc-300">
                <div className="rounded-2xl border border-zinc-800 bg-zinc-950/50 p-4">
                  <p className="text-xs uppercase tracking-[0.18em] text-zinc-500">
                    Summary
                  </p>
                  <p className="mt-3 leading-6 text-zinc-200">
                    {meeting.liveSummary ??
                      liveState?.summary ??
                      'No live summary has been generated yet.'}
                  </p>
                </div>

                <div className="rounded-2xl border border-zinc-800 bg-zinc-950/50 p-4">
                  <p className="text-xs uppercase tracking-[0.18em] text-zinc-500">
                    Active topics
                  </p>
                  <div className="mt-3 flex flex-wrap gap-2">
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
                      <p className="text-zinc-500">No active topics yet.</p>
                    )}
                  </div>
                </div>

                <div className="rounded-2xl border border-zinc-800 bg-zinc-950/50 p-4">
                  <p className="text-xs uppercase tracking-[0.18em] text-zinc-500">
                    RTMS gateway
                  </p>
                  {rtmsGateway ? (
                    <div className="mt-3 space-y-2 text-sm text-zinc-300">
                      <div className="flex flex-wrap gap-2">
                        {typeof rtmsGateway.status === 'string' && (
                          <Badge className={statusTone(rtmsGateway.status)}>
                            {rtmsGateway.status}
                          </Badge>
                        )}
                        {typeof rtmsGateway.retryCount === 'number' && (
                          <Badge className="border-zinc-700 bg-zinc-800 text-zinc-300">
                            retries {rtmsGateway.retryCount}
                          </Badge>
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
                  <div className="flex h-10 w-10 items-center justify-center rounded-2xl border border-sky-500/20 bg-sky-500/10 text-sky-300">
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
                  <div className="rounded-2xl border border-dashed border-zinc-800 bg-zinc-950/50 p-5 text-sm text-zinc-500">
                    Participant join and leave events will populate this panel.
                  </div>
                ) : (
                  participants.map((participant) => (
                    <div
                      key={participant.id}
                      className="rounded-2xl border border-zinc-800 bg-zinc-950/60 p-4"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium text-white">
                            {participant.displayName ?? participant.email ?? 'Unknown participant'}
                          </p>
                          <p className="mt-1 truncate text-xs text-zinc-500">
                            {participant.email ?? 'No email captured'}
                          </p>
                        </div>
                        <div className="flex flex-wrap gap-2">
                          {participant.isHost && (
                            <Badge className="border-indigo-500/30 bg-indigo-500/15 text-indigo-200">
                              Host
                            </Badge>
                          )}
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
                      </div>
                      <div className="mt-3 flex flex-wrap gap-4 text-xs text-zinc-500">
                        <span>Joined {formatDate(participant.joinedAt)}</span>
                        {participant.leftAt && <span>Left {formatDate(participant.leftAt)}</span>}
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
