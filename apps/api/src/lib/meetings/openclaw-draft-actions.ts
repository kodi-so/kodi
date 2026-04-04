import { and, asc, desc, eq } from 'drizzle-orm'
import {
  db,
  transcriptSegments,
  type MeetingParticipant,
  type MeetingSession,
  type TranscriptSegment,
  type ToolkitConnection,
} from '@kodi/db'
import { z } from 'zod'
import { openClawChatCompletion } from '../openclaw/client'
import { saveMeetingStateSnapshotPatch } from './state-snapshots'

const draftActionsSchema = z.object({
  draftActions: z.array(
    z.object({
      title: z.string(),
      toolkitSlug: z.string(),
      actionType: z.string(),
      targetSummary: z.string().nullish(),
      rationale: z.string().nullish(),
      confidence: z.number().min(0).max(1),
      sourceEvidence: z.array(z.string()).default([]),
    })
  ),
})

type ProcessDraftActionsInput = {
  orgId: string
  meetingSession: MeetingSession
  lastEventSequence: number
}

type DraftActionRecord = {
  title: string
  toolkitSlug: string
  toolkitName: string
  actionType: string
  targetSummary: string | null
  rationale: string | null
  confidence: number
  sourceEvidence: string[]
  reviewState: 'draft'
  approvalRequired: true
}

type ProcessMeetingDraftActionsResult =
  | {
      ok: true
      skipped: 'no-transcript' | 'no-toolkits'
    }
  | {
      ok: true
      draftActions: DraftActionRecord[]
    }
  | {
      ok: false
      reason:
        | 'missing-instance'
        | 'instance-not-running'
        | 'missing-instance-url'
        | 'request-failed'
        | 'empty-response'
        | 'invalid-response'
      error?: string
      raw?: string
    }

type AvailableToolkit = {
  toolkitSlug: string
  toolkitName: string
  examples: string[]
}

function formatDate(value: Date | null | undefined) {
  return value ? value.toISOString() : null
}

function humanizeToolkitSlug(toolkitSlug: string) {
  return toolkitSlug
    .split(/[-_]/g)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ')
}

function buildToolkitExamples(toolkitSlug: string) {
  const normalized = toolkitSlug.toLowerCase()

  if (normalized.includes('linear')) {
    return [
      'Draft a Linear issue from a concrete follow-up task.',
      'Draft a project update issue summarizing a decision or blocker.',
    ]
  }

  if (normalized.includes('slack')) {
    return [
      'Draft a Slack recap for the team channel.',
      'Draft a Slack follow-up message listing next steps and owners.',
    ]
  }

  if (normalized.includes('notion')) {
    return [
      'Draft a Notion meeting notes update.',
      'Draft a Notion page section for decisions and action items.',
    ]
  }

  if (normalized.includes('github')) {
    return [
      'Draft a GitHub issue for an engineering follow-up.',
      'Draft a GitHub task capturing a bug or implementation item.',
    ]
  }

  if (normalized.includes('jira')) {
    return [
      'Draft a Jira ticket for a concrete action item.',
      'Draft a Jira issue summarizing a blocker or agreed follow-up.',
    ]
  }

  if (normalized.includes('zoom')) {
    return [
      'Draft a meeting recap message for Zoom Team Chat.',
    ]
  }

  return ['Draft a follow-up action for this connected tool.']
}

function serializeParticipants(participants: MeetingParticipant[]) {
  return participants.map((participant) => ({
    displayName: participant.displayName,
    email: participant.email,
    isHost: participant.isHost,
  }))
}

function serializeTranscriptWindow(segments: TranscriptSegment[]) {
  return segments.map((segment) => ({
    speakerName: segment.speakerName,
    content: segment.content,
    createdAt: formatDate(segment.createdAt),
  }))
}

function serializeToolkits(toolkits: AvailableToolkit[]) {
  return toolkits.map((toolkit) => ({
    toolkitSlug: toolkit.toolkitSlug,
    toolkitName: toolkit.toolkitName,
    examples: toolkit.examples,
  }))
}

function buildDraftActionMessages(input: {
  meetingSession: MeetingSession
  participants: MeetingParticipant[]
  transcriptWindow: TranscriptSegment[]
  rollingSummary: string | null
  rollingNotes: string | null
  candidateTasks: Record<string, unknown>[]
  availableToolkits: AvailableToolkit[]
}) {
  return [
    {
      role: 'system' as const,
      content:
        'You are Kodi meeting intelligence running inside OpenClaw. Read the meeting context, transcript window, existing candidate tasks, and available connected toolkits. Propose reviewable draft actions only. Do not assume execution. Reply with JSON only and no prose using this shape: {"draftActions":[{"title":"short action title","toolkitSlug":"linear","actionType":"create_issue|post_recap|update_doc|create_task","targetSummary":"where this would go","rationale":"why this draft is useful now","confidence":0.0,"sourceEvidence":["quote or short evidence"]}]}. Only propose drafts that are grounded in the transcript and fit one of the available toolkits. Keep titles concise and actionable.',
    },
    {
      role: 'user' as const,
      content: JSON.stringify({
        protocolVersion: 'kodi.meeting.draft-actions.v1',
        meeting: {
          meetingSessionId: input.meetingSession.id,
          provider: input.meetingSession.provider,
          title: input.meetingSession.title,
          status: input.meetingSession.status,
        },
        participants: serializeParticipants(input.participants),
        rollingSummary: input.rollingSummary,
        rollingNotes: input.rollingNotes,
        candidateTasks: input.candidateTasks,
        availableToolkits: serializeToolkits(input.availableToolkits),
        transcriptWindow: serializeTranscriptWindow(input.transcriptWindow),
      }),
    },
  ]
}

function parseDraftActions(content: string) {
  const normalized = content
    .trim()
    .replace(/^```json\s*/i, '')
    .replace(/^```\s*/i, '')
    .replace(/\s*```$/i, '')

  try {
    return draftActionsSchema.parse(JSON.parse(normalized))
  } catch {
    return null
  }
}

async function listAvailableDraftToolkits(orgId: string) {
  const [connections, policies] = await Promise.all([
    db.query.toolkitConnections.findMany({
      where: (fields, { and, eq }) =>
        and(
          eq(fields.orgId, orgId),
          eq(fields.connectedAccountStatus, 'ACTIVE')
        ),
      orderBy: (fields, { desc }) => desc(fields.updatedAt),
    }),
    db.query.toolkitPolicies.findMany({
      where: (fields, { and, eq }) =>
        and(eq(fields.orgId, orgId), eq(fields.enabled, true)),
      orderBy: (fields, { desc }) => desc(fields.updatedAt),
    }),
  ])

  const policyByToolkit = new Map(
    policies.map((policy) => [policy.toolkitSlug, policy])
  )
  const primaryByToolkit = new Map<string, ToolkitConnection>()

  for (const connection of connections) {
    const policy = policyByToolkit.get(connection.toolkitSlug)
    if (policy && policy.draftsEnabled === false) continue
    if (!primaryByToolkit.has(connection.toolkitSlug)) {
      primaryByToolkit.set(connection.toolkitSlug, connection)
    }
  }

  return [...primaryByToolkit.values()].map((connection) => ({
    toolkitSlug: connection.toolkitSlug,
    toolkitName:
      connection.toolkitName ??
      connection.connectedAccountLabel ??
      humanizeToolkitSlug(connection.toolkitSlug),
    examples: buildToolkitExamples(connection.toolkitSlug),
  }))
}

export async function processMeetingDraftActions(
  input: ProcessDraftActionsInput
): Promise<ProcessMeetingDraftActionsResult> {
  const [latestSnapshot, participants, transcriptWindow, availableToolkits] =
    await Promise.all([
      db.query.meetingStateSnapshots.findFirst({
        where: (fields, { eq }) =>
          eq(fields.meetingSessionId, input.meetingSession.id),
        orderBy: (fields, { desc }) => desc(fields.createdAt),
      }),
      db.query.meetingParticipants.findMany({
        where: (fields, { eq }) =>
          eq(fields.meetingSessionId, input.meetingSession.id),
        orderBy: (fields, { asc }) => asc(fields.createdAt),
      }),
      db.query.transcriptSegments.findMany({
        where: (fields, { and, eq }) =>
          and(
            eq(fields.meetingSessionId, input.meetingSession.id),
            eq(fields.isPartial, false)
          ),
        orderBy: (fields, { desc }) => desc(fields.createdAt),
        limit: 40,
      }),
      listAvailableDraftToolkits(input.orgId),
    ])

  if (transcriptWindow.length === 0) {
    return { ok: true as const, skipped: 'no-transcript' as const }
  }

  if (availableToolkits.length === 0) {
    return { ok: true as const, skipped: 'no-toolkits' as const }
  }

  const response = await openClawChatCompletion({
    orgId: input.orgId,
    messages: buildDraftActionMessages({
      meetingSession: input.meetingSession,
      participants,
      transcriptWindow: [...transcriptWindow].reverse(),
      rollingSummary: latestSnapshot?.summary ?? null,
      rollingNotes: latestSnapshot?.rollingNotes ?? null,
      candidateTasks: Array.isArray(latestSnapshot?.candidateTasks)
        ? latestSnapshot.candidateTasks
        : [],
      availableToolkits,
    }),
    timeoutMs: 15_000,
  })

  if (!response.ok) {
    return response
  }

  const parsed = parseDraftActions(response.content)
  if (!parsed) {
    return {
      ok: false as const,
      reason: 'invalid-response' as const,
      error: 'OpenClaw draft action response was not valid JSON.',
      raw: response.content,
    }
  }

  const draftActions = parsed.draftActions.map((draft) => ({
    title: draft.title,
    toolkitSlug: draft.toolkitSlug,
    toolkitName:
      availableToolkits.find((toolkit) => toolkit.toolkitSlug === draft.toolkitSlug)
        ?.toolkitName ?? humanizeToolkitSlug(draft.toolkitSlug),
    actionType: draft.actionType,
    targetSummary: draft.targetSummary ?? null,
    rationale: draft.rationale ?? null,
    confidence: draft.confidence,
    sourceEvidence: draft.sourceEvidence,
    reviewState: 'draft' as const,
    approvalRequired: true as const,
  }))

  await saveMeetingStateSnapshotPatch({
    meetingSessionId: input.meetingSession.id,
    lastEventSequence: input.lastEventSequence,
    patch: {
      draftActions,
      lastClassifiedAt: new Date(),
    },
  })

  return {
    ok: true as const,
    draftActions,
  }
}
