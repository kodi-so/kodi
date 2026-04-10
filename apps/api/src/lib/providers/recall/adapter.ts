import type {
  MeetingProviderAdapter,
  MeetingProviderControlResult,
  MeetingProviderHealthRequest,
  MeetingProviderJoinRequest,
  MeetingProviderPrepareRequest,
  MeetingProviderSendChatMessageRequest,
  MeetingProviderSendChatMessageResult,
  MeetingProviderStopRequest,
} from '../../meetings/provider-adapter'
import type {
  MeetingChatMessageEvent,
  MeetingProviderEvent,
  MeetingProviderEventEnvelope,
  MeetingProviderHealthSnapshot,
  MeetingProviderSessionRef,
} from '../../meetings/events'
import {
  buildRecallRealtimeWebhookUrl,
  classifyRecallFailure,
  classifyUnexpectedRecallError,
  createRecallBot,
  leaveRecallBot,
  RecallApiError,
  type RecallJoinAttempt,
  RecallMeetingJoinError,
  type RecallCreateBotRequest,
  sendRecallBotChatMessage,
} from './client'
import { getRecallClientConfig } from './config'
import { createZoomZakCallbackUrl } from '../../zoom'
import {
  inferMeetingProviderFromUrl,
  resolveMeetingIdFromJoinUrl,
} from '../../meetings/provider-url'

function resolveRecallMeetingId(
  responseMeetingUrl: unknown,
  fallbackJoinUrl: string,
  provider: MeetingProviderJoinRequest['provider']
) {
  if (
    responseMeetingUrl &&
    typeof responseMeetingUrl === 'object' &&
    'meeting_id' in responseMeetingUrl &&
    typeof (responseMeetingUrl as { meeting_id?: unknown }).meeting_id ===
      'string'
  ) {
    return (responseMeetingUrl as { meeting_id: string }).meeting_id
  }

  return resolveMeetingIdFromJoinUrl(fallbackJoinUrl, provider)
}

function asRecord(value: unknown) {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null
}

function extractSessionRef(payload: Record<string, unknown>): MeetingProviderSessionRef | null {
  const data = asRecord(payload.data)
  const bot = asRecord(data?.bot)
  const botMetadata = asRecord(bot?.metadata)

  return {
    internalMeetingSessionId:
      typeof botMetadata?.internalMeetingSessionId === 'string'
        ? botMetadata.internalMeetingSessionId
        : undefined,
    externalMeetingId:
      typeof botMetadata?.externalMeetingId === 'string'
        ? botMetadata.externalMeetingId
        : null,
    externalMeetingInstanceId:
      typeof botMetadata?.externalMeetingInstanceId === 'string'
        ? botMetadata.externalMeetingInstanceId
        : typeof botMetadata?.meetingId === 'string'
          ? botMetadata.meetingId
          : null,
    externalBotSessionId:
      typeof bot?.id === 'string' ? bot.id : null,
  }
}

function extractOccurredAt(payload: Record<string, unknown>) {
  const data = asRecord(payload.data)
  const statusData = asRecord(data?.data)
  const updatedAt = statusData?.updated_at

  if (typeof updatedAt === 'string') {
    const parsed = new Date(updatedAt)
    if (!Number.isNaN(parsed.getTime())) {
      return parsed
    }
  }

  return new Date()
}

function describeRecallProviderJoinState(eventName: string) {
  switch (eventName) {
    case 'bot.joining_call':
      return {
        providerJoinState: 'joining_call',
        lifecycleMessage: 'Kodi is joining the meeting provider.',
      } as const
    case 'bot.in_waiting_room':
      return {
        providerJoinState: 'waiting_room',
        lifecycleMessage:
          'Kodi is waiting for the host to admit it from the waiting room.',
      } as const
    case 'bot.in_call_not_recording':
      return {
        providerJoinState: 'awaiting_recording_permission',
        consentState: 'pending',
        lifecycleMessage:
          'Kodi is in the call and waiting for recording permission before it can listen.',
      } as const
    case 'bot.recording_permission_allowed':
      return {
        providerJoinState: 'recording_permission_granted',
        consentState: 'granted',
        lifecycleMessage:
          'Recording permission was granted. Kodi is finishing setup before listening starts.',
      } as const
    case 'bot.recording_permission_denied':
      return {
        providerJoinState: 'recording_permission_denied',
        consentState: 'denied',
        lifecycleMessage:
          'Recording permission was denied, so Kodi cannot listen to the meeting.',
      } as const
    case 'bot.in_call_recording':
      return {
        providerJoinState: 'listening',
        consentState: 'granted',
        lifecycleMessage: 'Kodi is now listening to the meeting.',
      } as const
    case 'bot.call_ended':
    case 'bot.done':
      return {
        providerJoinState: 'ended',
      } as const
    case 'bot.fatal':
      return {
        providerJoinState: 'failed',
      } as const
    default:
      return null
  }
}

function mapRecallBotEventToLifecycleState(eventName: string, subCode?: string | null) {
  const failure = classifyRecallFailure({ subCode })

  switch (eventName) {
    case 'bot.joining_call':
      return { action: 'meeting.joining', state: 'joining' } as const
    case 'bot.in_waiting_room':
      return {
        action: 'meeting.admitted',
        state: 'waiting_for_admission',
      } as const
    case 'bot.in_call_not_recording':
    case 'bot.recording_permission_allowed':
      return { action: 'meeting.admitted', state: 'waiting_for_admission' } as const
    case 'bot.recording_permission_denied':
      return { action: 'meeting.failed', state: 'failed' } as const
    case 'bot.in_call_recording':
      return { action: 'meeting.started', state: 'listening' } as const
    case 'bot.call_ended':
      if (
        failure.kind === 'lobby_denied' ||
        failure.kind === 'meeting_not_started' ||
        failure.kind === 'provider_timeout'
      ) {
        return { action: 'meeting.failed', state: 'failed' } as const
      }
      return { action: 'meeting.ended', state: 'stopped' } as const
    case 'bot.done':
      return { action: 'meeting.ended', state: 'stopped' } as const
    case 'bot.fatal':
      return { action: 'meeting.failed', state: 'failed' } as const
    default:
      return null
  }
}

function buildRecallJoinPayload(
  request: MeetingProviderJoinRequest
): RecallCreateBotRequest {
  if (!request.meeting.joinUrl) {
    throw new Error('Recall bot joins require a supported meeting URL.')
  }

  const inferredProvider = inferMeetingProviderFromUrl(request.meeting.joinUrl)
  if (!inferredProvider) {
    throw new Error(
      'Recall bot joins currently support Google Meet and Zoom meeting URLs.'
    )
  }
  if (inferredProvider !== request.provider) {
    throw new Error(
      `Meeting URL provider mismatch. Expected "${request.provider}" but received "${inferredProvider}".`
    )
  }

  const recall = getRecallClientConfig()

  const realtimeWebhookUrl = recall.realtimeWebhookUrl
    ? buildRecallRealtimeWebhookUrl(
        recall.realtimeWebhookUrl,
        recall.realtimeAuthToken
      )
    : null
  const chatWebhookUrl = realtimeWebhookUrl

  return {
    meeting_url: request.meeting.joinUrl,
    bot_name: request.botIdentity?.displayName ?? 'Kodi',
    zoom:
      request.provider === 'zoom' && request.providerInstallationId
        ? {
            zak_url: createZoomZakCallbackUrl(request.providerInstallationId),
          }
        : undefined,
    metadata: {
      orgId: request.orgId,
      provider: request.provider,
      internalMeetingSessionId: request.session?.internalMeetingSessionId ?? null,
      providerInstallationId: request.providerInstallationId ?? null,
      ...(request.metadata ?? {}),
    },
    recording_config: {
      chat_messages: chatWebhookUrl
        ? {
            webhook: {
              url: chatWebhookUrl,
            },
          }
        : undefined,
      transcript: realtimeWebhookUrl
        ? {
            provider: {
              recallai_streaming: {
                mode: 'prioritize_low_latency',
                language_code: 'en',
              },
            },
          }
        : undefined,
      realtime_endpoints: realtimeWebhookUrl
        ? [
            {
              type: 'webhook',
              url: realtimeWebhookUrl,
              events: [
                'participant_events.join',
                'participant_events.leave',
                'participant_events.update',
                'transcript.data',
                'transcript.partial_data',
              ],
            },
          ]
        : undefined,
    },
  }
}

export class RecallMeetingAdapter implements MeetingProviderAdapter {
  constructor(readonly provider: MeetingProviderJoinRequest['provider']) {}

  async prepare(
    request: MeetingProviderPrepareRequest
  ): Promise<MeetingProviderControlResult> {
    return {
      acceptedAt: new Date(),
      session: request.meeting.externalMeetingId
        ? { externalMeetingId: request.meeting.externalMeetingId }
        : null,
      lifecycleState: 'preparing',
      metadata: {
        transport: 'recall',
        ...(request.metadata ?? {}),
      },
    }
  }

  async join(
    request: MeetingProviderJoinRequest
  ): Promise<MeetingProviderControlResult> {
    const payload = buildRecallJoinPayload(request)
    const attempts: RecallJoinAttempt[] = []
    let response
    for (let attempt = 0; attempt < 2; attempt += 1) {
      const startedAt = new Date()
      try {
        response = await createRecallBot(payload)
        attempts.push({
          attempt: attempt + 1,
          startedAt: startedAt.toISOString(),
          completedAt: new Date().toISOString(),
          status: 'succeeded',
        })
        break
      } catch (error) {
        if (error instanceof RecallApiError) {
          const failure = classifyRecallFailure({ status: error.status })
          attempts.push({
            attempt: attempt + 1,
            startedAt: startedAt.toISOString(),
            completedAt: new Date().toISOString(),
            status: 'failed',
            httpStatus: error.status,
            failureKind: failure.kind,
            retryable: failure.retryable,
            message: error.message,
            providerBody: error.body ?? null,
          })
          if (failure.retryable && attempt === 0) {
            continue
          }

          throw new RecallMeetingJoinError(
            error.message,
            failure,
            attempts,
            error,
            error.status,
            error.body ?? null
          )
        }

        const failure = classifyUnexpectedRecallError(error)
        attempts.push({
          attempt: attempt + 1,
          startedAt: startedAt.toISOString(),
          completedAt: new Date().toISOString(),
          status: 'failed',
          failureKind: failure.kind,
          retryable: failure.retryable,
          message: error instanceof Error ? error.message : 'Unknown Recall error',
        })

        if (failure.retryable && attempt === 0) {
          continue
        }

        throw new RecallMeetingJoinError(
          error instanceof Error ? error.message : 'Unknown Recall error',
          failure,
          attempts,
          error,
          null,
          null
        )
      }
    }

    if (!response) {
      throw new Error('Recall bot creation did not return a response.')
    }
    const externalMeetingId = resolveRecallMeetingId(
      response.meeting_url,
      request.meeting.joinUrl ?? '',
      request.provider
    )

    return {
      acceptedAt: new Date(),
      lifecycleState: 'joining',
      session: {
        internalMeetingSessionId: request.session?.internalMeetingSessionId,
        externalMeetingId:
          externalMeetingId ??
          request.meeting.externalMeetingId ??
          request.session?.externalMeetingId ??
          null,
        externalMeetingInstanceId:
          externalMeetingId ??
          request.session?.externalMeetingInstanceId ??
          null,
        externalBotSessionId: response.id,
      },
      providerRequestId: response.id,
      metadata: {
        transport: 'recall',
        recallBotId: response.id,
        recallBotMetadata: response.metadata ?? null,
        retryCount: Math.max(0, attempts.length - 1),
        retryHistory: attempts,
      },
    }
  }

  async stop(
    request: MeetingProviderStopRequest
  ): Promise<MeetingProviderControlResult> {
    if (!request.session.externalBotSessionId) {
      throw new Error('Recall bot stop requires an external bot session id.')
    }

    await leaveRecallBot(request.session.externalBotSessionId)

    return {
      acceptedAt: new Date(),
      lifecycleState: 'stopped',
      session: request.session,
      providerRequestId: request.session.externalBotSessionId,
      metadata: {
        transport: 'recall',
        reason: request.reason ?? null,
        ...(request.metadata ?? {}),
      },
    }
  }

  async sendChatMessage(
    request: MeetingProviderSendChatMessageRequest
  ): Promise<MeetingProviderSendChatMessageResult> {
    if (!request.session.externalBotSessionId) {
      throw new Error(
        'Recall chat message send requires an external bot session id.'
      )
    }

    const recipient = request.to ?? 'everyone'

    await sendRecallBotChatMessage({
      botId: request.session.externalBotSessionId,
      message: request.message,
      to: recipient,
    })

    return {
      acceptedAt: new Date(),
      session: request.session,
      recipient,
      metadata: {
        transport: 'recall',
      },
    }
  }

  async normalizeEvent(
    envelope: MeetingProviderEventEnvelope
  ): Promise<MeetingProviderEvent[]> {
    const payload = asRecord(envelope.payload)
    if (!payload || typeof payload.event !== 'string') {
      return []
    }

    const session = extractSessionRef(payload) ?? envelope.session ?? null
    const occurredAt = extractOccurredAt(payload)
    const data = asRecord(payload.data)
    const eventData = asRecord(data?.data)
    const subCode =
      typeof eventData?.sub_code === 'string' ? eventData.sub_code : null

    if (payload.event.startsWith('bot.')) {
      const lifecycle = mapRecallBotEventToLifecycleState(
        payload.event,
        subCode
      )
      if (!lifecycle) return []
      const failure =
        lifecycle.state === 'failed'
          ? classifyRecallFailure({ subCode })
          : null
      const providerJoinDetail = describeRecallProviderJoinState(payload.event)
      const providerMessage =
        typeof eventData?.message === 'string' ? eventData.message : null

      return [
        {
          kind: 'lifecycle',
          provider: this.provider,
          occurredAt,
          session,
          action: lifecycle.action,
          state: lifecycle.state,
          errorCode: lifecycle.state === 'failed' ? subCode : null,
          errorMessage:
            lifecycle.state === 'failed'
              ? providerMessage
              : null,
          metadata: {
            transport: 'recall',
            recallEvent: payload.event,
            ...(providerJoinDetail ?? {}),
            lifecycleMessage:
              providerMessage ??
              providerJoinDetail?.lifecycleMessage ??
              null,
            failure,
          },
        },
      ]
    }

    if (payload.event.startsWith('participant_events.')) {
      if (payload.event === 'participant_events.chat_message') {
        const sender = asRecord(eventData?.participant ?? eventData?.sender)
        const text =
          typeof eventData?.text === 'string'
            ? eventData.text
            : typeof eventData?.message === 'string'
              ? eventData.message
              : null
        if (!text) return []

        const chatEvent: MeetingChatMessageEvent = {
          kind: 'chat_message',
          provider: this.provider,
          occurredAt,
          session,
          action: 'meeting.chat_message.received',
          message: {
            content: text,
            to:
              typeof eventData?.to === 'string'
                ? eventData.to
                : 'everyone',
            sender: sender
              ? {
                  providerParticipantId:
                    sender.id != null ? String(sender.id) : null,
                  displayName:
                    typeof sender.name === 'string' ? sender.name : null,
                  isHost: sender.is_host === true,
                }
              : null,
          },
          metadata: {
            transport: 'recall',
            recallEvent: payload.event,
          },
        }

        return [chatEvent]
      }

      const participant = asRecord(eventData?.participant)
      if (!participant) return []

      const action =
        payload.event === 'participant_events.join'
          ? 'participant.joined'
          : payload.event === 'participant_events.leave'
            ? 'participant.left'
            : 'participant.updated'

      return [
        {
          kind: 'participant',
          provider: this.provider,
          occurredAt,
          session,
          action,
          participant: {
            providerParticipantId:
              participant.id != null ? String(participant.id) : null,
            displayName:
              typeof participant.name === 'string' ? participant.name : null,
            email:
              typeof participant.email === 'string' ? participant.email : null,
          },
          metadata: {
            transport: 'recall',
            recallEvent: payload.event,
            participant: participant,
          },
        },
      ]
    }

    if (payload.event === 'bot.chat_message') {
      const sender = asRecord(data?.sender)
      const text = typeof data?.text === 'string' ? data.text : null
      if (!text) return []

      return [
        {
          kind: 'chat_message',
          provider: this.provider,
          occurredAt,
          session,
          action: 'meeting.chat_message.received',
          message: {
            content: text,
            to: typeof data?.to === 'string' ? data.to : 'everyone',
            sender: sender
              ? {
                  providerParticipantId:
                    sender.id != null ? String(sender.id) : null,
                  displayName:
                    typeof sender.name === 'string' ? sender.name : null,
                  isHost: sender.is_host === true,
                }
              : null,
          },
          metadata: {
            transport: 'recall',
            recallEvent: payload.event,
          },
        },
      ]
    }

    if (
      payload.event === 'transcript.data' ||
      payload.event === 'transcript.partial_data'
    ) {
      const words = Array.isArray(eventData?.words) ? eventData.words : []
      const participant = asRecord(eventData?.participant)
      const content = words
        .map((word) => {
          const item = asRecord(word)
          return typeof item?.text === 'string' ? item.text : ''
        })
        .join(' ')
        .trim()

      if (!content) return []

      const firstWord = asRecord(words[0])
      const lastWord = asRecord(words[words.length - 1])
      const firstTimestamp = asRecord(firstWord?.start_timestamp)
      const lastTimestamp = asRecord(lastWord?.end_timestamp)

      return [
        {
          kind: 'transcript',
          provider: this.provider,
          occurredAt,
          session,
          transcript: {
            content,
            speaker: participant
              ? {
                  providerParticipantId:
                    participant.id != null ? String(participant.id) : null,
                  displayName:
                    typeof participant.name === 'string'
                      ? participant.name
                      : null,
                  email:
                    typeof participant.email === 'string'
                      ? participant.email
                      : null,
                }
              : null,
            startOffsetMs:
              typeof firstTimestamp?.relative === 'number'
                ? Math.round(firstTimestamp.relative * 1000)
                : null,
            endOffsetMs:
              typeof lastTimestamp?.relative === 'number'
                ? Math.round(lastTimestamp.relative * 1000)
                : null,
            isPartial: payload.event === 'transcript.partial_data',
          },
          metadata: {
            transport: 'recall',
            recallEvent: payload.event,
            languageCode:
              typeof eventData?.language_code === 'string'
                ? eventData.language_code
                : null,
          },
        },
      ]
    }

    return []
  }

  async getHealth(
    _request: MeetingProviderHealthRequest
  ): Promise<MeetingProviderHealthSnapshot> {
    return {
      status: 'healthy',
      observedAt: new Date(),
      lifecycleState: 'idle',
      metadata: {
        transport: 'recall',
      },
    }
  }
}
