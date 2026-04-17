import { getRecallClientConfig } from './config'

export type RecallCreateBotRequest = {
  meeting_url: string
  bot_name?: string
  automatic_audio_output?: {
    in_call_recording: {
      data: {
        kind: 'mp3'
        b64_data: string
      }
      replay_on_participant_join?: {
        debounce_mode: 'trailing' | 'leading'
        debounce_interval: number
        disable_after: number
      }
    }
  }
  metadata?: Record<string, string | null>
  recording_config?: {
    meeting_metadata?: Record<string, unknown>
    participant_events?: Record<string, unknown>
    transcript?: {
      provider?: {
        recallai_streaming?: {
          mode?: 'prioritize_low_latency' | 'prioritize_accuracy'
          language_code?: string
        }
      }
      diarization?: {
        use_separate_streams_when_available?: boolean
      }
    }
    realtime_endpoints?: Array<{
      type: 'webhook'
      url: string
      events: string[]
    }>
  } | null
}

export type RecallCreateBotResponse = {
  id: string
  meeting_url?: {
    meeting_id?: string | null
    platform?: string | null
  } | string | null
  metadata?: Record<string, unknown> | null
}

export type RecallBotStatusRecord = {
  code?: string | null
  sub_code?: string | null
  message?: string | null
  created_at?: string | null
  updated_at?: string | null
}

export type RecallRetrieveBotResponse = {
  id: string
  status?: RecallBotStatusRecord | null
  status_changes?: RecallBotStatusRecord[] | null
  metadata?: Record<string, unknown> | null
}

export type RecallFailureKind =
  | 'lobby_denied'
  | 'bad_meeting_url'
  | 'meeting_not_started'
  | 'auth_failure'
  | 'provider_timeout'
  | 'provider_failure'

export type RecallFailureClassification = {
  kind: RecallFailureKind
  subCode: string | null
  retryable: boolean
}

export type RecallJoinAttempt = {
  attempt: number
  startedAt: string
  completedAt: string
  status: 'succeeded' | 'failed'
  httpStatus?: number | null
  failureKind?: RecallFailureKind | null
  retryable?: boolean | null
  message?: string | null
  providerBody?: RecallApiErrorBody | null
}

type RecallApiErrorBody = {
  detail?: string
  message?: string
  errors?: unknown
  [key: string]: unknown
}

function extractRecallErrorMessage(body: RecallApiErrorBody): string | null {
  if (typeof body.detail === 'string') return body.detail
  if (typeof body.message === 'string') return body.message
  // Field-level validation errors: { meeting_url: ["msg"], ... }
  const fieldErrors = Object.entries(body)
    .filter(([, v]) => Array.isArray(v))
    .map(([k, v]) => `${k}: ${(v as unknown[]).join(', ')}`)
  if (fieldErrors.length > 0) return fieldErrors.join('; ')
  return null
}

export class RecallApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly body?: RecallApiErrorBody | null
  ) {
    super(message)
    this.name = 'RecallApiError'
  }
}

export class RecallMeetingJoinError extends Error {
  constructor(
    message: string,
    readonly failure: RecallFailureClassification,
    readonly attempts: RecallJoinAttempt[],
    readonly cause?: unknown,
    readonly providerStatus?: number | null,
    readonly providerBody?: RecallApiErrorBody | null
  ) {
    super(message)
    this.name = 'RecallMeetingJoinError'
  }
}

export function classifyUnexpectedRecallError(
  error: unknown
): RecallFailureClassification {
  if (error instanceof RecallApiError) {
    return classifyRecallFailure({ status: error.status })
  }

  if (error instanceof Error) {
    const message = error.message.toLowerCase()
    if (
      error.name === 'AbortError' ||
      message.includes('timeout') ||
      message.includes('timed out')
    ) {
      return {
        kind: 'provider_timeout',
        subCode: null,
        retryable: true,
      }
    }
  }

  return {
    kind: 'provider_failure',
    subCode: null,
    retryable: true,
  }
}

export function classifyRecallFailure(input: {
  subCode?: string | null
  status?: number | null
}): RecallFailureClassification {
  const subCode = input.subCode ?? null

  if (
    subCode === 'bot_kicked_from_waiting_room' ||
    subCode === 'google_meet_bot_blocked' ||
    subCode === 'call_ended_by_platform_waiting_room_timeout'
  ) {
    return { kind: 'lobby_denied', subCode, retryable: false }
  }

  if (subCode === 'meeting_link_invalid' || subCode === 'meeting_not_found') {
    return { kind: 'bad_meeting_url', subCode, retryable: false }
  }

  if (subCode === 'meeting_not_started') {
    return { kind: 'meeting_not_started', subCode, retryable: true }
  }

  if (
    subCode === 'meeting_requires_sign_in' ||
    subCode === 'google_meet_sign_in_failed' ||
    subCode === 'google_meet_sign_in_captcha_failed' ||
    subCode === 'google_meet_sso_sign_in_failed' ||
    subCode === 'google_meet_sign_in_missing_login_credentials' ||
    subCode === 'google_meet_sign_in_missing_recovery_credentials' ||
    subCode === 'google_meet_sso_sign_in_missing_login_credentials'
  ) {
    return { kind: 'auth_failure', subCode, retryable: false }
  }

  if (
    subCode === 'failed_to_launch_in_time' ||
    subCode?.startsWith('timeout_exceeded_') ||
    input.status === 408 ||
    input.status === 504
  ) {
    return { kind: 'provider_timeout', subCode, retryable: true }
  }

  return {
    kind: 'provider_failure',
    subCode,
    retryable: input.status != null ? input.status >= 500 : false,
  }
}

async function recallFetch<TResponse>(
  path: string,
  init?: RequestInit
): Promise<TResponse> {
  const { apiKey, apiBaseUrl } = getRecallClientConfig()

  const response = await fetch(`${apiBaseUrl}${path}`, {
    ...init,
    headers: {
      Authorization: apiKey,
      accept: 'application/json',
      'content-type': 'application/json',
      ...(init?.headers ?? {}),
    },
  })

  if (!response.ok) {
    let body: RecallApiErrorBody | null = null
    try {
      body = (await response.json()) as RecallApiErrorBody
    } catch {
      body = null
    }

    const extracted = body ? extractRecallErrorMessage(body) : null
    console.error('[recall] API error', { status: response.status, body })

    throw new RecallApiError(
      extracted ?? `Recall API request failed with status ${response.status}.`,
      response.status,
      body
    )
  }

  return (await response.json()) as TResponse
}

export function buildRecallRealtimeWebhookUrl(baseUrl: string, token?: string | null) {
  const url = new URL(baseUrl)
  if (token && !url.pathname.endsWith('/')) {
    url.pathname = `${url.pathname}/`
  }
  if (token) {
    url.searchParams.set('token', token)
  }
  return url.toString()
}

export async function createRecallBot(input: RecallCreateBotRequest) {
  return recallFetch<RecallCreateBotResponse>('/api/v1/bot/', {
    method: 'POST',
    body: JSON.stringify(input),
  })
}

export async function leaveRecallBot(botId: string) {
  return recallFetch<Record<string, unknown>>(`/api/v1/bot/${botId}/leave_call/`, {
    method: 'POST',
    body: JSON.stringify({}),
  })
}

export async function retrieveRecallBot(botId: string) {
  return recallFetch<RecallRetrieveBotResponse>(`/api/v1/bot/${botId}/`, {
    method: 'GET',
  })
}

export async function sendRecallBotChatMessage(botId: string, message: string) {
  return recallFetch<Record<string, unknown>>(
    `/api/v1/bot/${botId}/send_chat_message/`,
    {
      method: 'POST',
      body: JSON.stringify({ message }),
    }
  )
}

export type RecallOutputMediaRequest = {
  camera?: {
    kind: 'webpage'
    config: {
      url: string
    }
  }
  screenshare?: {
    kind: 'webpage'
    config: {
      url: string
    }
  }
}

/**
 * Start or refresh Recall Output Media for a bot.
 *
 * This streams a webpage's audio/video into the meeting, which is the provider-
 * supported path for real-time interactive agents.
 */
export async function startRecallBotOutputMedia(
  botId: string,
  input: RecallOutputMediaRequest
) {
  return recallFetch<Record<string, unknown>>(
    `/api/v1/bot/${botId}/output_media/`,
    {
      method: 'POST',
      body: JSON.stringify(input),
    }
  )
}

/**
 * Stop any active Recall Output Media webpage for the bot camera.
 */
export async function stopRecallBotOutputMedia(botId: string) {
  return recallFetch<Record<string, unknown>>(
    `/api/v1/bot/${botId}/output_media/`,
    {
      method: 'DELETE',
      body: JSON.stringify({ camera: true }),
    }
  )
}

/**
 * Inject audio directly into the meeting via Recall's output_audio endpoint.
 *
 * This bypasses the headless-browser capture pipeline used by output_media and
 * delivers audio with full fidelity directly to Zoom/Meet. Requires the bot to
 * have been created with automatic_audio_output: true.
 *
 * @param botId  - The Recall bot session ID.
 * @param audioBuffer - Raw MP3 bytes generated by TTS.
 */
export async function sendRecallBotOutputAudio(
  botId: string,
  audioBuffer: Buffer
) {
  return recallFetch<Record<string, unknown>>(
    `/api/v1/bot/${botId}/output_audio/`,
    {
      method: 'POST',
      body: JSON.stringify({
        kind: 'mp3',
        b64_data: audioBuffer.toString('base64'),
      }),
    }
  )
}
