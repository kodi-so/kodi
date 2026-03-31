import rtms, {
  type JoinParams,
  type EventParticipantInfo,
  type Metadata,
  type SessionInfo,
} from '@zoom/rtms'
import { Hono } from 'hono'
import { logger } from 'hono/logger'
import { env } from './env'

type GatewayStateStatus =
  | 'joining'
  | 'live'
  | 'completed'
  | 'reconnecting'
  | 'failed'
  | 'stopped'

type RtmsSessionState = {
  meetingSessionId: string
  joinPayload: JoinParams
  startedAt: string
  joinedAt: string | null
  lastPayloadAt: string
  lastTranscriptAt: string | null
  status: GatewayStateStatus
  retryCount: number
  lastJoinReason: number | null
  lastLeaveReason: number | null
  participantSnapshot: Map<number, EventParticipantInfo>
  activeSpeaker: {
    userId: number
    userName: string
    timestamp: number
  } | null
  sessionInfo: SessionInfo | null
  client: InstanceType<typeof rtms.Client> | null
  retryTimer: ReturnType<typeof setTimeout> | null
  error: string | null
}

function mapLogLevel(level: typeof env.ZM_RTMS_LOG_LEVEL) {
  switch (level) {
    case 'error':
      return rtms.LogLevel.ERROR
    case 'warn':
      return rtms.LogLevel.WARN
    case 'debug':
      return rtms.LogLevel.DEBUG
    case 'trace':
      return rtms.LogLevel.TRACE
    case 'info':
    default:
      return rtms.LogLevel.INFO
  }
}

function mapLogFormat(format: typeof env.ZM_RTMS_LOG_FORMAT) {
  return format === 'json' ? rtms.LogFormat.JSON : rtms.LogFormat.PROGRESSIVE
}

rtms.configureLogger({
  enabled: env.ZM_RTMS_LOG_ENABLED,
  level: mapLogLevel(env.ZM_RTMS_LOG_LEVEL),
  format: mapLogFormat(env.ZM_RTMS_LOG_FORMAT),
})

const rtmsSessions = new Map<string, RtmsSessionState>()
const app = new Hono()

function isAuthorized(authorization: string | undefined) {
  if (!env.ZOOM_GATEWAY_INTERNAL_TOKEN) return true
  return authorization === `Bearer ${env.ZOOM_GATEWAY_INTERNAL_TOKEN}`
}

async function proxyToApi(path: string, body: unknown) {
  const res = await fetch(`${env.API_URL}${path}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(env.ZOOM_GATEWAY_INTERNAL_TOKEN
        ? { Authorization: `Bearer ${env.ZOOM_GATEWAY_INTERNAL_TOKEN}` }
        : {}),
    },
    body: JSON.stringify(body),
  })

  if (!res.ok) {
    const message = await res.text().catch(() => '')
    throw new Error(`API proxy failed (${res.status}): ${message}`)
  }

  const contentType = res.headers.get('content-type') ?? ''
  if (!contentType.includes('application/json')) {
    return null
  }

  return res.json().catch(() => null)
}

function summarizeSession(state: RtmsSessionState) {
  return {
    meetingSessionId: state.meetingSessionId,
    status: state.status,
    startedAt: state.startedAt,
    joinedAt: state.joinedAt,
    lastPayloadAt: state.lastPayloadAt,
    lastTranscriptAt: state.lastTranscriptAt,
    retryCount: state.retryCount,
    lastJoinReason: state.lastJoinReason,
    lastLeaveReason: state.lastLeaveReason,
    participantCount: state.participantSnapshot.size,
    activeSpeaker: state.activeSpeaker,
    sessionInfo: state.sessionInfo,
    error: state.error,
    joinPayload: {
      meeting_uuid: state.joinPayload.meeting_uuid,
      webinar_uuid: state.joinPayload.webinar_uuid,
      session_id: state.joinPayload.session_id,
      rtms_stream_id: state.joinPayload.rtms_stream_id,
      server_urls: state.joinPayload.server_urls,
    },
  }
}

function deriveRelativeOffsetMs(
  state: RtmsSessionState,
  timestamp: number
): number | null {
  const sessionStartMs =
    state.joinedAt != null ? new Date(state.joinedAt).getTime() : null
  if (!sessionStartMs || !Number.isFinite(timestamp)) return null

  const relative = timestamp - sessionStartMs
  if (relative < 0 || relative > 1000 * 60 * 60 * 12) return null
  return Math.round(relative)
}

async function postMeetingEvent(
  meetingSessionId: string,
  eventType: string,
  payload: Record<string, unknown>
) {
  return proxyToApi(`/internal/meetings/${meetingSessionId}/events`, {
    eventType,
    source: 'rtms',
    payload,
  })
}

async function postMeetingState(
  meetingSessionId: string,
  body: {
    status?: 'joining' | 'live' | 'completed' | 'failed'
    actualStartAt?: string | null
    endedAt?: string | null
    metadataPatch?: Record<string, unknown> | null
  }
) {
  return proxyToApi(`/internal/meetings/${meetingSessionId}/state`, body)
}

async function postParticipants(
  meetingSessionId: string,
  participants: Array<Record<string, unknown>>
) {
  return proxyToApi(`/internal/meetings/${meetingSessionId}/participants`, {
    participants,
  })
}

async function postTranscript(
  meetingSessionId: string,
  segments: Array<Record<string, unknown>>
) {
  return proxyToApi(`/internal/meetings/${meetingSessionId}/transcript`, {
    segments,
  })
}

function markActivity(state: RtmsSessionState) {
  state.lastPayloadAt = new Date().toISOString()
}

function buildJoinPayload(input: Record<string, unknown>): JoinParams | null {
  const source =
    input.joinPayload && typeof input.joinPayload === 'object'
      ? (input.joinPayload as Record<string, unknown>)
      : input

  const rtmsStreamId =
    typeof source.rtms_stream_id === 'string' ? source.rtms_stream_id : null
  const serverUrls =
    typeof source.server_urls === 'string' ? source.server_urls : null

  if (!rtmsStreamId || !serverUrls) return null

  const joinPayload: JoinParams = {
    rtms_stream_id: rtmsStreamId,
    server_urls: serverUrls,
    pollInterval: env.ZOOM_GATEWAY_POLL_INTERVAL_MS,
    timeout: env.ZOOM_GATEWAY_JOIN_TIMEOUT_MS,
  }

  if (typeof source.meeting_uuid === 'string') {
    joinPayload.meeting_uuid = source.meeting_uuid
  }
  if (typeof source.webinar_uuid === 'string') {
    joinPayload.webinar_uuid = source.webinar_uuid
  }
  if (typeof source.session_id === 'string') {
    joinPayload.session_id = source.session_id
  }
  if (typeof source.signature === 'string') {
    joinPayload.signature = source.signature
  }
  if (env.ZM_RTMS_CLIENT) {
    joinPayload.client = env.ZM_RTMS_CLIENT
  }
  if (env.ZM_RTMS_SECRET) {
    joinPayload.secret = env.ZM_RTMS_SECRET
  }
  if (env.ZM_RTMS_CA) {
    joinPayload.ca = env.ZM_RTMS_CA
  }

  return joinPayload
}

function createSessionState(
  meetingSessionId: string,
  joinPayload: JoinParams
): RtmsSessionState {
  const timestamp = new Date().toISOString()
  return {
    meetingSessionId,
    joinPayload,
    startedAt: timestamp,
    joinedAt: null,
    lastPayloadAt: timestamp,
    lastTranscriptAt: null,
    status: 'joining',
    retryCount: 0,
    lastJoinReason: null,
    lastLeaveReason: null,
    participantSnapshot: new Map(),
    activeSpeaker: null,
    sessionInfo: null,
    client: null,
    retryTimer: null,
    error: null,
  }
}

async function cleanupSession(
  state: RtmsSessionState,
  finalStatus: 'completed' | 'failed' | 'stopped',
  reason: string,
  removeFromMap = true
) {
  if (state.retryTimer) {
    clearTimeout(state.retryTimer)
    state.retryTimer = null
  }

  state.status = finalStatus === 'stopped' ? 'stopped' : finalStatus
  state.lastPayloadAt = new Date().toISOString()

  if (state.client) {
    try {
      state.client.leave()
    } catch {
      // ignore cleanup errors
    }
    state.client = null
  }

  await Promise.allSettled([
    postMeetingEvent(state.meetingSessionId, 'meeting.rtms.gateway_stopped', {
      reason,
      finalStatus,
      state: summarizeSession(state),
    }),
    postMeetingState(state.meetingSessionId, {
      status: finalStatus === 'stopped' ? 'failed' : finalStatus,
      endedAt:
        finalStatus === 'completed' || finalStatus === 'failed'
          ? new Date().toISOString()
          : undefined,
      metadataPatch: {
        rtmsGateway: {
          status: finalStatus,
          reason,
          stoppedAt: new Date().toISOString(),
          retryCount: state.retryCount,
        },
      },
    }),
  ])

  if (removeFromMap) {
    rtmsSessions.delete(state.meetingSessionId)
  }
}

function scheduleRetry(state: RtmsSessionState, reason: string) {
  if (state.retryCount >= env.ZOOM_GATEWAY_MAX_RETRIES) {
    void cleanupSession(state, 'failed', reason)
    return
  }

  state.retryCount += 1
  state.status = 'reconnecting'
  state.error = reason
  markActivity(state)

  void Promise.allSettled([
    postMeetingEvent(state.meetingSessionId, 'meeting.rtms.retry_scheduled', {
      reason,
      retryCount: state.retryCount,
      retryDelayMs: env.ZOOM_GATEWAY_RETRY_DELAY_MS,
    }),
    postMeetingState(state.meetingSessionId, {
      status: 'joining',
      metadataPatch: {
        rtmsGateway: {
          status: 'reconnecting',
          reason,
          retryCount: state.retryCount,
          retryScheduledAt: new Date(
            Date.now() + env.ZOOM_GATEWAY_RETRY_DELAY_MS
          ).toISOString(),
        },
      },
    }),
  ])

  if (state.retryTimer) {
    clearTimeout(state.retryTimer)
  }

  state.retryTimer = setTimeout(() => {
    state.retryTimer = null
    void joinSession(state, true)
  }, env.ZOOM_GATEWAY_RETRY_DELAY_MS)
}

function normalizeParticipant(
  participant: { userId: number; userName: string },
  event: 'join' | 'leave'
) {
  return {
    providerParticipantId: String(participant.userId),
    displayName: participant.userName,
    joinedAt: event === 'join' ? new Date().toISOString() : null,
    leftAt: event === 'leave' ? new Date().toISOString() : null,
  }
}

async function handleTranscriptData(
  state: RtmsSessionState,
  buffer: Buffer,
  size: number,
  timestamp: number,
  metadata: Metadata
) {
  const content = buffer.subarray(0, size).toString('utf8').trim()
  if (!content) return

  const now = new Date().toISOString()
  state.lastTranscriptAt = now
  markActivity(state)

  const startOffsetMs = deriveRelativeOffsetMs(state, timestamp)
  const endOffsetMs =
    startOffsetMs != null ? startOffsetMs + Math.max(size, 1) : null

  await postTranscript(state.meetingSessionId, [
    {
      providerParticipantId: String(metadata.userId),
      speakerName: metadata.userName,
      content,
      startOffsetMs,
      endOffsetMs,
      confidence: null,
      isPartial: false,
      metadata: {
        rawTimestamp: timestamp,
      },
    },
  ])
}

function attachClientCallbacks(
  state: RtmsSessionState,
  client: InstanceType<typeof rtms.Client>
) {
  client.onJoinConfirm((reason: number) => {
    void (async () => {
      if (state.client !== client) return
      state.lastJoinReason = reason
      markActivity(state)

      if (reason === rtms.RTMS_SDK_OK || reason === 0) {
        state.status = 'live'
        state.joinedAt = new Date().toISOString()
        state.error = null

        await Promise.allSettled([
          postMeetingEvent(state.meetingSessionId, 'meeting.rtms.join_confirm', {
            reason,
            state: summarizeSession(state),
          }),
          postMeetingState(state.meetingSessionId, {
            status: 'live',
            actualStartAt: state.joinedAt,
            metadataPatch: {
              rtmsGateway: {
                status: 'live',
                joinedAt: state.joinedAt,
                retryCount: state.retryCount,
              },
            },
          }),
        ])
        return
      }

      scheduleRetry(state, `join_confirm_${reason}`)
    })()
  })

  client.onSessionUpdate((op: number, sessionInfo: SessionInfo) => {
    void (async () => {
      if (state.client !== client) return
      state.sessionInfo = sessionInfo
      markActivity(state)

      if (sessionInfo.isActive) {
        state.status = 'live'
      }

      await Promise.allSettled([
        postMeetingEvent(state.meetingSessionId, 'meeting.rtms.session_update', {
          op,
          sessionInfo,
        }),
        postMeetingState(state.meetingSessionId, {
          status: sessionInfo.isActive ? 'live' : undefined,
          metadataPatch: {
            rtmsGateway: {
              sessionInfo,
              sessionOp: op,
            },
          },
        }),
      ])
    })()
  })

  client.onParticipantEvent(
    (
      event: 'join' | 'leave',
      timestamp: number,
      participants: EventParticipantInfo[]
    ) => {
      void (async () => {
        if (state.client !== client) return
        markActivity(state)
        for (const participant of participants) {
          if (event === 'join') {
            state.participantSnapshot.set(participant.userId, participant)
          } else {
            state.participantSnapshot.delete(participant.userId)
          }
        }

        await Promise.allSettled([
          postParticipants(
            state.meetingSessionId,
            participants.map((participant: EventParticipantInfo) =>
              normalizeParticipant(
                {
                  userId: participant.userId,
                  userName: participant.userName ?? String(participant.userId),
                },
                event
              )
            )
          ),
          postMeetingEvent(
            state.meetingSessionId,
            `meeting.rtms.participant_${event}`,
            {
              timestamp,
              participants,
            }
          ),
        ])
      })()
    }
  )

  client.onActiveSpeakerEvent(
    (timestamp: number, userId: number, userName: string) => {
      void (async () => {
        if (state.client !== client) return
        state.activeSpeaker = { timestamp, userId, userName }
        markActivity(state)

        await Promise.allSettled([
          postMeetingEvent(
            state.meetingSessionId,
            'meeting.rtms.active_speaker_changed',
            { timestamp, userId, userName }
          ),
          postMeetingState(state.meetingSessionId, {
            metadataPatch: {
              rtmsGateway: {
                activeSpeaker: {
                  timestamp,
                  userId,
                  userName,
                },
              },
            },
          }),
        ])
      })()
    }
  )

  client.onMediaConnectionInterrupted((timestamp: number) => {
    if (state.client !== client) return
    void postMeetingEvent(
      state.meetingSessionId,
      'meeting.rtms.media_connection_interrupted',
      { timestamp }
    )
  })

  client.onTranscriptData(
    (buffer: Buffer, size: number, timestamp: number, metadata: Metadata) => {
      if (state.client !== client) return
      void handleTranscriptData(state, buffer, size, timestamp, metadata)
    }
  )

  client.onLeave((reason: number) => {
    if (state.client !== client) return
    state.lastLeaveReason = reason
    markActivity(state)

    if (state.status === 'stopped') {
      return
    }

    if (reason === rtms.RTMS_SDK_OK || reason === 0) {
      void cleanupSession(state, 'completed', `leave_${reason}`)
      return
    }

    scheduleRetry(state, `leave_${reason}`)
  })
}

async function joinSession(state: RtmsSessionState, isRetry = false) {
  if (state.client) {
    const previousClient = state.client
    state.client = null
    try {
      previousClient.leave()
    } catch {
      // no-op
    }
  }

  const client = new rtms.Client()
  state.client = client
  state.status = isRetry ? 'reconnecting' : 'joining'
  attachClientCallbacks(state, client)

  await Promise.allSettled([
    postMeetingEvent(state.meetingSessionId, 'meeting.rtms.gateway_joining', {
      isRetry,
      retryCount: state.retryCount,
      joinPayload: {
        meeting_uuid: state.joinPayload.meeting_uuid,
        webinar_uuid: state.joinPayload.webinar_uuid,
        session_id: state.joinPayload.session_id,
        rtms_stream_id: state.joinPayload.rtms_stream_id,
        server_urls: state.joinPayload.server_urls,
      },
    }),
    postMeetingState(state.meetingSessionId, {
      status: 'joining',
      metadataPatch: {
        rtmsGateway: {
          status: isRetry ? 'reconnecting' : 'joining',
          retryCount: state.retryCount,
        },
      },
    }),
  ])

  try {
    const joined = client.join(state.joinPayload)
    if (!joined) {
      scheduleRetry(state, 'join_returned_false')
    }
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'Unknown RTMS join failure'
    scheduleRetry(state, message)
  }
}

app.use('*', logger())

app.get('/health', (c) => {
  return c.json({
    ok: true,
    activeSessions: rtmsSessions.size,
    sessions: Array.from(rtmsSessions.values()).map(summarizeSession),
  })
})

app.post('/internal/rtms/start', async (c) => {
  if (!isAuthorized(c.req.header('authorization'))) {
    return c.json({ error: 'Unauthorized' }, 401)
  }

  const body = (await c.req.json()) as Record<string, unknown>
  const meetingSessionId =
    typeof body.meetingSessionId === 'string' ? body.meetingSessionId : null
  const joinPayload = buildJoinPayload(body)

  if (!meetingSessionId) {
    return c.json({ error: 'meetingSessionId is required' }, 400)
  }
  if (!joinPayload) {
    return c.json(
      {
        error:
          'A valid RTMS join payload with rtms_stream_id and server_urls is required',
      },
      400
    )
  }

  const existing = rtmsSessions.get(meetingSessionId)
  if (existing) {
    await cleanupSession(existing, 'stopped', 'replaced_by_new_start')
  }

  const state = createSessionState(meetingSessionId, joinPayload)
  rtmsSessions.set(meetingSessionId, state)
  await joinSession(state)

  return c.json({
    ok: true,
    activeSessions: rtmsSessions.size,
    session: summarizeSession(state),
  })
})

app.post('/internal/rtms/:meetingSessionId/participants', async (c) => {
  if (!isAuthorized(c.req.header('authorization'))) {
    return c.json({ error: 'Unauthorized' }, 401)
  }

  const meetingSessionId = c.req.param('meetingSessionId')
  const body = (await c.req.json()) as {
    participants?: Array<Record<string, unknown>>
  }
  const existing = rtmsSessions.get(meetingSessionId)
  if (existing) {
    markActivity(existing)
  }

  const forwarded = await postParticipants(
    meetingSessionId,
    body.participants ?? []
  )

  return c.json({
    ok: true,
    forwarded,
  })
})

app.post('/internal/rtms/:meetingSessionId/transcript', async (c) => {
  if (!isAuthorized(c.req.header('authorization'))) {
    return c.json({ error: 'Unauthorized' }, 401)
  }

  const meetingSessionId = c.req.param('meetingSessionId')
  const body = (await c.req.json()) as {
    segments?: Array<Record<string, unknown>>
  }
  const existing = rtmsSessions.get(meetingSessionId)
  if (existing) {
    markActivity(existing)
  }

  const forwarded = await postTranscript(meetingSessionId, body.segments ?? [])

  return c.json({
    ok: true,
    forwarded,
  })
})

app.post('/internal/rtms/:meetingSessionId/stop', async (c) => {
  if (!isAuthorized(c.req.header('authorization'))) {
    return c.json({ error: 'Unauthorized' }, 401)
  }

  const meetingSessionId = c.req.param('meetingSessionId')
  const body = (await c.req.json().catch(() => ({}))) as Record<string, unknown>
  const existing = rtmsSessions.get(meetingSessionId)

  if (!existing) {
    await postMeetingEvent(meetingSessionId, 'meeting.rtms.gateway_stop_requested', {
      reason: body.reason ?? 'manual_stop_without_session',
      finalStatus: body.finalStatus ?? 'completed',
    })

    await postMeetingState(meetingSessionId, {
      status: body.finalStatus === 'failed' ? 'failed' : 'completed',
      endedAt: new Date().toISOString(),
      metadataPatch: {
        rtmsGateway: {
          status: 'stopped',
          reason: body.reason ?? 'manual_stop_without_session',
        },
      },
    })

    return c.json({
      ok: true,
      activeSessions: rtmsSessions.size,
      stopped: false,
    })
  }

  const finalStatus = body.finalStatus === 'failed' ? 'failed' : 'completed'
  await cleanupSession(
    existing,
    finalStatus,
    typeof body.reason === 'string' ? body.reason : 'manual_stop'
  )

  return c.json({
    ok: true,
    activeSessions: rtmsSessions.size,
    stopped: true,
  })
})

export default {
  port: env.PORT,
  fetch: app.fetch,
}
