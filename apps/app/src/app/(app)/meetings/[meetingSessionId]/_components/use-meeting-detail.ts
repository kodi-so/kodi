'use client'

import { useParams, useRouter } from 'next/navigation'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useOrg } from '@/lib/org-context'
import { useSession } from '@/lib/auth-client'
import { trpc } from '@/lib/trpc'
import { resolveSessionId } from '@/lib/meeting-id'
import { getMeetingRuntimeCopy } from '../../_lib/runtime-state'
import {
  asArray,
  asRecord,
  formatHealthStatus,
  formatProviderLabel,
  formatTime,
  pollIntervalForStatus,
  truncateMiddle,
} from './utils'
import {
  collapseTranscriptSegments,
  groupTranscriptBySpeaker,
  SPEAKER_COLORS,
} from './transcript-utils'
import type {
  AskKodiAnswer,
  MeetingArtifact,
  MeetingChatItem,
  MeetingConsole,
  MeetingControls,
  MeetingEventFeed,
  MeetingHealth,
  MeetingLiveState,
  MeetingParticipants,
  MeetingRetryAttempt,
  MeetingTranscript,
  MeetingWorkspaceSettings,
  RecapTarget,
  SyncTarget,
  WorkItem,
} from './types'

export function useMeetingDetail() {
  const params = useParams<{ meetingSessionId: string }>()
  const meetingSessionId = resolveSessionId(params.meetingSessionId)
  const { activeOrg } = useOrg()
  const { data: session } = useSession()
  const router = useRouter()
  const orgId = activeOrg?.orgId ?? null
  const currentUserId = session?.user?.id ?? null

  // --- Core state ---
  const [consoleData, setConsoleData] = useState<MeetingConsole | null>(null)
  const [deletingMeeting, setDeletingMeeting] = useState(false)
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [lastRefreshedAt, setLastRefreshedAt] = useState<Date | null>(null)
  const [controlsSaving, setControlsSaving] = useState(false)
  const [localCaptureError, setLocalCaptureError] = useState<string | null>(null)
  const [localCaptureActive, setLocalCaptureActive] = useState(false)
  // Live transcript driven directly by the browser SpeechRecognition events,
  // so the user sees text the instant they speak — no server roundtrip.
  // The server persists the canonical version for history.
  const [liveInterimText, setLiveInterimText] = useState<string>('')
  const [liveFinalLines, setLiveFinalLines] = useState<
    { id: string; text: string; createdAt: Date }[]
  >([])
  // Observability: explicit phase of the capture pipeline + live signals so
  // the UI can prove to the user that audio is being received, even before
  // the first transcript line.
  type CapturePhase =
    | 'idle'
    | 'initializing'
    | 'listening'
    | 'hearing'
    | 'transcribing'
  const [capturePhase, setCapturePhase] = useState<CapturePhase>('idle')
  const [audioLevel, setAudioLevel] = useState(0)
  const [lastSpeechAt, setLastSpeechAt] = useState<Date | null>(null)
  const [transcriptCount, setTranscriptCount] = useState(0)

  // --- Ask Kodi ---
  const [askQuestion, setAskQuestion] = useState('')
  const [askPending, setAskPending] = useState(false)
  const [answers, setAnswers] = useState<AskKodiAnswer[]>([])
  const [askSheetOpen, setAskSheetOpen] = useState(false)
  const [speakingAnswerId, setSpeakingAnswerId] = useState<string | null>(null)
  const answerBottomRef = useRef<HTMLDivElement>(null)
  const answerScrollRef = useRef<HTMLDivElement>(null)

  // --- Transcript ---
  const [collapsedSpeakers, setCollapsedSpeakers] = useState<Set<string>>(
    new Set()
  )
  const transcriptScrollRef = useRef<HTMLDivElement>(null)
  const transcriptBottomRef = useRef<HTMLDivElement>(null)
  const [transcriptAtBottom, setTranscriptAtBottom] = useState(true)
  const speakerColorMap = useRef<Map<string, string>>(new Map())

  // --- Post-meeting review ---
  const [artifacts, setArtifacts] = useState<MeetingArtifact[]>([])
  const [workItemsList, setWorkItemsList] = useState<WorkItem[]>([])
  const [artifactsLoading, setArtifactsLoading] = useState(false)
  const [artifactsLoaded, setArtifactsLoaded] = useState(false)
  const [retryingArtifacts, setRetryingArtifacts] = useState(false)
  const [editingWorkItemId, setEditingWorkItemId] = useState<string | null>(
    null
  )
  const [editWorkItemTitle, setEditWorkItemTitle] = useState('')
  const [editWorkItemOwnerHint, setEditWorkItemOwnerHint] = useState('')
  const [editWorkItemDueAt, setEditWorkItemDueAt] = useState('')
  const [workItemSaving, setWorkItemSaving] = useState<string | null>(null)

  // --- Sync + recap delivery ---
  const [syncingItem, setSyncingItem] = useState<{
    id: string
    target: SyncTarget
  } | null>(null)
  const [syncError, setSyncError] = useState<string | null>(null)
  const [recapDelivering, setRecapDelivering] = useState(false)
  const [recapDeliverTarget, setRecapDeliverTarget] =
    useState<RecapTarget | null>(null)
  const [recapDeliverError, setRecapDeliverError] = useState<string | null>(
    null
  )
  const [slackModalOpen, setSlackModalOpen] = useState(false)
  const [slackDefaultChannel, setSlackDefaultChannel] = useState<string | null>(
    null
  )
  const [connectionStatus, setConnectionStatus] = useState<Record<
    string,
    boolean
  > | null>(null)

  // --- Derived data ---
  const pollIntervalMs = useMemo(
    () => pollIntervalForStatus(consoleData?.meeting.status),
    [consoleData?.meeting.status]
  )

  const meeting = consoleData?.meeting ?? null
  const participants: MeetingParticipants = consoleData?.participants ?? []
  const transcript: MeetingTranscript = consoleData?.transcript ?? []
  const liveState: MeetingLiveState = consoleData?.liveState ?? null
  const events: MeetingEventFeed = consoleData?.events ?? []
  const health: MeetingHealth = consoleData?.health ?? null
  const localSession = consoleData?.localSession ?? null
  const workspaceSettings: MeetingWorkspaceSettings =
    consoleData?.workspaceSettings ?? null
  const controls: MeetingControls = consoleData?.controls ?? null

  const chronologicalTranscript = useMemo(
    () => collapseTranscriptSegments([...transcript].reverse()),
    [transcript]
  )

  const transcriptSpeakerGroups = useMemo(() => {
    const groups = groupTranscriptBySpeaker(chronologicalTranscript)
    for (const group of groups) {
      if (!speakerColorMap.current.has(group.speaker)) {
        const idx = speakerColorMap.current.size % SPEAKER_COLORS.length
        speakerColorMap.current.set(group.speaker, SPEAKER_COLORS[idx]!)
      }
    }
    return groups
  }, [chronologicalTranscript])

  const handleTranscriptScroll = useCallback(() => {
    const el = transcriptScrollRef.current
    if (!el) return
    const distFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight
    setTranscriptAtBottom(distFromBottom < 60)
  }, [])

  const meetingMetadata = useMemo(
    () => asRecord(meeting?.metadata),
    [meeting?.metadata]
  )
  const healthMetadata = useMemo(
    () => asRecord(health?.metadata),
    [health?.metadata]
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
    return candidates.sort(
      (left, right) => right.getTime() - left.getTime()
    )[0]
  }, [events, transcript, liveState?.createdAt, meeting?.updatedAt])

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

  const retryHistory = useMemo(
    () =>
      asArray(meetingMetadata?.retryHistory)
        .map((attempt) => {
          const record = asRecord(attempt)
          if (!record) return null
          return {
            attempt:
              typeof record.attempt === 'number' ? record.attempt : null,
            status: typeof record.status === 'string' ? record.status : null,
            startedAt:
              typeof record.startedAt === 'string' ? record.startedAt : null,
            completedAt:
              typeof record.completedAt === 'string'
                ? record.completedAt
                : null,
            failureKind:
              typeof record.failureKind === 'string'
                ? record.failureKind
                : null,
            retryable:
              typeof record.retryable === 'boolean' ? record.retryable : null,
            message:
              typeof record.message === 'string' ? record.message : null,
            httpStatus:
              typeof record.httpStatus === 'number' ? record.httpStatus : null,
          } satisfies MeetingRetryAttempt
        })
        .filter(
          (attempt): attempt is MeetingRetryAttempt => attempt !== null
        ),
    [meetingMetadata?.retryHistory]
  )

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

  const candidateActionItems = useMemo(
    () =>
      asArray(liveState?.candidateActionItems)
        .map((item) => {
          const record = asRecord(item)
          if (!record) return null
          return {
            title:
              typeof record.title === 'string'
                ? record.title
                : 'Untitled action item',
            ownerHint:
              typeof record.ownerHint === 'string' ? record.ownerHint : null,
            confidence:
              typeof record.confidence === 'number' ? record.confidence : null,
            sourceEvidence: asArray(record.sourceEvidence).filter(
              (value): value is string => typeof value === 'string'
            ),
          }
        })
        .filter(
          (
            item
          ): item is {
            title: string
            ownerHint: string | null
            confidence: number | null
            sourceEvidence: string[]
          } => item !== null
        ),
    [liveState?.candidateActionItems]
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
              typeof record.actionType === 'string'
                ? record.actionType
                : null,
            targetSummary:
              typeof record.targetSummary === 'string'
                ? record.targetSummary
                : null,
            rationale:
              typeof record.rationale === 'string' ? record.rationale : null,
            confidence:
              typeof record.confidence === 'number'
                ? record.confidence
                : null,
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
      { label: 'Provider', value: formatProviderLabel(meeting.provider) },
      { label: 'Provider health', value: formatHealthStatus(health?.status) },
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
      { label: 'Last refresh', value: formatTime(lastRefreshedAt) },
      { label: 'Latest activity', value: formatTime(latestActivityAt) },
      { label: 'Health checked', value: formatTime(health?.observedAt) },
    ]
  }, [
    health?.observedAt,
    health?.status,
    lastRefreshedAt,
    latestActivityAt,
    meeting,
  ])

  const canManageControls =
    activeOrg?.role === 'owner' ||
    (currentUserId != null && meeting?.hostUserId === currentUserId)

  const localIngestTokenKey = meetingSessionId
    ? `kodi.localMeeting.${meetingSessionId}.ingestToken`
    : null

  // --- Effects ---

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
          err instanceof Error
            ? err.message
            : 'Failed to load meeting session.'
        )
      } finally {
        if (!cancelled && showLoadingState) setLoading(false)
      }
    }

    void load(true)
    const interval = window.setInterval(() => void load(), pollIntervalMs)
    return () => {
      cancelled = true
      window.clearInterval(interval)
    }
  }, [orgId, meetingSessionId, pollIntervalMs])

  useEffect(() => {
    if (!meeting || meeting.provider !== 'local' || !localSession) return
    if (localSession.captureState !== 'capturing') return
    if (!localIngestTokenKey) return

    const ingestToken = window.sessionStorage.getItem(localIngestTokenKey)
    if (!ingestToken) return
    const activeLocalSession = localSession

    let cancelled = false
    let recognitionFailed = false
    let sequence = localSession.lastSequence ?? 0
    let stream: MediaStream | null = null
    let recognition: any = null
    let heartbeat: number | null = null

    const apiBaseUrl =
      process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3002'

    async function sendIngest(message: Record<string, unknown>) {
      sequence += 1
      try {
        const response = await fetch(`${apiBaseUrl}/meetings/local-ingest`, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${ingestToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ sequence, ...message }),
        })
        if (!response.ok) {
          // Surface non-2xx so a regression (auth, CORS, 5xx) is visible in
          // devtools instead of silently nuking the whole session.
          console.warn('[local-meetings] ingest non-2xx', {
            status: response.status,
            type: message.type,
          })
        }
      } catch (err) {
        console.warn('[local-meetings] ingest network error', {
          type: message.type,
          err,
        })
      }
    }

    let audioContext: AudioContext | null = null
    let levelFrame = 0

    async function startCapture() {
      try {
        if (!navigator.mediaDevices?.getUserMedia) {
          throw new Error('This browser does not support microphone capture.')
        }
        setCapturePhase('initializing')
        stream = await navigator.mediaDevices.getUserMedia({
          audio: activeLocalSession.inputDeviceId
            ? { deviceId: { exact: activeLocalSession.inputDeviceId } }
            : true,
        })
        if (cancelled) return

        setLocalCaptureActive(true)
        setLocalCaptureError(null)
        const sendHeartbeat = () => {
          void sendIngest({
            type: 'heartbeat',
            captureState: 'capturing',
            transcriptionState: 'transcribing',
          })
        }
        // Fire immediately so transcriptionState flips off 'connecting' without a 10s wait.
        sendHeartbeat()
        heartbeat = window.setInterval(sendHeartbeat, 10_000)

        // Live audio level meter from the capture stream. This is the user's
        // proof that audio is reaching the page, independent of whether
        // SpeechRecognition is producing results.
        try {
          const Ctx =
            (window as unknown as { webkitAudioContext?: typeof AudioContext })
              .webkitAudioContext ?? AudioContext
          audioContext = new Ctx()
          if (audioContext.state === 'suspended') {
            await audioContext.resume().catch(() => {})
          }
          const analyser = audioContext.createAnalyser()
          analyser.fftSize = 2048
          analyser.smoothingTimeConstant = 0.4
          const source = audioContext.createMediaStreamSource(stream)
          source.connect(analyser)
          const sampleBuf = new Uint8Array(analyser.fftSize)
          const tick = () => {
            if (cancelled) return
            analyser.getByteTimeDomainData(sampleBuf)
            let peak = 0
            for (let i = 0; i < sampleBuf.length; i += 1) {
              const sample = sampleBuf[i] ?? 128
              const deviation = Math.abs(sample - 128)
              if (deviation > peak) peak = deviation
            }
            setAudioLevel(Math.min(100, Math.round((peak / 128) * 180)))
            levelFrame = window.requestAnimationFrame(tick)
          }
          tick()
        } catch (err) {
          console.warn('[local-meetings] level meter failed to start', err)
        }

        // NOTE: We intentionally do NOT spin up a MediaRecorder here. The Web
        // Speech API acquires its own internal mic stream in Chrome, and on
        // some Chromium versions running a MediaRecorder against the same
        // device causes SpeechRecognition to silently produce no results.

        if (!window.isSecureContext) {
          setLocalCaptureError(
            'Live browser transcription requires HTTPS. Open this page over HTTPS (or localhost) and try again.'
          )
          return
        }

        const SpeechRecognition =
          (window as any).SpeechRecognition ||
          (window as any).webkitSpeechRecognition
        if (!SpeechRecognition) {
          setLocalCaptureError(
            'Live browser transcription is not supported here yet. Try Chrome or Edge for local capture.'
          )
          return
        }

        recognition = new SpeechRecognition()
        recognition.continuous = true
        recognition.interimResults = true
        recognition.lang = 'en-US'
        recognition.onstart = () => {
          console.info('[local-meetings] speech recognition: started')
          setCapturePhase('listening')
        }
        recognition.onaudiostart = () => {
          console.info('[local-meetings] speech recognition: audio started')
          setCapturePhase((prev) => (prev === 'initializing' ? 'listening' : prev))
        }
        recognition.onspeechstart = () => {
          console.info('[local-meetings] speech recognition: speech detected')
          setLastSpeechAt(new Date())
          setCapturePhase((prev) =>
            prev === 'transcribing' ? prev : 'hearing'
          )
        }
        recognition.onspeechend = () => {
          setLastSpeechAt(new Date())
        }
        recognition.onresult = (event: any) => {
          let interimAcc = ''
          let resultCount = 0
          let finalCount = 0
          for (let i = event.resultIndex; i < event.results.length; i += 1) {
            const result = event.results[i]
            const text: string | undefined = result?.[0]?.transcript
            if (!text) continue
            resultCount += 1
            const confidence =
              typeof result?.[0]?.confidence === 'number'
                ? result[0].confidence
                : null
            if (result.isFinal) {
              finalCount += 1
              const finalText = text.trim()
              if (finalText) {
                setLiveFinalLines((prev) => [
                  ...prev,
                  {
                    id: `local-${Date.now()}-${i}`,
                    text: finalText,
                    createdAt: new Date(),
                  },
                ])
              }
            } else {
              interimAcc += text
            }
            void sendIngest({
              type: 'transcript',
              transcript: {
                text,
                isPartial: !result.isFinal,
                confidence,
              },
            })
          }
          if (resultCount > 0) {
            console.info('[local-meetings] speech recognition: results', {
              count: resultCount,
            })
            setLastSpeechAt(new Date())
            setCapturePhase('transcribing')
            if (finalCount > 0) {
              setTranscriptCount((n) => n + finalCount)
            }
          }
          setLiveInterimText(interimAcc.trim())
        }
        recognition.onerror = (event: any) => {
          const errorCode = event?.error
          console.info('[local-meetings] speech recognition: error', errorCode)
          // 'no-speech' fires on silence (normal); 'aborted' fires when we call stop() ourselves.
          // Both are non-fatal — let onend restart the recognizer without alarming the user.
          if (errorCode === 'no-speech' || errorCode === 'aborted') return
          recognitionFailed = true
          const message = errorCode
            ? `Local transcription stopped: ${errorCode}`
            : 'Local transcription stopped.'
          setLocalCaptureError(message)
          void sendIngest({
            type: 'failure',
            failureKind: 'transcription',
            failureReason: message,
          })
        }
        recognition.onend = () => {
          console.info('[local-meetings] speech recognition: ended', {
            willRestart: !cancelled && !recognitionFailed,
          })
          if (!cancelled && !recognitionFailed) {
            try {
              recognition.start()
            } catch {
              // Browser may reject immediate restarts; heartbeat keeps session alive.
            }
          }
        }
        recognition.start()
      } catch (err) {
        const message =
          err instanceof Error
            ? err.message
            : 'Kodi could not start local microphone capture.'
        setLocalCaptureError(message)
        void sendIngest({
          type: 'failure',
          failureKind: 'capture',
          failureReason: message,
        }).catch(() => {})
      }
    }

    void startCapture()

    return () => {
      cancelled = true
      setLocalCaptureActive(false)
      setLiveInterimText('')
      setCapturePhase('idle')
      setAudioLevel(0)
      if (heartbeat) window.clearInterval(heartbeat)
      if (levelFrame) window.cancelAnimationFrame(levelFrame)
      try {
        recognition?.stop()
      } catch {}
      void audioContext?.close().catch(() => {})
      stream?.getTracks().forEach((track) => track.stop())
    }
  }, [
    localIngestTokenKey,
    localSession?.captureState,
    localSession?.inputDeviceId,
    // NOTE: lastSequence intentionally excluded — every successful ingest bumps
    // it server-side, and including it tore down the whole capture stack on each
    // poll, preventing the heartbeat from ever firing (transcriptionState was
    // stuck on 'connecting' forever).
    meeting?.id,
    meeting?.provider,
  ])

  useEffect(() => {
    if (!orgId || !meetingSessionId) return
    const status = consoleData?.meeting.status
    const isPostMeeting =
      status === 'summarizing' ||
      status === 'completed' ||
      status === 'awaiting_approval' ||
      status === 'executing' ||
      status === 'ended'
    if (!isPostMeeting) return

    let cancelled = false
    async function loadPostMeeting() {
      if (!orgId) return
      setArtifactsLoading(true)
      try {
        const [arts, items] = await Promise.all([
          trpc.meeting.listArtifacts.query({ orgId, meetingSessionId }),
          trpc.work.listByMeeting.query({ orgId, meetingSessionId }),
        ])
        if (cancelled) return
        setArtifacts(arts)
        setWorkItemsList(items)
        setArtifactsLoaded(true)
      } catch {
        // Non-fatal
      } finally {
        if (!cancelled) setArtifactsLoading(false)
      }
    }

    void loadPostMeeting()
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orgId, meetingSessionId, consoleData?.meeting.status])

  useEffect(() => {
    if (!orgId) return
    const status = consoleData?.meeting?.status
    const isPostMeeting =
      status === 'summarizing' ||
      status === 'completed' ||
      status === 'awaiting_approval' ||
      status === 'executing' ||
      status === 'ended'
    if (!isPostMeeting || connectionStatus !== null) return

    async function loadDeliveryConfig() {
      if (!orgId) return
      try {
        const [status, defaults] = await Promise.all([
          trpc.toolAccess.checkConnections.query({
            orgId,
            toolkitSlugs: ['slack', 'zoom'],
          }),
          trpc.toolAccess.getToolkitDefaults.query({
            orgId,
            toolkitSlug: 'slack',
          }),
        ])
        setConnectionStatus(status)
        setSlackDefaultChannel(defaults.defaultChannel)
      } catch {
        // Non-fatal
      }
    }

    void loadDeliveryConfig()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orgId, consoleData?.meeting?.status])

  useEffect(() => {
    if (!orgId || !meetingSessionId) return
    trpc.meeting.getAnswers
      .query({ orgId, meetingSessionId })
      .then((data) => {
        const uiAnswers = data
          .filter((a) => a.source === 'ui')
          .reverse()
          .map((a) => ({
            id: a.id,
            question: a.question,
            answerText: a.answerText ?? null,
            status: a.status,
            failureReason: a.suppressionReason ?? null,
            askedAt: new Date(a.createdAt),
            voiceStatus:
              a.status === 'delivered_to_voice'
                ? ('delivered_to_voice' as const)
                : a.status === 'speaking'
                  ? ('speaking' as const)
                  : null,
          }))
        setAnswers(uiAnswers)
      })
      .catch(() => {
        // Non-fatal
      })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orgId, meetingSessionId])

  useEffect(() => {
    if (transcriptAtBottom) {
      const el = transcriptScrollRef.current
      if (el) el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' })
    }
  }, [transcriptSpeakerGroups.length, transcriptAtBottom])

  // --- Handlers ---

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

  function requestDeleteMeeting() {
    setDeleteConfirmOpen(true)
  }

  async function executeDeleteMeeting() {
    if (!orgId || !meetingSessionId || deletingMeeting) return
    setDeleteConfirmOpen(false)
    setDeletingMeeting(true)
    try {
      await trpc.meeting.delete.mutate({ orgId, meetingSessionId })
      router.push('/meetings')
    } catch {
      setDeletingMeeting(false)
    }
  }

  function startEditWorkItem(item: WorkItem) {
    const meta =
      item.metadata &&
      typeof item.metadata === 'object' &&
      !Array.isArray(item.metadata)
        ? (item.metadata as Record<string, unknown>)
        : {}
    setEditingWorkItemId(item.id)
    setEditWorkItemTitle(item.title)
    setEditWorkItemOwnerHint(
      typeof meta.ownerHint === 'string' ? meta.ownerHint : ''
    )
    setEditWorkItemDueAt(
      item.dueAt ? new Date(item.dueAt).toISOString().slice(0, 10) : ''
    )
  }

  function cancelEditWorkItem() {
    setEditingWorkItemId(null)
    setEditWorkItemTitle('')
    setEditWorkItemOwnerHint('')
    setEditWorkItemDueAt('')
  }

  async function saveEditWorkItem(itemId: string) {
    if (!orgId || workItemSaving) return
    setWorkItemSaving(itemId)
    try {
      const updated = await trpc.work.update.mutate({
        orgId,
        workItemId: itemId,
        title: editWorkItemTitle.trim() || undefined,
        ownerHint: editWorkItemOwnerHint.trim() || null,
        dueAt: editWorkItemDueAt
          ? new Date(editWorkItemDueAt).toISOString()
          : null,
      })
      setWorkItemsList((prev) =>
        prev.map((w) => (w.id === itemId ? (updated as WorkItem) : w))
      )
      cancelEditWorkItem()
    } catch {
      // Silently ignore
    } finally {
      setWorkItemSaving(null)
    }
  }

  async function approveWorkItem(itemId: string) {
    if (!orgId || workItemSaving) return
    setWorkItemSaving(itemId)
    try {
      await trpc.work.approve.mutate({ orgId, workItemId: itemId })
      setWorkItemsList((prev) =>
        prev.map((w) =>
          w.id === itemId ? { ...w, status: 'approved' as const } : w
        )
      )
    } catch {
      // Silently ignore
    } finally {
      setWorkItemSaving(null)
    }
  }

  async function rejectWorkItem(itemId: string) {
    if (!orgId || workItemSaving) return
    setWorkItemSaving(itemId)
    try {
      await trpc.work.reject.mutate({ orgId, workItemId: itemId })
      setWorkItemsList((prev) =>
        prev.map((w) =>
          w.id === itemId ? { ...w, status: 'cancelled' as const } : w
        )
      )
    } catch {
      // Silently ignore
    } finally {
      setWorkItemSaving(null)
    }
  }

  async function handleRetryArtifacts() {
    if (!orgId || retryingArtifacts) return
    setRetryingArtifacts(true)
    try {
      await trpc.meeting.retryArtifacts.mutate({ orgId, meetingSessionId })
    } catch {
      // Non-fatal
    } finally {
      setRetryingArtifacts(false)
    }
  }

  async function syncWorkItem(itemId: string, target: SyncTarget) {
    if (!orgId || syncingItem) return
    setSyncingItem({ id: itemId, target })
    setSyncError(null)
    try {
      const result = await trpc.work.queueSync.mutate({
        orgId,
        workItemId: itemId,
        target,
      })
      if (result.mode === 'executed') {
        setWorkItemsList((prev) =>
          prev.map((w) =>
            w.id === itemId ? { ...w, status: 'synced' as const } : w
          )
        )
      } else {
        setWorkItemsList((prev) =>
          prev.map((w) =>
            w.id === itemId ? { ...w, status: 'executing' as const } : w
          )
        )
      }
    } catch (err) {
      setSyncError(
        err instanceof Error
          ? err.message
          : 'Failed to queue sync. Check your integrations.'
      )
    } finally {
      setSyncingItem(null)
    }
  }

  async function deliverRecap(target: RecapTarget, channelId?: string) {
    if (!orgId || recapDelivering) return
    setRecapDelivering(true)
    setRecapDeliverTarget(target)
    setRecapDeliverError(null)
    try {
      await trpc.meeting.deliverRecap.mutate({
        orgId,
        meetingSessionId,
        target,
        channelId: channelId ?? null,
      })
    } catch (err) {
      setRecapDeliverError(
        err instanceof Error
          ? err.message
          : `Failed to deliver recap to ${target}.`
      )
    } finally {
      setRecapDelivering(false)
    }
  }

  function handleSlackSend(channel: string) {
    setSlackModalOpen(false)
    void deliverRecap('slack', channel)
  }

  async function handleAskKodi(e: React.FormEvent) {
    e.preventDefault()
    const question = askQuestion.trim()
    if (!question || !orgId || !meetingSessionId || askPending) return

    const optimisticId = crypto.randomUUID()
    const askedAt = new Date()
    setAnswers((prev) => [
      ...prev,
      {
        id: optimisticId,
        question,
        answerText: null,
        status: 'preparing',
        failureReason: null,
        askedAt,
      },
    ])
    setAskQuestion('')
    setAskPending(true)
    setTimeout(() => {
      const el = answerScrollRef.current
      if (el) el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' })
    }, 50)

    try {
      const result = await trpc.meeting.askKodi.mutate({
        orgId,
        meetingSessionId,
        question,
      })
      setAnswers((prev) =>
        prev.map((a) =>
          a.id === optimisticId
            ? {
                ...a,
                id: result.answerId,
                answerText: result.answerText,
                status: result.status,
                failureReason: result.failureReason ?? null,
              }
            : a
        )
      )
      setTimeout(() => {
        const el = answerScrollRef.current
        if (el) el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' })
      }, 50)
    } catch (err) {
      setAnswers((prev) =>
        prev.map((a) =>
          a.id === optimisticId
            ? {
                ...a,
                status: 'failed',
                answerText: null,
                failureReason:
                  err instanceof Error ? err.message : null,
              }
            : a
        )
      )
    } finally {
      setAskPending(false)
    }
  }

  async function handleSpeakAnswer(answerId: string) {
    if (!orgId || !meetingSessionId || speakingAnswerId) return
    setSpeakingAnswerId(answerId)
    setAnswers((prev) =>
      prev.map((a) =>
        a.id === answerId ? { ...a, voiceStatus: 'speaking' } : a
      )
    )
    try {
      const result = await trpc.meeting.speakAnswer.mutate({
        orgId,
        meetingSessionId,
        answerId,
      })
      if (result.mediaUrl) {
        const apiBaseUrl =
          process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3002'
        const audio = new Audio(`${apiBaseUrl}${result.mediaUrl}`)
        await audio.play()
      }
      setAnswers((prev) =>
        prev.map((a) =>
          a.id === answerId
            ? { ...a, voiceStatus: 'delivered_to_voice' }
            : a
        )
      )
    } catch {
      setAnswers((prev) =>
        prev.map((a) =>
          a.id === answerId ? { ...a, voiceStatus: 'voice_failed' } : a
        )
      )
    } finally {
      setSpeakingAnswerId(null)
    }
  }

  async function pauseLocalSession() {
    if (!orgId || !meetingSessionId) return
    await trpc.meeting.pauseLocalSession.mutate({ orgId, meetingSessionId })
  }

  async function resumeLocalSession() {
    if (!orgId || !meetingSessionId) return
    await trpc.meeting.resumeLocalSession.mutate({ orgId, meetingSessionId })
  }

  async function endLocalSession() {
    if (!orgId || !meetingSessionId) return
    await trpc.meeting.endLocalSession.mutate({ orgId, meetingSessionId })
    if (localIngestTokenKey) {
      window.sessionStorage.removeItem(localIngestTokenKey)
    }
  }

  async function stopVoice() {
    if (!orgId || !meetingSessionId) return
    await trpc.meeting.stopVoice.mutate({ orgId, meetingSessionId })
  }

  return {
    // Auth / org
    activeOrg,
    orgId,

    // Core state
    meeting,
    loading,
    error,
    deletingMeeting,
    runtimeCopy,
    failureReason,
    latestActivityAt,

    // Transcript
    transcriptSpeakerGroups,
    collapsedSpeakers,
    setCollapsedSpeakers,
    transcriptScrollRef,
    transcriptBottomRef,
    transcriptAtBottom,
    handleTranscriptScroll,
    speakerColorMap,

    // Ask Kodi
    askSheetOpen,
    setAskSheetOpen,
    askQuestion,
    setAskQuestion,
    askPending,
    answers,
    speakingAnswerId,
    answerScrollRef,
    answerBottomRef,
    handleAskKodi,
    handleSpeakAnswer,

    // Summary / live state
    activeTopics,
    rollingNotes,
    liveState,
    draftActions,
    candidateActionItems,
    candidateTasks,
    decisions,
    openQuestions,
    risks,

    // Post-meeting review
    artifacts,
    workItemsList,
    artifactsLoading,
    artifactsLoaded,
    retryingArtifacts,
    editingWorkItemId,
    editWorkItemTitle,
    editWorkItemOwnerHint,
    editWorkItemDueAt,
    workItemSaving,
    handleRetryArtifacts,
    startEditWorkItem,
    cancelEditWorkItem,
    saveEditWorkItem,
    approveWorkItem,
    rejectWorkItem,
    setEditWorkItemTitle,
    setEditWorkItemOwnerHint,
    setEditWorkItemDueAt,

    // Sync + delivery
    syncingItem,
    syncError,
    syncWorkItem,
    recapDelivering,
    recapDeliverTarget,
    recapDeliverError,
    deliverRecap,

    // Slack modal
    slackModalOpen,
    setSlackModalOpen,
    slackDefaultChannel,
    handleSlackSend,
    connectionStatus,

    // Controls
    controls,
    workspaceSettings,
    controlsSaving,
    canManageControls,
    updateControls,

    // Actions
    deleteConfirmOpen,
    setDeleteConfirmOpen,
    requestDeleteMeeting,
    executeDeleteMeeting,

    // Misc derived
    health,
    localSession,
    localCaptureActive,
    localCaptureError,
    liveInterimText,
    liveFinalLines,
    capturePhase,
    audioLevel,
    lastSpeechAt,
    transcriptCount,
    pauseLocalSession,
    resumeLocalSession,
    endLocalSession,
    stopVoice,
    participants,
    chatMessages,
    retryHistory,
    technicalDetails,
    healthMetadata,
  }
}
