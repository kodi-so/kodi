import {
  db,
  deriveMeetingBotIdentity,
  desc,
  eq,
  meetingCopilotSettings,
  meetingEvents,
  meetingSessionControls,
  resolveMeetingCopilotSettings,
  type MeetingCopilotSettings,
  type MeetingParticipationMode,
} from '@kodi/db'
import { getRecallSetupStatus } from '../providers/recall/config'

type Database = typeof db

type OrgIdentity = {
  id: string
  name: string
  slug: string
}

function normalizeBotDisplayName(value: string | null | undefined) {
  const trimmed = value?.trim()
  return trimmed ? trimmed : null
}

export function buildMeetingPilotSetupContract() {
  const recall = getRecallSetupStatus()

  return {
    recall,
    checks: [
      {
        key: 'feature-flags',
        label: 'Meeting intelligence enabled',
        state: recall.enabled ? ('ready' as const) : ('missing' as const),
        detail:
          'KODI_FEATURE_MEETING_INTELLIGENCE should be enabled in the target environment.',
      },
      {
        key: 'recall-config',
        label: 'Recall transport configured',
        state: recall.configured ? ('ready' as const) : ('missing' as const),
        detail:
          'Recall credentials and webhook configuration are required for the production transport path.',
      },
      {
        key: 'manual-consent',
        label: 'Waiting room, host consent, and bot admission validated',
        state: 'manual' as const,
        detail:
          'Run a real Zoom or Meet validation call to confirm waiting-room admission, consent prompts, and live bot behavior.',
      },
    ],
  }
}

export async function getWorkspaceMeetingCopilotConfig(
  database: Database,
  org: OrgIdentity
) {
  const persisted = await database.query.meetingCopilotSettings.findFirst({
    where: (fields, { eq }) => eq(fields.orgId, org.id),
  })

  const settings = resolveMeetingCopilotSettings({
    botDisplayName: normalizeBotDisplayName(persisted?.botDisplayName),
    defaultParticipationMode: persisted?.defaultParticipationMode,
    chatResponsesRequireExplicitAsk:
      persisted?.chatResponsesRequireExplicitAsk,
    voiceResponsesRequireExplicitPrompt:
      persisted?.voiceResponsesRequireExplicitPrompt,
    allowMeetingHostControls: persisted?.allowMeetingHostControls,
    consentNoticeEnabled: persisted?.consentNoticeEnabled,
    transcriptRetentionDays: persisted?.transcriptRetentionDays,
    artifactRetentionDays: persisted?.artifactRetentionDays,
  })

  return {
    persisted,
    settings,
    identity: deriveMeetingBotIdentity({
      orgName: org.name,
      orgSlug: org.slug,
      displayNameOverride: settings.botDisplayName,
    }),
    setup: buildMeetingPilotSetupContract(),
  }
}

export async function ensureMeetingSessionControls(
  database: Database,
  input: {
    meetingSessionId: string
    orgId: string
    settings: MeetingCopilotSettings
    actorUserId?: string | null
  }
) {
  const existing = await database.query.meetingSessionControls.findFirst({
    where: (fields, { and, eq }) =>
      and(
        eq(fields.meetingSessionId, input.meetingSessionId),
        eq(fields.orgId, input.orgId)
      ),
  })

  if (existing) {
    return existing
  }

  const [created] = await database
    .insert(meetingSessionControls)
    .values({
      orgId: input.orgId,
      meetingSessionId: input.meetingSessionId,
      participationMode: input.settings.defaultParticipationMode,
      allowHostControls: input.settings.allowMeetingHostControls,
      updatedBy: input.actorUserId ?? null,
    })
    .returning()

  if (!created) {
    throw new Error('Failed to create meeting session controls')
  }

  return created
}

export async function resolveMeetingSessionControls(
  database: Database,
  input: {
    meetingSessionId: string
    orgId: string
    settings: MeetingCopilotSettings
  }
) {
  const persisted = await database.query.meetingSessionControls.findFirst({
    where: (fields, { and, eq }) =>
      and(
        eq(fields.meetingSessionId, input.meetingSessionId),
        eq(fields.orgId, input.orgId)
      ),
  })

  return {
    id: persisted?.id ?? null,
    meetingSessionId: input.meetingSessionId,
    orgId: input.orgId,
    participationMode:
      (persisted?.participationMode as MeetingParticipationMode | undefined) ??
      input.settings.defaultParticipationMode,
    allowHostControls:
      persisted?.allowHostControls ?? input.settings.allowMeetingHostControls,
    liveResponsesDisabled: persisted?.liveResponsesDisabled ?? false,
    liveResponsesDisabledReason: persisted?.liveResponsesDisabledReason ?? null,
    updatedBy: persisted?.updatedBy ?? null,
    createdAt: persisted?.createdAt ?? null,
    updatedAt: persisted?.updatedAt ?? null,
  }
}

export async function appendMeetingAuditEvent(
  database: Database,
  input: {
    meetingSessionId: string
    eventType: string
    payload?: Record<string, unknown> | null
  }
) {
  const latest = await database.query.meetingEvents.findFirst({
    where: (fields, { eq }) => eq(fields.meetingSessionId, input.meetingSessionId),
    orderBy: (fields, { desc }) => desc(fields.sequence),
    columns: {
      sequence: true,
    },
  })

  const nextSequence = (latest?.sequence ?? 0) + 1

  await database.insert(meetingEvents).values({
    meetingSessionId: input.meetingSessionId,
    sequence: nextSequence,
    eventType: input.eventType,
    source: 'kodi_ui',
    payload: input.payload ?? null,
  })
}
