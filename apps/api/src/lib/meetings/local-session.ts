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
import {
  appendMeetingAuditEvent,
  ensureMeetingSessionControls,
} from './copilot-policy'
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
    platform?: string | null
    startedFrom?: 'web_app' | 'desktop_app' | 'desktop_tray' | 'scheduled_event'
    scheduledCalendarEventId?: string | null
    participationMode?: MeetingParticipationMode
    settings: MeetingCopilotSettings
  }
) {
  if (!featureFlags.localMeetings) {
    throw new TRPCError({
      code: 'PRECONDITION_FAILED',
      message: 'Local meetings are not enabled for this environment yet.',
    })
  }

  const ingest = createLocalIngestToken()
  const now = new Date()
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
      hostUserId: input.actorUserId,
      title,
      status: 'listening',
      consentState: 'local_disclosure_acknowledged',
      scheduledStartAt: input.scheduledCalendarEventId ? now : null,
      actualStartAt: now,
      metadata: {
        localMeeting: true,
        localMode: input.mode,
        startedFrom: input.startedFrom ?? 'desktop_app',
        scheduledCalendarEventId: input.scheduledCalendarEventId ?? null,
      },
    })
    .returning()

  if (!meeting) throw new Error('Failed to create local meeting session.')

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
      platform: input.platform ?? null,
      ingestTokenHash: ingest.hash,
      ingestTokenExpiresAt: ingest.expiresAt,
      lastHeartbeatAt: now,
      diagnostics: {
        ingestProtocol: 'desktop-local-json-v1',
        requestedParticipationMode: input.participationMode ?? null,
      },
    })
    .returning()

  if (!localSession) throw new Error('Failed to create local runtime state.')

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
    },
  })

  await ensureMeetingSessionControls(database, {
    meetingSessionId: meeting.id,
    orgId: input.orgId,
    settings: input.settings,
    actorUserId: input.actorUserId,
  })

  await appendMeetingAuditEvent(database, {
    meetingSessionId: meeting.id,
    eventType: 'meeting.started',
    payload: {
      provider: 'local',
      mode: input.mode,
      actorUserId: input.actorUserId,
      startedFrom: input.startedFrom ?? 'desktop_app',
    },
  })

  return {
    meetingSession: meeting,
    localSession,
    ingestToken: ingest.token,
    ingestTokenExpiresAt: ingest.expiresAt,
  }
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
  const [updated] = await database
    .update(localMeetingSessions)
    .set({
      captureState: input.captureState ?? localSession.captureState,
      transcriptionState:
        input.transcriptionState ?? localSession.transcriptionState,
      failureReason: input.failureReason ?? localSession.failureReason,
      pausedAt: input.captureState === 'paused' ? now : localSession.pausedAt,
      resumedAt:
        input.captureState === 'capturing' ? now : localSession.resumedAt,
      endedAt: input.captureState === 'ended' ? now : localSession.endedAt,
      ingestTokenRevokedAt:
        input.captureState === 'ended'
          ? now
          : localSession.ingestTokenRevokedAt,
      updatedAt: now,
    })
    .where(eq(localMeetingSessions.id, localSession.id))
    .returning()

  if (input.captureState === 'ended') {
    await database
      .update(meetingSessions)
      .set({ status: 'ended', endedAt: now, updatedAt: now })
      .where(eq(meetingSessions.id, input.meetingSessionId))
  }

  return updated ?? localSession
}

export async function getLocalMeetingForToken(token: string) {
  const localSession = await db.query.localMeetingSessions.findFirst({
    where: (fields, { eq }) =>
      eq(fields.ingestTokenHash, hashLocalIngestToken(token)),
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
