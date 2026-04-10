export type MeetingProviderSlug = string

export type MeetingProviderTransport =
  | 'webhook'
  | 'websocket'
  | 'poll'
  | 'manual'
  | 'internal'

export type MeetingAdapterLifecycleState =
  | 'idle'
  | 'preparing'
  | 'joining'
  | 'waiting_for_admission'
  | 'listening'
  | 'stopping'
  | 'stopped'
  | 'failed'

export type MeetingAdapterHealthStatus = 'healthy' | 'degraded' | 'down'

export type MeetingProviderEventKind =
  | 'transcript'
  | 'participant'
  | 'chat_message'
  | 'lifecycle'
  | 'health'

export type MeetingLifecycleEventName =
  | 'meeting.prepared'
  | 'meeting.joining'
  | 'meeting.joined'
  | 'meeting.admitted'
  | 'meeting.started'
  | 'meeting.ended'
  | 'meeting.stopped'
  | 'meeting.failed'

export type MeetingParticipantEventName =
  | 'participant.joined'
  | 'participant.updated'
  | 'participant.left'

export type MeetingChatMessageEventName =
  | 'meeting.chat_message.received'
  | 'meeting.chat_message.sent'

export type MeetingParticipantIdentity = {
  providerParticipantId?: string | null
  externalUserId?: string | null
  email?: string | null
  displayName?: string | null
}

export type MeetingChatMessageRecipient =
  | 'everyone'
  | 'host'
  | 'everyone_except_host'
  | 'only_bot'
  | 'participant'
  | string

export type MeetingChatMessageIdentity = MeetingParticipantIdentity & {
  isHost?: boolean
  isInternal?: boolean | null
}

export type MeetingProviderSessionRef = {
  internalMeetingSessionId?: string
  externalMeetingId?: string | null
  externalMeetingInstanceId?: string | null
  externalBotSessionId?: string | null
}

export type MeetingProviderEventEnvelope = {
  provider: MeetingProviderSlug
  transport: MeetingProviderTransport
  receivedAt: Date
  session?: MeetingProviderSessionRef | null
  payload: unknown
}

export type MeetingProviderHealthSnapshot = {
  status: MeetingAdapterHealthStatus
  observedAt: Date
  lifecycleState?: MeetingAdapterLifecycleState | null
  detail?: string | null
  metadata?: Record<string, unknown> | null
}

type MeetingProviderEventBase<TKind extends MeetingProviderEventKind> = {
  kind: TKind
  provider: MeetingProviderSlug
  occurredAt: Date
  session?: MeetingProviderSessionRef | null
  metadata?: Record<string, unknown> | null
}

export type MeetingTranscriptEvent = MeetingProviderEventBase<'transcript'> & {
  transcriptEventId?: string | null
  transcript: {
    content: string
    speaker?: MeetingParticipantIdentity | null
    startOffsetMs?: number | null
    endOffsetMs?: number | null
    confidence?: number | null
    isPartial?: boolean
  }
}

export type MeetingParticipantEvent =
  MeetingProviderEventBase<'participant'> & {
    action: MeetingParticipantEventName
    participant: MeetingParticipantIdentity
  }

export type MeetingChatMessageEvent =
  MeetingProviderEventBase<'chat_message'> & {
    action: MeetingChatMessageEventName
    message: {
      content: string
      to: MeetingChatMessageRecipient
      sender?: MeetingChatMessageIdentity | null
    }
  }

export type MeetingLifecycleEvent = MeetingProviderEventBase<'lifecycle'> & {
  action: MeetingLifecycleEventName
  state: MeetingAdapterLifecycleState
  errorCode?: string | null
  errorMessage?: string | null
}

export type MeetingHealthEvent = MeetingProviderEventBase<'health'> & {
  health: MeetingProviderHealthSnapshot
}

export type MeetingProviderEvent =
  | MeetingTranscriptEvent
  | MeetingParticipantEvent
  | MeetingChatMessageEvent
  | MeetingLifecycleEvent
  | MeetingHealthEvent
