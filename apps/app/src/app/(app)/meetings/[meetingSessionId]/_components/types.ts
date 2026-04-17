import type { trpc } from '@/lib/trpc'

export type MeetingConsole = NonNullable<
  Awaited<ReturnType<typeof trpc.meeting.getConsole.query>>
>
export type MeetingParticipants = MeetingConsole['participants']
export type MeetingTranscript = MeetingConsole['transcript']
export type MeetingLiveState = MeetingConsole['liveState'] | null
export type MeetingEventFeed = MeetingConsole['events']
export type MeetingHealth = MeetingConsole['health'] | null
export type MeetingWorkspaceSettings =
  MeetingConsole['workspaceSettings'] | null
export type MeetingControls = MeetingConsole['controls'] | null
export type MeetingTranscriptSegment = MeetingTranscript[number]
export type MeetingTranscriptTurn = MeetingTranscriptSegment & {
  mergedSegmentCount: number
}
export type MeetingRetryAttempt = {
  attempt: number | null
  status: string | null
  startedAt: string | null
  completedAt: string | null
  failureKind: string | null
  retryable: boolean | null
  message: string | null
  httpStatus: number | null
}
export type MeetingParticipantIdentitySummary = {
  classification: 'internal' | 'external' | 'unknown'
  confidence: number | null
  rejoinCount: number
  matchedBy: string | null
  matchedUserEmail: string | null
}
export type MeetingChatItem = {
  id: string
  eventType: string
  content: string
  senderName: string
  recipient: string
  occurredAt: Date | string
}
export type AskKodiAnswer = {
  id: string
  question: string
  answerText: string | null
  status: string
  failureReason: string | null
  askedAt: Date
  voiceStatus?: 'speaking' | 'delivered_to_voice' | 'voice_failed' | null
}
export type MeetingArtifact = Awaited<
  ReturnType<typeof trpc.meeting.listArtifacts.query>
>[number]
export type WorkItem = Awaited<
  ReturnType<typeof trpc.work.listByMeeting.query>
>[number]
export type SyncTarget = 'linear' | 'github'
export type RecapTarget = 'slack' | 'zoom'
