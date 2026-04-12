import type {
  MeetingProviderAdapter,
  MeetingProviderControlResult,
  MeetingProviderHealthRequest,
  MeetingProviderJoinRequest,
  MeetingProviderPrepareRequest,
  MeetingProviderStopRequest,
} from '../../meetings/provider-adapter'
import type {
  MeetingParticipantIdentity,
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
  retrieveRecallBot,
  type RecallRetrieveBotResponse,
} from './client'
import { getRecallClientConfig } from './config'
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

  const timestamp = asRecord(statusData?.timestamp)
  const absoluteTimestamp = timestamp?.absolute

  if (typeof absoluteTimestamp === 'string') {
    const parsed = new Date(absoluteTimestamp)
    if (!Number.isNaN(parsed.getTime())) {
      return parsed
    }
  }

  if (typeof payload.event_ts === 'number') {
    const parsed = new Date(payload.event_ts * 1000)
    if (!Number.isNaN(parsed.getTime())) {
      return parsed
    }
  }

  return new Date()
}

function extractRecallParticipantIdentity(
  participant: Record<string, unknown> | null
): MeetingParticipantIdentity | null {
  if (!participant) return null

  return {
    providerParticipantId:
      participant.id != null ? String(participant.id) : null,
    displayName:
      typeof participant.name === 'string' ? participant.name : null,
    email:
      typeof participant.email === 'string' ? participant.email : null,
  }
}

function normalizeRecallStatusCode(value: string | null | undefined) {
  if (!value) return null
  return value.startsWith('bot.') ? value : `bot.${value}`
}

function resolveLatestRecallBotStatus(bot: RecallRetrieveBotResponse) {
  const directStatus = asRecord(bot.status)
  if (typeof directStatus?.code === 'string') {
    return {
      code: normalizeRecallStatusCode(directStatus.code),
      subCode:
        typeof directStatus.sub_code === 'string' ? directStatus.sub_code : null,
      message:
        typeof directStatus.message === 'string' ? directStatus.message : null,
      observedAt:
        typeof directStatus.updated_at === 'string'
          ? directStatus.updated_at
          : typeof directStatus.created_at === 'string'
            ? directStatus.created_at
            : null,
    }
  }

  const statusChanges = Array.isArray(bot.status_changes) ? bot.status_changes : []
  const latest = statusChanges
    .map((item) => asRecord(item))
    .filter((item): item is Record<string, unknown> => Boolean(item))
    .reverse()
    .find((item) => typeof item.code === 'string')

  if (!latest) {
    return {
      code: null,
      subCode: null,
      message: null,
      observedAt: null,
    }
  }

  return {
    code: normalizeRecallStatusCode(latest.code as string),
    subCode: typeof latest.sub_code === 'string' ? latest.sub_code : null,
    message: typeof latest.message === 'string' ? latest.message : null,
    observedAt:
      typeof latest.updated_at === 'string'
        ? latest.updated_at
        : typeof latest.created_at === 'string'
          ? latest.created_at
          : null,
  }
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

  return {
    meeting_url: request.meeting.joinUrl,
    bot_name: request.botIdentity?.displayName ?? 'Kodi',
    metadata: {
      orgId: request.orgId,
      provider: request.provider,
      internalMeetingSessionId: request.session?.internalMeetingSessionId ?? null,
      ...(request.metadata ?? {}),
    },
    recording_config: {
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
                'participant_events.chat_message',
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
    const recallDeliveryId = envelope.deliveryId ?? null

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
            recallDeliveryId,
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
        const participant = asRecord(eventData?.participant)
        const messageData = asRecord(eventData?.data)
        const content =
          typeof messageData?.text === 'string' ? messageData.text.trim() : ''

        if (!content) return []

        return [
          {
            kind: 'chat',
            provider: this.provider,
            occurredAt,
            session,
            action: 'meeting.chat_message.received',
            message: {
              content,
              to:
                typeof messageData?.to === 'string' ? messageData.to : 'everyone',
              sender: extractRecallParticipantIdentity(participant),
            },
            metadata: {
              transport: 'recall',
              recallEvent: payload.event,
              recallDeliveryId,
              participant: participant,
              message: messageData,
            },
          },
        ]
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
          participant: extractRecallParticipantIdentity(participant) ?? {},
          metadata: {
            transport: 'recall',
            recallEvent: payload.event,
            recallDeliveryId,
            participant: participant,
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
            speaker: extractRecallParticipantIdentity(participant),
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
            recallDeliveryId,
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
    request: MeetingProviderHealthRequest
  ): Promise<MeetingProviderHealthSnapshot> {
    const botId = request.session?.externalBotSessionId
    if (!botId) {
      return {
        status: 'healthy',
        observedAt: new Date(),
        lifecycleState: 'idle',
        detail: 'No active Recall bot session has been assigned yet.',
        metadata: {
          transport: 'recall',
        },
      }
    }

    const bot = await retrieveRecallBot(botId)
    const latestStatus = resolveLatestRecallBotStatus(bot)
    const observedAt = latestStatus.observedAt
      ? new Date(latestStatus.observedAt)
      : new Date()
    const lifecycle = latestStatus.code
      ? mapRecallBotEventToLifecycleState(latestStatus.code, latestStatus.subCode)
      : null
    const providerJoinDetail = latestStatus.code
      ? describeRecallProviderJoinState(latestStatus.code)
      : null
    const failure =
      latestStatus.subCode != null
        ? classifyRecallFailure({ subCode: latestStatus.subCode })
        : null

    let status: MeetingProviderHealthSnapshot['status'] = 'healthy'
    if (lifecycle?.state === 'failed') {
      status = 'down'
    } else if (
      providerJoinDetail?.providerJoinState === 'waiting_room' ||
      providerJoinDetail?.providerJoinState === 'awaiting_recording_permission'
    ) {
      status = 'degraded'
    }

    return {
      status,
      observedAt,
      lifecycleState: lifecycle?.state ?? 'idle',
      detail:
        latestStatus.message ??
        providerJoinDetail?.lifecycleMessage ??
        'Recall bot health is nominal.',
      metadata: {
        transport: 'recall',
        recallBotId: bot.id,
        recallStatusCode: latestStatus.code,
        recallSubCode: latestStatus.subCode,
        failure,
      },
    }
  }
}
