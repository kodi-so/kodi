'use client'

import Link from 'next/link'
import { useParams, useRouter } from 'next/navigation'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import {
  ArrowLeft,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Clock3,
  MessageSquare,
  Mic2,
  RefreshCw,
  SendHorizonal,
  Sparkles,
  Trash2,
  Users,
  Volume2,
  VolumeX,
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
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  Skeleton,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
  Textarea,
} from '@kodi/ui'
import { SectionIcon } from '@/components/section-icon'
import { useOrg } from '@/lib/org-context'
import { useSession } from '@/lib/auth-client'
import { trpc } from '@/lib/trpc'
import {
  dashedPanelClass,
  pageShellClass,
  quietTextClass,
  subtleTextClass,
} from '@/lib/brand-styles'
import { resolveSessionId } from '@/lib/meeting-id'
import { getMeetingRuntimeCopy } from '../_lib/runtime-state'
import {
  buildMeetingCopilotDisclosure,
  formatRetentionDays,
  getMeetingParticipationModeDescription,
  getMeetingParticipationModeLabel,
} from '@kodi/db/client'

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
} from './_components/types'
import {
  asArray,
  asRecord,
  describeEvent,
  formatDate,
  formatEventLabel,
  formatHealthStatus,
  formatProviderLabel,
  formatTime,
  healthTone,
  participantIdentityBadgeVariant,
  participantIdentityLabel,
  participantIdentitySummary,
  pollIntervalForStatus,
  statusLabel,
  statusTone,
  truncateMiddle,
  failureReasonToMessage,
} from './_components/utils'
import {
  collapseTranscriptSegments,
  getSpeakerInitials,
  groupTranscriptBySpeaker,
  SPEAKER_COLORS,
} from './_components/transcript-utils'
import { SlackSendModal } from './_components/slack-send-modal'
import { PostMeetingReview } from './_components/post-meeting-review'


// Types, utils, transcript processing, SlackSendModal, and PostMeetingReview
// are extracted to ./_components/ — see imports above.

export default function MeetingDetailsPage() {
  const params = useParams<{ meetingSessionId: string }>()
  const meetingSessionId = resolveSessionId(params.meetingSessionId)
  const { activeOrg } = useOrg()
  const { data: session } = useSession()
  const router = useRouter()
  const orgId = activeOrg?.orgId ?? null
  const currentUserId = session?.user?.id ?? null

  const [consoleData, setConsoleData] = useState<MeetingConsole | null>(null)
  const [deletingMeeting, setDeletingMeeting] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [lastRefreshedAt, setLastRefreshedAt] = useState<Date | null>(null)
  const [controlsSaving, setControlsSaving] = useState(false)
  const [askQuestion, setAskQuestion] = useState('')
  const [askPending, setAskPending] = useState(false)
  const [answers, setAnswers] = useState<AskKodiAnswer[]>([])
  const [askSheetOpen, setAskSheetOpen] = useState(false)
  const [speakingAnswerId, setSpeakingAnswerId] = useState<string | null>(null)
  const answerBottomRef = useRef<HTMLDivElement>(null)
  const answerScrollRef = useRef<HTMLDivElement>(null)
  const [collapsedSpeakers, setCollapsedSpeakers] = useState<Set<string>>(new Set())
  const transcriptScrollRef = useRef<HTMLDivElement>(null)
  const transcriptBottomRef = useRef<HTMLDivElement>(null)
  const [transcriptAtBottom, setTranscriptAtBottom] = useState(true)
  const speakerColorMap = useRef<Map<string, string>>(new Map())

  // Post-meeting review state
  const [artifacts, setArtifacts] = useState<MeetingArtifact[]>([])
  const [workItemsList, setWorkItemsList] = useState<WorkItem[]>([])
  const [artifactsLoading, setArtifactsLoading] = useState(false)
  const [artifactsLoaded, setArtifactsLoaded] = useState(false)
  const [retryingArtifacts, setRetryingArtifacts] = useState(false)
  const [editingWorkItemId, setEditingWorkItemId] = useState<string | null>(null)
  const [editWorkItemTitle, setEditWorkItemTitle] = useState('')
  const [editWorkItemOwnerHint, setEditWorkItemOwnerHint] = useState('')
  const [editWorkItemDueAt, setEditWorkItemDueAt] = useState('')
  const [workItemSaving, setWorkItemSaving] = useState<string | null>(null)
  // Phase 6 — sync + recap delivery state
  const [syncingItem, setSyncingItem] = useState<{ id: string; target: SyncTarget } | null>(null)
  const [syncError, setSyncError] = useState<string | null>(null)
  const [recapDelivering, setRecapDelivering] = useState(false)
  const [recapDeliverTarget, setRecapDeliverTarget] = useState<RecapTarget | null>(null)
  const [recapDeliverError, setRecapDeliverError] = useState<string | null>(null)
  // Slack send modal
  const [slackModalOpen, setSlackModalOpen] = useState(false)
  const [slackDefaultChannel, setSlackDefaultChannel] = useState<string | null>(null)
  const [connectionStatus, setConnectionStatus] = useState<Record<string, boolean> | null>(null)

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

  // Load post-meeting artifacts and work items when the meeting is in a
  // post-meeting status or has already completed.
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
        // Non-fatal — post-meeting section will show empty state
      } finally {
        if (!cancelled) setArtifactsLoading(false)
      }
    }

    void loadPostMeeting()
    return () => {
      cancelled = true
    }
  // Re-load when status transitions into or within post-meeting states
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orgId, meetingSessionId, consoleData?.meeting.status])

  // Load integration connection status and Slack default channel once the
  // meeting enters a post-meeting state (where the delivery buttons appear).
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
          trpc.toolAccess.getToolkitDefaults.query({ orgId, toolkitSlug: 'slack' }),
        ])
        setConnectionStatus(status)
        setSlackDefaultChannel(defaults.defaultChannel)
      } catch {
        // Non-fatal — delivery buttons stay hidden if check fails
      }
    }

    void loadDeliveryConfig()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orgId, consoleData?.meeting?.status])

  // Load Ask Kodi answer history from the server on mount so it survives
  // page refreshes. Only loads once; new answers are appended optimistically.
  useEffect(() => {
    if (!orgId || !meetingSessionId) return
    trpc.meeting.getAnswers
      .query({ orgId, meetingSessionId })
      .then((data) => {
        const uiAnswers = data
          .filter((a) => a.source === 'ui')
          .reverse() // getAnswers returns newest-first; we want oldest-first
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
        // Non-fatal — history just won't pre-populate
      })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orgId, meetingSessionId])

  const meeting = consoleData?.meeting ?? null
  const participants: MeetingParticipants = consoleData?.participants ?? []
  const transcript: MeetingTranscript = consoleData?.transcript ?? []
  const liveState: MeetingLiveState = consoleData?.liveState ?? null
  const events: MeetingEventFeed = consoleData?.events ?? []
  const health: MeetingHealth = consoleData?.health ?? null
  const workspaceSettings: MeetingWorkspaceSettings =
    consoleData?.workspaceSettings ?? null
  const controls: MeetingControls = consoleData?.controls ?? null

  const chronologicalTranscript = useMemo(
    () => collapseTranscriptSegments([...transcript].reverse()),
    [transcript]
  )
  const transcriptSpeakerGroups = useMemo(() => {
    const groups = groupTranscriptBySpeaker(chronologicalTranscript)
    // Assign stable colors in first-seen order
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

  // Auto-scroll to bottom when new transcript arrives, but only if already at bottom
  useEffect(() => {
    if (transcriptAtBottom) {
      const el = transcriptScrollRef.current
      if (el) el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' })
    }
  }, [transcriptSpeakerGroups.length, transcriptAtBottom])

  const meetingMetadata = useMemo(
    () => asRecord(meeting?.metadata),
    [meeting?.metadata]
  )
  const healthMetadata = useMemo(() => asRecord(health?.metadata), [health?.metadata])
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
            message: typeof record.message === 'string' ? record.message : null,
            httpStatus:
              typeof record.httpStatus === 'number' ? record.httpStatus : null,
          } satisfies MeetingRetryAttempt
        })
        .filter((attempt): attempt is MeetingRetryAttempt => attempt !== null),
    [meetingMetadata?.retryHistory]
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

  async function handleDeleteMeeting() {
    if (!orgId || !meetingSessionId || deletingMeeting) return
    if (!confirm('Delete this meeting? This cannot be undone.')) return
    setDeletingMeeting(true)
    try {
      await trpc.meeting.delete.mutate({ orgId, meetingSessionId })
      router.push('/meetings')
    } catch {
      setDeletingMeeting(false)
    }
  }

  function startEditWorkItem(item: WorkItem) {
    const meta = item.metadata && typeof item.metadata === 'object' && !Array.isArray(item.metadata)
      ? (item.metadata as Record<string, unknown>)
      : {}
    setEditingWorkItemId(item.id)
    setEditWorkItemTitle(item.title)
    setEditWorkItemOwnerHint(typeof meta.ownerHint === 'string' ? meta.ownerHint : '')
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
        dueAt: editWorkItemDueAt ? new Date(editWorkItemDueAt).toISOString() : null,
      })
      setWorkItemsList((prev) =>
        prev.map((w) => (w.id === itemId ? (updated as WorkItem) : w))
      )
      cancelEditWorkItem()
    } catch {
      // Silently ignore — user can retry
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
        prev.map((w) => (w.id === itemId ? { ...w, status: 'approved' as const } : w))
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
        prev.map((w) => (w.id === itemId ? { ...w, status: 'cancelled' as const } : w))
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
      // Non-fatal — status poll will reflect changes
    } finally {
      setRetryingArtifacts(false)
    }
  }

  async function syncWorkItem(itemId: string, target: SyncTarget) {
    if (!orgId || syncingItem) return
    setSyncingItem({ id: itemId, target })
    setSyncError(null)
    try {
      const result = await trpc.work.queueSync.mutate({ orgId, workItemId: itemId, target })
      if (result.mode === 'executed') {
        // Direct execution: mark the item as synced in local state
        setWorkItemsList((prev) =>
          prev.map((w) => (w.id === itemId ? { ...w, status: 'synced' as const } : w))
        )
      } else {
        // Queued for approval: reload the item to pick up status changes
        setWorkItemsList((prev) =>
          prev.map((w) => (w.id === itemId ? { ...w, status: 'executing' as const } : w))
        )
      }
    } catch (err) {
      setSyncError(
        err instanceof Error ? err.message : 'Failed to queue sync. Check your integrations.'
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
        err instanceof Error ? err.message : `Failed to deliver recap to ${target}.`
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
      { id: optimisticId, question, answerText: null, status: 'preparing', failureReason: null, askedAt },
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
            ? { ...a, status: 'failed', answerText: null, failureReason: err instanceof Error ? err.message : null }
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
      prev.map((a) => (a.id === answerId ? { ...a, voiceStatus: 'speaking' } : a))
    )
    try {
      await trpc.meeting.speakAnswer.mutate({ orgId, meetingSessionId, answerId })
      setAnswers((prev) =>
        prev.map((a) => (a.id === answerId ? { ...a, voiceStatus: 'delivered_to_voice' } : a))
      )
    } catch {
      setAnswers((prev) =>
        prev.map((a) => (a.id === answerId ? { ...a, voiceStatus: 'voice_failed' } : a))
      )
    } finally {
      setSpeakingAnswerId(null)
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
        label: 'Provider health',
        value: formatHealthStatus(health?.status),
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
      {
        label: 'Health checked',
        value: formatTime(health?.observedAt),
      },
    ]
  }, [health?.observedAt, health?.status, lastRefreshedAt, latestActivityAt, meeting])

  if (!activeOrg) {
    return (
      <div className="flex min-h-full items-center justify-center p-6 text-sm text-muted-foreground">
        Select a workspace to view meetings.
      </div>
    )
  }

  if (loading) {
    return (
      <div className={pageShellClass}>
        <div className="mx-auto flex max-w-6xl flex-col gap-6 px-4 py-8">
          <Skeleton className="h-5 w-24" />
          <div className="rounded-2xl border border-border bg-card p-6 shadow-sm">
            <div className="space-y-3">
              <Skeleton className="h-5 w-20 rounded-full" />
              <Skeleton className="h-7 w-72" />
              <Skeleton className="h-4 w-96" />
            </div>
          </div>
          <div className="grid gap-6 xl:grid-cols-[minmax(0,1.2fr)_minmax(22rem,0.8fr)]">
            <div className="space-y-4">
              <Skeleton className="h-[320px] rounded-2xl" />
              <Skeleton className="h-[200px] rounded-2xl" />
            </div>
            <Skeleton className="h-[540px] rounded-2xl" />
          </div>
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
        {/* Page header */}
        <div className="space-y-4">
          <Link
            href="/meetings"
            className="inline-flex items-center gap-1.5 text-sm text-muted-foreground transition hover:text-foreground"
          >
            <ArrowLeft size={15} />
            Meetings
          </Link>

          <div className="rounded-2xl border border-border bg-card px-6 py-6 shadow-sm">
            <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
              <div className="min-w-0 space-y-3">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant={statusTone(meeting.status)}>
                    {statusLabel(meeting.status)}
                  </Badge>
                  <span className="text-xs text-muted-foreground">
                    {formatProviderLabel(meeting.provider)}
                  </span>
                </div>
                <h1 className="text-2xl font-semibold tracking-tight text-foreground">
                  {meeting.title ?? 'Untitled meeting'}
                </h1>
                <p className="max-w-2xl text-sm leading-relaxed text-muted-foreground">
                  {runtimeCopy.description}
                </p>
              </div>

              <div className="flex shrink-0 items-center gap-5">
                <div className="flex items-center gap-4 text-sm text-muted-foreground">
                  <div className="flex items-center gap-1.5" title="Started">
                    <Clock3 size={13} />
                    <span className="whitespace-nowrap tabular-nums">
                      {formatDate(meeting.actualStartAt ?? meeting.createdAt)}
                    </span>
                  </div>
                  <div className="h-4 w-px bg-border" />
                  <div className="flex items-center gap-1.5" title="Last activity">
                    <RefreshCw size={13} />
                    <span className="whitespace-nowrap tabular-nums">
                      {formatDate(latestActivityAt)}
                    </span>
                  </div>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => void handleDeleteMeeting()}
                  disabled={deletingMeeting}
                  className="text-muted-foreground hover:bg-transparent hover:text-destructive"
                >
                  <Trash2 size={14} />
                </Button>
              </div>
            </div>
          </div>
        </div>

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

        {/* Post-meeting review section — shown when meeting has ended/completed */}
        {(meeting.status === 'summarizing' ||
          meeting.status === 'completed' ||
          meeting.status === 'awaiting_approval' ||
          meeting.status === 'executing' ||
          meeting.status === 'ended') && (
          <PostMeetingReview
            meeting={meeting}
            artifacts={artifacts}
            workItems={workItemsList}
            loading={artifactsLoading && !artifactsLoaded}
            retrying={retryingArtifacts}
            editingWorkItemId={editingWorkItemId}
            editWorkItemTitle={editWorkItemTitle}
            editWorkItemOwnerHint={editWorkItemOwnerHint}
            editWorkItemDueAt={editWorkItemDueAt}
            workItemSaving={workItemSaving}
            canRetry={activeOrg?.role === 'owner'}
            onRetry={() => void handleRetryArtifacts()}
            onStartEdit={startEditWorkItem}
            onCancelEdit={cancelEditWorkItem}
            onSaveEdit={(id) => void saveEditWorkItem(id)}
            onEditTitleChange={setEditWorkItemTitle}
            onEditOwnerHintChange={setEditWorkItemOwnerHint}
            onEditDueAtChange={setEditWorkItemDueAt}
            onApprove={(id) => void approveWorkItem(id)}
            onReject={(id) => void rejectWorkItem(id)}
            syncingItem={syncingItem}
            onSync={(id, target) => void syncWorkItem(id, target)}
            syncError={syncError}
            recapDelivering={recapDelivering}
            recapDeliverTarget={recapDeliverTarget}
            onDeliverRecap={(target, channelId) => void deliverRecap(target, channelId)}
            onOpenSlackModal={() => setSlackModalOpen(true)}
            hasSlackConnection={connectionStatus?.['slack'] ?? false}
            hasZoomConnection={connectionStatus?.['zoom'] ?? false}
            recapDeliverError={recapDeliverError}
            quietTextClass={quietTextClass}
            subtleTextClass={subtleTextClass}
            dashedPanelClass={dashedPanelClass}
          />
        )}

        <SlackSendModal
          open={slackModalOpen}
          onClose={() => setSlackModalOpen(false)}
          onSend={handleSlackSend}
          delivering={recapDelivering && recapDeliverTarget === 'slack'}
          defaultChannel={slackDefaultChannel}
          meetingTitle={meeting?.title ?? null}
          summaryContent={
            artifacts.find((a) => a.artifactType === 'summary')?.content ?? null
          }
          orgId={orgId}
        />

        {/* Ask Kodi sheet — accessible from any tab */}
        <Sheet open={askSheetOpen} onOpenChange={setAskSheetOpen}>
          <div /> {/* Empty trigger — opened via button in header */}

              <SheetContent className="flex w-full max-w-xl flex-col p-0 sm:max-w-xl">
                <SheetHeader className="shrink-0">
                  <div className="flex items-center gap-3">
                    <SectionIcon icon={MessageSquare} />
                    <SheetTitle>Ask Kodi</SheetTitle>
                  </div>
                </SheetHeader>

                {/* Scrollable conversation */}
                <div ref={answerScrollRef} className="flex-1 overflow-y-auto overscroll-contain px-6 py-4">
                  {answers.length === 0 ? (
                    <div className={`${dashedPanelClass} flex h-full flex-col items-center justify-center gap-3 rounded-xl p-8 text-center`}>
                      <Sparkles size={22} className="text-muted-foreground/60" />
                      <p className={`text-sm ${quietTextClass}`}>
                        Ask anything about this meeting — decisions made, topics covered, action items, or what someone said.
                      </p>
                    </div>
                  ) : (
                    <div className="space-y-6">
                      {answers.map((answer) => (
                        <div key={answer.id} className="space-y-2">
                          {/* Question bubble */}
                          <div className="flex justify-end">
                            <div className="max-w-[80%] rounded-xl rounded-tr-[0.3rem] bg-brand-accent px-4 py-2.5">
                              <p className="text-sm font-medium text-white">{answer.question}</p>
                            </div>
                          </div>

                          {/* Answer bubble */}
                          <div className="flex items-start gap-2.5">
                            <div className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-brand-accent/20 bg-brand-accent-soft text-primary">
                              <Sparkles size={13} />
                            </div>
                            <div className="min-w-0 flex-1 space-y-2">
                              <div className="rounded-xl rounded-tl-[0.3rem] border border-border bg-secondary px-4 py-3">
                                {answer.status === 'preparing' ? (
                                  <div className="space-y-2">
                                    <Skeleton className="h-3.5 w-full" />
                                    <Skeleton className="h-3.5 w-4/5" />
                                    <Skeleton className="h-3.5 w-3/5" />
                                  </div>
                                ) : answer.status === 'suppressed' ? (
                                  <p className={`text-sm ${quietTextClass}`}>
                                    Not enough meeting context yet to answer this. Try again once more of the conversation has been transcribed.
                                  </p>
                                ) : answer.status === 'failed' ? (
                                  <p className="text-sm text-destructive">
                                    {failureReasonToMessage(answer.failureReason)}
                                  </p>
                                ) : answer.answerText ? (
                                  <div className="prose prose-sm max-w-none text-foreground [&>*:first-child]:mt-0 [&>*:last-child]:mb-0 [&_h1]:text-base [&_h2]:text-sm [&_h3]:text-sm [&_li]:text-sm [&_p]:text-sm [&_p]:leading-6">
                                    <ReactMarkdown remarkPlugins={[remarkGfm]}>
                                      {answer.answerText}
                                    </ReactMarkdown>
                                  </div>
                                ) : null}
                              </div>

                              {/* Voice delivery controls */}
                              {answer.answerText && controls?.participationMode === 'voice_enabled' && (
                                <div className="flex items-center gap-2">
                                  {answer.voiceStatus === 'speaking' ? (
                                    <span className={`flex items-center gap-1.5 text-xs ${subtleTextClass}`}>
                                      <Volume2 size={12} className="animate-pulse text-brand-accent" />
                                      Speaking…
                                    </span>
                                  ) : answer.voiceStatus === 'delivered_to_voice' ? (
                                    <span className={`flex items-center gap-1.5 text-xs ${subtleTextClass}`}>
                                      <Volume2 size={12} />
                                      Spoken
                                    </span>
                                  ) : answer.voiceStatus === 'voice_failed' ? (
                                    <span className="flex items-center gap-1.5 text-xs text-destructive">
                                      <VolumeX size={12} />
                                      Voice failed
                                    </span>
                                  ) : (
                                    <button
                                      type="button"
                                      onClick={() => void handleSpeakAnswer(answer.id)}
                                      disabled={!!speakingAnswerId}
                                      className={`flex items-center gap-1.5 rounded-full border border-border px-2.5 py-1 text-xs transition hover:bg-secondary disabled:opacity-40 ${subtleTextClass}`}
                                    >
                                      <Volume2 size={11} />
                                      Speak
                                    </button>
                                  )}
                                </div>
                              )}
                            </div>
                          </div>
                        </div>
                      ))}
                      <div ref={answerBottomRef} />
                    </div>
                  )}
                </div>

                {/* Sticky input */}
                <div className="shrink-0 border-t px-6 py-4">
                  <form onSubmit={handleAskKodi} className="flex gap-2">
                    <Textarea
                      className="min-h-[2.5rem] resize-none rounded-xl text-sm"
                      placeholder="What has been decided so far?"
                      value={askQuestion}
                      onChange={(e) => setAskQuestion(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && !e.shiftKey) {
                          e.preventDefault()
                          void handleAskKodi(e as unknown as React.FormEvent)
                        }
                      }}
                      disabled={askPending}
                      rows={2}
                      autoFocus
                    />
                    <Button
                      type="submit"
                      size="icon"
                      variant="default"
                      disabled={askPending || !askQuestion.trim()}
                      className="h-10 w-10 shrink-0 rounded-xl"
                    >
                      <SendHorizonal size={16} />
                    </Button>
                  </form>
                </div>
              </SheetContent>
        </Sheet>

        {/* Tabbed content */}
        <Tabs defaultValue="overview">
          <div className="flex items-center justify-between gap-4">
            <TabsList>
              <TabsTrigger value="overview">Overview</TabsTrigger>
              <TabsTrigger value="transcript">Transcript</TabsTrigger>
              <TabsTrigger value="details">Details</TabsTrigger>
            </TabsList>
            <Button
              variant="outline"
              size="sm"
              className="gap-1.5"
              onClick={() => setAskSheetOpen(true)}
            >
              <MessageSquare size={14} />
              Ask Kodi
              {answers.length > 0 && (
                <Badge variant="neutral" className="ml-1 text-[10px]">
                  {answers.length}
                </Badge>
              )}
            </Button>
          </div>

          {/* Overview tab — summary, recap, follow-up */}
          <TabsContent value="overview" className="mt-6 space-y-6">
            <Card className="border-border shadow-sm">
              <CardHeader>
                <div className="flex items-center gap-3">
                  <SectionIcon icon={Sparkles} />
                  <div>
                    <CardTitle className="text-lg text-foreground">
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

                <div className="rounded-xl border border-border bg-secondary p-5">
                  <p className="text-sm leading-7 text-foreground">
                    {meeting.liveSummary ??
                      liveState?.summary ??
                      'Kodi has not produced a meeting summary yet.'}
                  </p>
                </div>

                <details className="group rounded-xl border border-border bg-secondary p-5">
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

            <Card className="border-border shadow-sm">
              <CardHeader>
                <CardTitle className="text-lg text-foreground">
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
                            className="rounded-xl border border-border bg-secondary p-4"
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
                          className={`${dashedPanelClass} rounded-xl p-4 text-sm ${quietTextClass}`}
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
                      {candidateActionItems.length > 0 ? (
                        candidateActionItems.map((item, index) => (
                          <div
                            key={`${item.title}-${index}`}
                            className="rounded-xl border border-border bg-secondary p-4"
                          >
                            <div className="flex items-start justify-between gap-3">
                              <p className="text-sm font-medium text-foreground">
                                {item.title}
                              </p>
                              {item.confidence != null && (
                                <Badge variant="neutral">
                                  {Math.round(item.confidence * 100)}%
                                </Badge>
                              )}
                            </div>
                            {item.ownerHint && (
                              <p className={`mt-2 text-sm ${quietTextClass}`}>
                                Owner hint: {item.ownerHint}
                              </p>
                            )}
                            {item.sourceEvidence.length > 0 && (
                              <details className="mt-3">
                                <summary
                                  className={`cursor-pointer text-sm ${subtleTextClass}`}
                                >
                                  Why Kodi suggested this
                                </summary>
                                <p
                                  className={`mt-2 text-sm leading-6 ${quietTextClass}`}
                                >
                                  {item.sourceEvidence[0]}
                                </p>
                              </details>
                            )}
                          </div>
                        ))
                      ) : (
                        <div
                          className={`${dashedPanelClass} rounded-xl p-4 text-sm ${quietTextClass}`}
                        >
                          Candidate action items will appear here once Kodi can
                          separate concrete next actions from broader meeting
                          notes.
                        </div>
                      )}
                    </div>
                  </div>

                  <div>
                    <p
                      className={`text-[11px] uppercase tracking-[0.2em] ${subtleTextClass}`}
                    >
                      Candidate follow-up
                    </p>
                    <div className="mt-3 space-y-3">
                      {candidateTasks.length > 0 ? (
                        candidateTasks.map((task, index) => (
                          <div
                            key={`${task.title}-${index}`}
                            className="rounded-xl border border-border bg-secondary p-4"
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
                          className={`${dashedPanelClass} rounded-xl p-4 text-sm ${quietTextClass}`}
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
                        <div className="rounded-xl border border-border bg-secondary p-4">
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
                        <div className="rounded-xl border border-border bg-secondary p-4">
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
                        <div className="rounded-xl border border-border bg-secondary p-4">
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
          </TabsContent>

          {/* Transcript tab — full width for readability */}
          <TabsContent value="transcript" className="mt-6">
            <Card className="border-border shadow-sm">
              <CardHeader>
                <div className="flex items-center gap-3">
                  <SectionIcon icon={Mic2} />
                  <div>
                    <CardTitle className="text-lg text-foreground">
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
                    className={`${dashedPanelClass} rounded-xl p-5 text-sm ${quietTextClass}`}
                  >
                    Transcript lines will appear here once Kodi starts hearing
                    the call.
                  </div>
                ) : (
                  <div className="relative">
                    <div
                      ref={transcriptScrollRef}
                      onScroll={handleTranscriptScroll}
                      className="max-h-[640px] overflow-x-hidden overflow-y-auto overscroll-contain rounded-xl border border-border bg-secondary"
                    >
                      {transcriptSpeakerGroups.map((group, groupIndex) => {
                        const color = speakerColorMap.current.get(group.speaker) ?? SPEAKER_COLORS[0]!
                        const initials = getSpeakerInitials(group.speaker)
                        const isCollapsed = collapsedSpeakers.has(group.groupId)
                        const wordCount = group.turns.reduce((n, t) => n + t.content.split(/\s+/).length, 0)
                        return (
                          <div
                            key={group.groupId}
                            className={groupIndex > 0 ? 'border-t border-border' : ''}
                          >
                            <button
                              type="button"
                              onClick={() =>
                                setCollapsedSpeakers((prev) => {
                                  const next = new Set(prev)
                                  if (next.has(group.groupId)) next.delete(group.groupId)
                                  else next.add(group.groupId)
                                  return next
                                })
                              }
                              className="flex w-full items-center gap-2.5 px-4 py-3 text-left transition-colors hover:bg-secondary/80"
                            >
                              <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[10px] font-semibold ${color}`}>
                                {initials}
                              </span>
                              <span className="min-w-0 flex-1">
                                <span className="text-sm font-medium text-foreground">{group.speaker}</span>
                                <span className={`ml-2 text-xs ${subtleTextClass}`}>
                                  {formatTime(group.startsAt)}
                                </span>
                              </span>
                              {isCollapsed && (
                                <span className={`text-xs ${subtleTextClass}`}>
                                  {wordCount} words
                                </span>
                              )}
                              {isCollapsed
                                ? <ChevronRight size={14} className={subtleTextClass} />
                                : <ChevronDown size={14} className={subtleTextClass} />
                              }
                            </button>

                            {!isCollapsed && (
                              <div className="space-y-3 pb-4 pl-[3.25rem] pr-4">
                                {group.turns.map((turn) => (
                                  <p
                                    key={turn.id}
                                    className="whitespace-pre-wrap text-sm leading-6 text-foreground"
                                  >
                                    {turn.content}
                                    {turn.isPartial && (
                                      <span className={`ml-2 text-xs ${subtleTextClass}`}>
                                        …
                                      </span>
                                    )}
                                  </p>
                                ))}
                              </div>
                            )}
                          </div>
                        )
                      })}
                      <div ref={transcriptBottomRef} />
                    </div>

                    {!transcriptAtBottom && (
                      <div className="absolute bottom-3 left-1/2 -translate-x-1/2">
                        <Button
                          size="sm"
                          variant="default"
                          className="h-7 gap-1.5 rounded-full px-3 text-xs shadow-md"
                          onClick={() => {
                            setTranscriptAtBottom(true)
                            const el = transcriptScrollRef.current
                            if (el) el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' })
                          }}
                        >
                          <ChevronDown size={13} />
                          Latest
                        </Button>
                      </div>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Details tab — controls, chat, people, diagnostics */}
          <TabsContent value="details" className="mt-6 space-y-6">
            {workspaceSettings && controls && (
              <Card className="border-border shadow-sm">
                <CardHeader>
                  <div className="flex items-center gap-3">
                    <SectionIcon icon={CheckCircle2} />
                    <div>
                      <CardTitle className="text-lg text-foreground">
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

                  <div className="grid gap-3 sm:grid-cols-3">
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
                          className={`rounded-xl border px-4 py-4 text-left transition ${
                            active
                              ? 'border-foreground bg-brand-accent-soft text-foreground'
                              : 'border-border bg-secondary text-muted-foreground hover:border-foreground/20 hover:text-foreground'
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

                  <div className="rounded-xl border border-border bg-secondary p-4">
                    <p className="text-sm font-medium text-foreground">
                      Live reply kill switch
                    </p>
                    <p className={`mt-2 text-sm leading-6 ${quietTextClass}`}>
                      Pause live chat and voice replies immediately without
                      ending the meeting session.
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
                        <span className="text-xs text-muted-foreground">
                          {controls.liveResponsesDisabledReason}
                        </span>
                      )}
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

            {meeting.provider === 'zoom' && (
              <Card className="border-border shadow-sm">
                <CardHeader>
                  <div className="flex items-center gap-3">
                    <SectionIcon icon={Users} />
                    <div>
                      <CardTitle className="text-lg text-foreground">
                        Meeting chat
                      </CardTitle>
                      <CardDescription>
                        In-meeting Zoom chat messages observed during the session.
                      </CardDescription>
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  {chatMessages.length === 0 ? (
                    <div
                      className={`${dashedPanelClass} rounded-xl p-4 text-sm ${quietTextClass}`}
                    >
                      In-meeting Zoom chat messages will appear here once Kodi
                      receives or sends them.
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {chatMessages.map((message) => (
                        <div
                          key={message.id}
                          className="rounded-xl border border-border bg-secondary p-4"
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
                          </div>
                          <p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-foreground">
                            {message.content}
                          </p>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}

            <Card className="border-border shadow-sm">
              <CardHeader>
                <CardTitle className="text-lg text-foreground">
                  People and activity
                </CardTitle>
                <CardDescription>
                  Participants, timeline events, and transport diagnostics.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="rounded-xl border border-border bg-secondary p-4">
                  <div className="flex items-center gap-2 text-sm font-medium text-foreground">
                    <Users size={14} className="text-muted-foreground" />
                    People
                  </div>
                  {participants.length === 0 ? (
                    <p className={`mt-3 text-sm ${quietTextClass}`}>
                      Participant activity will appear here.
                    </p>
                  ) : (
                    <div className="mt-3 space-y-3">
                      {participants.map((participant) => {
                        const identity = participantIdentitySummary(participant)
                        return (
                          <div
                            key={participant.id}
                            className="rounded-xl border border-border bg-background p-4"
                          >
                            <div className="flex items-start justify-between gap-3">
                              <div className="min-w-0">
                                <p className="truncate text-sm font-medium text-foreground">
                                  {participant.displayName ??
                                    participant.email ??
                                    'Unknown participant'}
                                </p>
                                <p className={`mt-1 truncate text-xs ${subtleTextClass}`}>
                                  {participant.email ?? 'No email captured'}
                                </p>
                                {identity && (
                                  <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
                                    <Badge
                                      variant={participantIdentityBadgeVariant(
                                        identity.classification
                                      )}
                                    >
                                      {participantIdentityLabel(identity.classification)}
                                    </Badge>
                                    {identity.confidence != null && (
                                      <Badge variant="outline">
                                        {Math.round(identity.confidence * 100)}% confidence
                                      </Badge>
                                    )}
                                  </div>
                                )}
                              </div>
                              <Badge variant={participant.leftAt ? 'neutral' : 'success'}>
                                {participant.leftAt ? 'Left' : 'In call'}
                              </Badge>
                            </div>
                            <p className={`mt-3 text-xs ${subtleTextClass}`}>
                              Joined {formatDate(participant.joinedAt)}
                            </p>
                          </div>
                        )
                      })}
                    </div>
                  )}
                </div>

                {compactTimelineEvents.length > 0 && (
                  <div className="space-y-3">
                    {compactTimelineEvents.map((event) => (
                      <div
                        key={event.id}
                        className="rounded-xl border border-border bg-secondary p-4"
                      >
                        <div className={`flex flex-wrap items-center gap-2 text-xs ${subtleTextClass}`}>
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
                    ))}
                  </div>
                )}

                <div className="rounded-xl border border-border bg-secondary px-4 py-3">
                  {technicalDetails.map((detail, index) => (
                    <div key={detail.label}>
                      {index > 0 && <Separator className="bg-border" />}
                      <div className="flex items-start justify-between gap-4 py-3">
                        <p className={`text-xs uppercase tracking-[0.18em] ${subtleTextClass}`}>
                          {detail.label}
                        </p>
                        <p className="max-w-[16rem] text-right text-sm text-foreground">
                          {detail.value}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  )
}
