import type {
  MeetingProviderAdapter,
  MeetingProviderControlResult,
  MeetingProviderHealthRequest,
  MeetingProviderJoinRequest,
  MeetingProviderPrepareRequest,
  MeetingProviderStopRequest,
} from '../../meetings/provider-adapter'
import type {
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
} from './client'
import { getRecallClientConfig } from './config'

function parseGoogleMeetId(joinUrl: string) {
  try {
    const url = new URL(joinUrl)
    if (!url.hostname.includes('meet.google.com')) return null

    const match = url.pathname.match(/\/([a-z]{3}-[a-z]{4}-[a-z]{3})/i)
    return match?.[1] ?? null
  } catch {
    return null
  }
}

function resolveRecallMeetingId(
  responseMeetingUrl: unknown,
  fallbackJoinUrl: string
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

  return parseGoogleMeetId(fallbackJoinUrl)
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

function mapRecallBotEventToLifecycleState(eventName: string, subCode?: string | null) {
  const failure = classifyRecallFailure({ subCode })

  switch (eventName) {
    case 'bot.joining_call':
      return { action: 'meeting.joining', state: 'joining' } as const
    case 'bot.in_waiting_room':
      return {
        action: 'meeting.joining',
        state: 'waiting_for_admission',
      } as const
    case 'bot.in_call_not_recording':
      return { action: 'meeting.joined', state: 'joining' } as const
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
    throw new Error('Recall bot joins require a Google Meet URL.')
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
      meeting_metadata: {},
      participant_events: {},
      transcript: realtimeWebhookUrl
        ? {
            provider: {
              recallai_streaming: {
                mode: 'prioritize_low_latency',
              },
            },
            diarization: {
              use_separate_streams_when_available: true,
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

export class RecallGoogleMeetAdapter implements MeetingProviderAdapter {
  readonly provider = 'google_meet'

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
      request.meeting.joinUrl ?? ''
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

    if (payload.event.startsWith('bot.')) {
      const lifecycle = mapRecallBotEventToLifecycleState(payload.event, subCode)
      if (!lifecycle) return []
      const failure =
        lifecycle.state === 'failed'
          ? classifyRecallFailure({ subCode })
          : null

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
            lifecycle.state === 'failed' && typeof eventData?.message === 'string'
              ? eventData.message
              : null,
          metadata: {
            transport: 'recall',
            recallEvent: payload.event,
            failure,
          },
        },
      ]
    }

    if (payload.event.startsWith('participant_events.')) {
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
