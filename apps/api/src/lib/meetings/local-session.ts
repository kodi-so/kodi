import { createHash, randomBytes } from 'crypto'
import {
  db,
  eq,
  localMeetingSessions,
  meetingParticipants,
  meetingSessions,
  type MeetingCopilotSettings,
  type MeetingParticipationMode,
} from '@kodi/db'
import { TRPCError } from '@trpc/server'
import { appendNormalizedMeetingEvent } from './ingestion'
import type { MeetingProviderEvent } from './events'
import {
  appendMeetingAuditEvent,
  ensureMeetingSessionControls,
} from './copilot-policy'
import { retryPostMeetingArtifacts } from './post-meeting-service'
import { featureFlags } from '../features'

type Database = typeof db

export type LocalMeetingMode = 'solo' | 'room'
export type LocalCaptureState =
  | 'ready'
  | 'capturing'
  | 'paused'
  | 'reconnecting'
  | 'failed'
  | 'ended'
export type LocalTranscriptionState =
  | 'not_started'
  | 'connecting'
  | 'transcribing'
  | 'degraded'
  | 'failed'
  | 'ended'

export type LocalSessionBrowserMetadata = {
  browserFamily?: string | null
  browserVersion?: string | null
  platform?: string | null
}

export type LocalSessionDeviceSelection = {
  inputDeviceId?: string | null
  inputDeviceLabel?: string | null
  outputDeviceId?: string | null
  outputDeviceLabel?: string | null
}

export type LocalSessionStartSource =
  | 'web_app'
  | 'desktop_app'
  | 'desktop_tray'
  | 'scheduled_event'

export function localMeetingsEnabled() {
  return featureFlags.localMeetings
}

export function isLocalMeetingProvider(provider: string | null | undefined) {
  return provider === 'local'
}

export function hashLocalIngestToken(token: string) {
  return createHash('sha256').update(token).digest('hex')
}

function createLocalIngestToken() {
  const token = randomBytes(32).toString('base64url')
  return {
    token,
    hash: hashLocalIngestToken(token),
    expiresAt: new Date(Date.now() + 8 * 60 * 60 * 1000),
  }
}

export async function startLocalMeetingSession(
  database: Database,
  input: {
    orgId: string
    actorUserId: string
    actorUserName?: string | null
    actorUserEmail?: string | null
    orgName: string
    mode: LocalMeetingMode
    title?: string | null
    devices?: LocalSessionDeviceSelection
    browser?: LocalSessionBrowserMetadata
    startedFrom?: LocalSessionStartSource
    scheduledCalendarEventId?: string | null
    participationMode?: MeetingParticipationMode
    settings: MeetingCopilotSettings
  }
) {
  if (!localMeetingsEnabled()) {
    throw new TRPCError({
      code: 'PRECONDITION_FAILED',
      message: 'Local meetings are not enabled for this environment yet.',
    })
  }

  const ingest = createLocalIngestToken()
  const now = new Date()
  const startedFrom = input.startedFrom ?? 'web_app'
  const title =
    input.title?.trim() ||
    (input.mode === 'solo'
      ? 'Solo thinking session'
      : `${input.orgName} local meeting`)

  const [meeting] = await database
    .insert(meetingSessions)
    .values({
      orgId: input.orgId,
      provider: 'local',
      providerInstallationId: null,
      hostUserId: input.actorUserId,
      title,
      status: 'listening',
      consentState: 'local_disclosure_acknowledged',
      scheduledStartAt: input.scheduledCalendarEventId ? now : null,
      actualStartAt: now,
      metadata: {
        localMeeting: true,
        localMode: input.mode,
        startedFrom,
        scheduledCalendarEventId: input.scheduledCalendarEventId ?? null,
      },
    })
    .returning()

  if (!meeting) {
    throw new Error('Failed to create local meeting session.')
  }

  const [localSession] = await database
    .insert(localMeetingSessions)
    .values({
      orgId: input.orgId,
      meetingSessionId: meeting.id,
      startedByUserId: input.actorUserId,
      mode: input.mode,
      permissionState: 'granted',
      captureState: 'capturing',
      transcriptionState: 'connecting',
      inputDeviceId: input.devices?.inputDeviceId ?? null,
      inputDeviceLabel: input.devices?.inputDeviceLabel ?? null,
      outputDeviceId: input.devices?.outputDeviceId ?? null,
      outputDeviceLabel: input.devices?.outputDeviceLabel ?? null,
      browserFamily: input.browser?.browserFamily ?? null,
      browserVersion: input.browser?.browserVersion ?? null,
      platform: input.browser?.platform ?? null,
      ingestTokenHash: ingest.hash,
      ingestTokenExpiresAt: ingest.expiresAt,
      lastHeartbeatAt: now,
      diagnostics: {
        ingestProtocol: 'http-chunk-v1',
        transcriptionProvider: 'browser-speech-recognition',
        startedFrom,
        scheduledCalendarEventId: input.scheduledCalendarEventId ?? null,
      },
    })
    .returning()

  if (!localSession) {
    throw new Error('Failed to create local meeting runtime state.')
  }

  await database.insert(meetingParticipants).values({
    meetingSessionId: meeting.id,
    providerParticipantId: `local-user:${input.actorUserId}`,
    displayName: input.actorUserName ?? input.actorUserEmail ?? 'Meeting host',
    email: input.actorUserEmail ?? null,
    userId: input.actorUserId,
    isHost: true,
    isInternal: true,
    joinedAt: now,
    metadata: {
      source: 'local-session-start',
      localMode: input.mode,
      startedFrom,
    },
  })

  const controls = await ensureMeetingSessionControls(database, {
    meetingSessionId: meeting.id,
    orgId: input.orgId,
    settings: input.settings,
    actorUserId: input.actorUserId,
  })

  if (
    input.participationMode &&
    input.participationMode !== controls.participationMode
  ) {
    await database
      .update(localMeetingSessions)
      .set({
        diagnostics: {
          ...(localSession.diagnostics ?? {}),
          requestedParticipationMode: input.participationMode,
        },
      })
      .where(eq(localMeetingSessions.id, localSession.id))
  }

  await appendMeetingAuditEvent(database, {
    meetingSessionId: meeting.id,
    eventType: 'meeting.started',
    payload: {
      provider: 'local',
      mode: input.mode,
      actorUserId: input.actorUserId,
      captureState: 'capturing',
      transcriptionState: 'connecting',
      startedFrom,
      scheduledCalendarEventId: input.scheduledCalendarEventId ?? null,
    },
  })

  return {
    meetingSession: meeting,
    localSession,
    ingestToken: ingest.token,
    ingestTokenExpiresAt: ingest.expiresAt,
  }
}

export async function getLocalMeetingForToken(token: string) {
  const tokenHash = hashLocalIngestToken(token)
  const localSession = await db.query.localMeetingSessions.findFirst({
    where: (fields, { eq }) => eq(fields.ingestTokenHash, tokenHash),
  })

  if (!localSession) return null
  if (localSession.ingestTokenRevokedAt) return null
  if (localSession.ingestTokenExpiresAt.getTime() <= Date.now()) return null

  const meeting = await db.query.meetingSessions.findFirst({
    where: (fields, { eq }) => eq(fields.id, localSession.meetingSessionId),
  })
  if (!meeting || meeting.orgId !== localSession.orgId) return null

  return { localSession, meeting }
}

export async function updateLocalSessionState(
  database: Database,
  input: {
    orgId: string
    meetingSessionId: string
    actorUserId?: string | null
    captureState?: LocalCaptureState
    transcriptionState?: LocalTranscriptionState
    failureReason?: string | null
  }
) {
  const localSession = await database.query.localMeetingSessions.findFirst({
    where: (fields, { and, eq }) =>
      and(
        eq(fields.meetingSessionId, input.meetingSessionId),
        eq(fields.orgId, input.orgId)
      ),
  })

  if (!localSession) {
    throw new TRPCError({
      code: 'NOT_FOUND',
      message: 'Local session not found.',
    })
  }

  const now = new Date()
  await database
    .update(localMeetingSessions)
    .set({
      captureState: input.captureState ?? localSession.captureState,
      transcriptionState:
        input.transcriptionState ?? localSession.transcriptionState,
      failureReason:
        input.failureReason === undefined
          ? localSession.failureReason
          : input.failureReason,
      pausedAt: input.captureState === 'paused' ? now : localSession.pausedAt,
      resumedAt:
        input.captureState === 'capturing' ? now : localSession.resumedAt,
      endedAt: input.captureState === 'ended' ? now : localSession.endedAt,
      ingestTokenRevokedAt:
        input.captureState === 'ended' || input.captureState === 'failed'
          ? now
          : localSession.ingestTokenRevokedAt,
      updatedAt: now,
    })
    .where(eq(localMeetingSessions.id, localSession.id))

  if (input.captureState === 'paused') {
    await appendLocalLifecycleEvent(input.meetingSessionId, 'meeting.paused')
  } else if (input.captureState === 'capturing') {
    await appendLocalLifecycleEvent(input.meetingSessionId, 'meeting.resumed')
  } else if (input.captureState === 'ended') {
    await appendLocalLifecycleEvent(input.meetingSessionId, 'meeting.ended')
    await database
      .update(meetingSessions)
      .set({ status: 'ended', endedAt: now, updatedAt: now })
      .where(eq(meetingSessions.id, input.meetingSessionId))

    void retryPostMeetingArtifacts(input.meetingSessionId, input.orgId).catch(
      (error) => {
        console.warn('[local-meetings] post-meeting artifacts failed', {
          meetingSessionId: input.meetingSessionId,
          error: error instanceof Error ? error.message : String(error),
        })
      }
    )
  }

  await appendMeetingAuditEvent(database, {
    meetingSessionId: input.meetingSessionId,
    eventType:
      input.captureState === 'paused'
        ? 'meeting.paused'
        : input.captureState === 'capturing'
          ? 'meeting.resumed'
          : input.captureState === 'ended'
            ? 'meeting.ended'
            : 'meeting.local_state.updated',
    payload: {
      actorUserId: input.actorUserId ?? null,
      captureState: input.captureState ?? localSession.captureState,
      transcriptionState:
        input.transcriptionState ?? localSession.transcriptionState,
      failureReason: input.failureReason ?? null,
    },
  })

  return database.query.localMeetingSessions.findFirst({
    where: (fields, { eq }) => eq(fields.id, localSession.id),
  })
}

async function appendLocalLifecycleEvent(
  meetingSessionId: string,
  action: 'meeting.paused' | 'meeting.resumed' | 'meeting.ended'
) {
  const state = action === 'meeting.ended' ? 'stopped' : 'listening'
  await appendNormalizedMeetingEvent(
    meetingSessionId,
    {
      kind: 'lifecycle',
      provider: 'local',
      action,
      state,
      occurredAt: new Date(),
      session: { internalMeetingSessionId: meetingSessionId },
      metadata: { localLifecycleAction: action },
    } satisfies MeetingProviderEvent,
    'kodi_ui',
    `local:${action}:${Date.now()}`
  )
}
