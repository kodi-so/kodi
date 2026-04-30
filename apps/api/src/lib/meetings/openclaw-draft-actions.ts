import {
  and,
  db,
  desc,
  type MeetingSession,
  type ToolkitConnection,
} from '@kodi/db'
import { z } from 'zod'
import { openClawChatCompletion } from '../openclaw/client'
import {
  buildMeetingPromptContext,
  loadMeetingAnalysisContext,
} from './meeting-analysis-context'
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

function serializeToolkits(toolkits: AvailableToolkit[]) {
  return toolkits.map((toolkit) => ({
    toolkitSlug: toolkit.toolkitSlug,
    toolkitName: toolkit.toolkitName,
    examples: toolkit.examples,
  }))
}

function buildDraftActionMessages(input: {
  meetingSession: MeetingSession
  analysis: Awaited<ReturnType<typeof loadMeetingAnalysisContext>>
  availableToolkits: AvailableToolkit[]
}) {
  return [
    {
      role: 'system' as const,
      content:
        'You are Kodi meeting intelligence running inside OpenClaw. Read the meeting context, prior state, transcript turns, and available connected toolkits. Propose reviewable draft actions only. Do not assume execution. Reply with JSON only and no prose using this shape: {"draftActions":[{"title":"short action title","toolkitSlug":"linear","actionType":"create_issue|post_recap|update_doc|create_task","targetSummary":"where this would go","rationale":"why this draft is useful now","confidence":0.0,"sourceEvidence":["quote or short evidence"]}]}. Only propose drafts that are grounded in the transcript and fit one of the available toolkits. Keep titles concise and actionable.',
    },
    {
      role: 'user' as const,
      content: JSON.stringify({
        ...buildMeetingPromptContext({
          meetingSession: input.meetingSession,
          analysis: input.analysis,
          protocolVersion: 'kodi.meeting.draft-actions.v2',
        }),
        availableToolkits: serializeToolkits(input.availableToolkits),
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
  const [analysis, availableToolkits] =
    await Promise.all([
      loadMeetingAnalysisContext({
        meetingSessionId: input.meetingSession.id,
        transcriptLimit: 60,
      }),
      listAvailableDraftToolkits(input.orgId),
    ])

  if (analysis.transcriptTurns.length === 0) {
    return { ok: true as const, skipped: 'no-transcript' as const }
  }

  if (availableToolkits.length === 0) {
    return { ok: true as const, skipped: 'no-toolkits' as const }
  }

  const response = await openClawChatCompletion({
    orgId: input.orgId,
    visibility: 'shared',
    sessionKey: `meeting:${input.meetingSession.id}:draft-actions`,
    messageChannel: 'meeting',
    messages: buildDraftActionMessages({
      meetingSession: input.meetingSession,
      analysis,
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
