import {
  db,
  eq,
  meetingArtifacts,
  meetingSessions,
  workItems,
} from '@kodi/db'
import type { MeetingSession } from '@kodi/db'
import { z } from 'zod'
import { openClawChatCompletion } from '../openclaw/client'
import {
  buildMeetingPromptContext,
  loadMeetingAnalysisContext,
} from './meeting-analysis-context'
import { emitTaskActivity, ensureTaskBoardFoundation } from '../../services/tasks'

// ---------------------------------------------------------------------------
// Schemas
// ---------------------------------------------------------------------------

const finalSummarySchema = z.object({
  finalSummary: z.string(),
  keyOutcomes: z.array(z.string()).default([]),
})

const decisionLogSchema = z.object({
  decisions: z
    .array(
      z.object({
        summary: z.string(),
        context: z.string().nullish(),
        madeBy: z.string().nullish(),
        confidence: z.number().min(0).max(1).nullish(),
        sourceEvidence: z.array(z.string()).default([]),
      })
    )
    .default([]),
})

const actionItemsSchema = z.object({
  actionItems: z
    .array(
      z.object({
        title: z.string(),
        description: z.string().nullish(),
        ownerHint: z.string().nullish(),
        dueDateHint: z.string().nullish(),
        dueDateConfidence: z.number().min(0).max(1).nullish(),
        kind: z.enum(['task', 'ticket', 'follow_up']).default('task'),
        confidence: z.number().min(0).max(1).nullish(),
        sourceEvidence: z.array(z.string()).default([]),
      })
    )
    .default([]),
})

type FinalSummary = z.infer<typeof finalSummarySchema>
type DecisionLog = z.infer<typeof decisionLogSchema>
type ActionItems = z.infer<typeof actionItemsSchema>

// ---------------------------------------------------------------------------
// JSON fence stripper (shared parse helper)
// ---------------------------------------------------------------------------

function stripJsonFence(content: string) {
  return content
    .trim()
    .replace(/^```json\s*/i, '')
    .replace(/^```\s*/i, '')
    .replace(/\s*```$/i, '')
}

// ---------------------------------------------------------------------------
// Summary generation
// ---------------------------------------------------------------------------

function buildFinalSummaryMessages(input: {
  meetingSession: MeetingSession
  analysis: Awaited<ReturnType<typeof loadMeetingAnalysisContext>>
}) {
  return [
    {
      role: 'system' as const,
      content:
        'You are Kodi meeting intelligence running inside OpenClaw. The meeting has ended. Read the full meeting context and transcript, then produce a comprehensive final summary. Reply with JSON only and no prose using this shape: {"finalSummary":"3-5 sentence summary covering purpose, key discussion, and outcomes","keyOutcomes":["outcome one","outcome two"]}. The summary must be grounded in the transcript, not generic. Do not invent facts.',
    },
    {
      role: 'user' as const,
      content: JSON.stringify(
        buildMeetingPromptContext({
          meetingSession: input.meetingSession,
          analysis: input.analysis,
          protocolVersion: 'kodi.meeting.final-summary.v1',
        })
      ),
    },
  ]
}

async function generateFinalSummary(input: {
  orgId: string
  meetingSession: MeetingSession
  analysis: Awaited<ReturnType<typeof loadMeetingAnalysisContext>>
}): Promise<
  | { ok: true; data: FinalSummary }
  | { ok: false; reason: string; error?: string }
> {
  const response = await openClawChatCompletion({
    orgId: input.orgId,
    visibility: 'shared',
    sessionKey: `meeting:${input.meetingSession.id}:final-summary`,
    messageChannel: 'meeting',
    messages: buildFinalSummaryMessages(input),
    timeoutMs: 25_000,
  })

  if (!response.ok) {
    return response
  }

  try {
    const parsed = finalSummarySchema.parse(
      JSON.parse(stripJsonFence(response.content))
    )
    return { ok: true, data: parsed }
  } catch {
    return {
      ok: false,
      reason: 'invalid-response',
      error: 'Final summary response was not valid JSON.',
    }
  }
}

// ---------------------------------------------------------------------------
// Decision log generation
// ---------------------------------------------------------------------------

function buildDecisionLogMessages(input: {
  meetingSession: MeetingSession
  analysis: Awaited<ReturnType<typeof loadMeetingAnalysisContext>>
}) {
  return [
    {
      role: 'system' as const,
      content:
        'You are Kodi meeting intelligence running inside OpenClaw. The meeting has ended. Read the full meeting context and extract all decisions that were made during the meeting. Reply with JSON only and no prose using this shape: {"decisions":[{"summary":"what was decided","context":"brief rationale or context","madeBy":"person or team name, or null","confidence":0.9,"sourceEvidence":["direct quote or paraphrase"]}]}. Only include decisions that are clearly supported by the transcript or prior meeting state. Keep summaries concise and factual. If no decisions were made, return an empty array.',
    },
    {
      role: 'user' as const,
      content: JSON.stringify(
        buildMeetingPromptContext({
          meetingSession: input.meetingSession,
          analysis: input.analysis,
          protocolVersion: 'kodi.meeting.decision-log.v1',
        })
      ),
    },
  ]
}

async function generateDecisionLog(input: {
  orgId: string
  meetingSession: MeetingSession
  analysis: Awaited<ReturnType<typeof loadMeetingAnalysisContext>>
}): Promise<
  | { ok: true; data: DecisionLog }
  | { ok: false; reason: string; error?: string }
> {
  const response = await openClawChatCompletion({
    orgId: input.orgId,
    visibility: 'shared',
    sessionKey: `meeting:${input.meetingSession.id}:decision-log`,
    messageChannel: 'meeting',
    messages: buildDecisionLogMessages(input),
    timeoutMs: 25_000,
  })

  if (!response.ok) {
    return response
  }

  try {
    const parsed = decisionLogSchema.parse(
      JSON.parse(stripJsonFence(response.content))
    )
    return { ok: true, data: parsed }
  } catch {
    return {
      ok: false,
      reason: 'invalid-response',
      error: 'Decision log response was not valid JSON.',
    }
  }
}

// ---------------------------------------------------------------------------
// Action items generation
// ---------------------------------------------------------------------------

function buildActionItemsMessages(input: {
  meetingSession: MeetingSession
  analysis: Awaited<ReturnType<typeof loadMeetingAnalysisContext>>
}) {
  return [
    {
      role: 'system' as const,
      content:
        'You are Kodi meeting intelligence running inside OpenClaw. The meeting has ended. Read the full meeting context and extract all concrete action items that need to be done after the meeting. Reply with JSON only and no prose using this shape: {"actionItems":[{"title":"short actionable title","description":"optional detail","ownerHint":"person name or null","dueDateHint":"YYYY-MM-DD or null","dueDateConfidence":0.0,"kind":"task|ticket|follow_up","confidence":0.9,"sourceEvidence":["direct quote"]}]}. Only include items with concrete evidence from the transcript. Use kind=ticket for engineering/product work items, kind=task for general follow-ups, kind=follow_up for lightweight reminders. If no action items were identified, return an empty array.',
    },
    {
      role: 'user' as const,
      content: JSON.stringify(
        buildMeetingPromptContext({
          meetingSession: input.meetingSession,
          analysis: input.analysis,
          protocolVersion: 'kodi.meeting.action-items.v1',
        })
      ),
    },
  ]
}

async function generateActionItems(input: {
  orgId: string
  meetingSession: MeetingSession
  analysis: Awaited<ReturnType<typeof loadMeetingAnalysisContext>>
}): Promise<
  | { ok: true; data: ActionItems }
  | { ok: false; reason: string; error?: string }
> {
  const response = await openClawChatCompletion({
    orgId: input.orgId,
    visibility: 'shared',
    sessionKey: `meeting:${input.meetingSession.id}:action-items`,
    messageChannel: 'meeting',
    messages: buildActionItemsMessages(input),
    timeoutMs: 25_000,
  })

  if (!response.ok) {
    return response
  }

  try {
    const parsed = actionItemsSchema.parse(
      JSON.parse(stripJsonFence(response.content))
    )
    return { ok: true, data: parsed }
  } catch {
    return {
      ok: false,
      reason: 'invalid-response',
      error: 'Action items response was not valid JSON.',
    }
  }
}

// ---------------------------------------------------------------------------
// Draft work item creation from action items
// ---------------------------------------------------------------------------

async function createDraftWorkItems(input: {
  orgId: string
  meetingSessionId: string
  artifactId: string
  actionItems: ActionItems['actionItems']
}) {
  if (input.actionItems.length === 0) return

  const { agent, workflowStates } = await ensureTaskBoardFoundation(db, input.orgId)
  const needsReview = workflowStates.find((state) => state.slug === 'needs-review')

  const createdItems = await db.insert(workItems).values(
    input.actionItems.map((item) => ({
      orgId: input.orgId,
      meetingSessionId: input.meetingSessionId,
      sourceArtifactId: input.artifactId,
      kind: item.kind as 'task' | 'ticket' | 'follow_up',
      title: item.title,
      description: item.description ?? null,
      status: 'draft' as const,
      workflowStateId: needsReview?.id ?? null,
      reviewState: 'needs_review' as const,
      executionState: 'idle' as const,
      syncState: 'local' as const,
      assigneeType: 'kodi' as const,
      assigneeAgentId: agent?.id ?? null,
      sourceType: 'meeting' as const,
      sourceId: input.meetingSessionId,
      metadata: {
        ownerHint: item.ownerHint ?? null,
        dueDateHint: item.dueDateHint ?? null,
        dueDateConfidence: item.dueDateConfidence ?? null,
        confidence: item.confidence ?? null,
        sourceEvidence: item.sourceEvidence,
      },
    }))
  ).returning()

  await Promise.all(
    createdItems.map((item) =>
      emitTaskActivity(db, {
        orgId: input.orgId,
        workItemId: item.id,
        eventType: 'created',
        actorType: 'system',
        summary: 'Task extracted from meeting.',
        metadata: {
          meetingSessionId: input.meetingSessionId,
          sourceArtifactId: input.artifactId,
        },
      })
    )
  )
}

// ---------------------------------------------------------------------------
// Status helpers (direct DB writes to bypass transitionMeetingStatus guard,
// which locks completed/ended meetings from further status changes)
// ---------------------------------------------------------------------------

async function setMeetingStatus(
  meetingSessionId: string,
  status: 'summarizing' | 'completed' | 'failed',
  metadataPatch?: Record<string, unknown>
) {
  const existing = await db.query.meetingSessions.findFirst({
    where: (fields, { eq: eqFn }) => eqFn(fields.id, meetingSessionId),
    columns: { id: true, metadata: true },
  })

  if (!existing) return

  const metadata =
    metadataPatch === undefined
      ? existing.metadata
      : { ...(existing.metadata ?? {}), ...metadataPatch }

  await db
    .update(meetingSessions)
    .set({ status: status as never, metadata, updatedAt: new Date() })
    .where(eq(meetingSessions.id as never, meetingSessionId as never) as never)
}

// ---------------------------------------------------------------------------
// Main entry point
// ---------------------------------------------------------------------------

export async function generatePostMeetingArtifacts(
  meetingSessionId: string,
  orgId: string
): Promise<void> {
  const meetingSession = await db.query.meetingSessions.findFirst({
    where: (fields, { eq: eqFn }) => eqFn(fields.id, meetingSessionId),
  })

  if (!meetingSession) {
    console.warn('[post-meeting] meeting session not found', { meetingSessionId })
    return
  }

  // Mark meeting as summarizing so the UI can show progress
  await setMeetingStatus(meetingSessionId, 'summarizing')

  const analysis = await loadMeetingAnalysisContext({
    meetingSessionId,
    transcriptLimit: 200,
  })

  if (analysis.transcriptTurns.length === 0) {
    // No transcript — skip artifact generation but mark as completed
    console.info('[post-meeting] skipping artifact generation — no transcript', {
      meetingSessionId,
    })
    await setMeetingStatus(meetingSessionId, 'completed', {
      postMeetingSkipped: true,
      postMeetingSkippedReason: 'no-transcript',
    })
    return
  }

  // Run all three artifact generation calls in parallel
  const [summaryResult, decisionResult, actionResult] = await Promise.all([
    generateFinalSummary({ orgId, meetingSession, analysis }),
    generateDecisionLog({ orgId, meetingSession, analysis }),
    generateActionItems({ orgId, meetingSession, analysis }),
  ])

  const now = new Date()
  const failedArtifacts: string[] = []

  // Persist summary artifact
  if (summaryResult.ok) {
    await db.insert(meetingArtifacts).values({
      meetingSessionId,
      artifactType: 'summary',
      title: 'Meeting Summary',
      content: summaryResult.data.finalSummary,
      structuredData: {
        finalSummary: summaryResult.data.finalSummary,
        keyOutcomes: summaryResult.data.keyOutcomes,
      },
      status: 'generated',
      createdBy: 'kodi',
    })

    // Also persist the final summary on the session for easy access
    await db
      .update(meetingSessions)
      .set({ finalSummary: summaryResult.data.finalSummary, updatedAt: now })
      .where(eq(meetingSessions.id as never, meetingSessionId as never) as never)
  } else {
    failedArtifacts.push('summary')
    console.warn('[post-meeting] summary generation failed', {
      meetingSessionId,
      reason: summaryResult.reason,
      error: 'error' in summaryResult ? summaryResult.error : undefined,
    })
  }

  // Persist decision log artifact
  if (decisionResult.ok) {
    await db.insert(meetingArtifacts).values({
      meetingSessionId,
      artifactType: 'decision_log',
      title: 'Decision Log',
      content: null,
      structuredData: decisionResult.data.decisions,
      status: 'generated',
      createdBy: 'kodi',
    })
  } else {
    failedArtifacts.push('decision_log')
    console.warn('[post-meeting] decision log generation failed', {
      meetingSessionId,
      reason: decisionResult.reason,
      error: 'error' in decisionResult ? decisionResult.error : undefined,
    })
  }

  // Persist action items artifact + create draft work items
  let actionItemsArtifactId: string | null = null
  if (actionResult.ok) {
    const [inserted] = await db
      .insert(meetingArtifacts)
      .values({
        meetingSessionId,
        artifactType: 'action_items',
        title: 'Action Items',
        content: null,
        structuredData: actionResult.data.actionItems,
        status: 'generated',
        createdBy: 'kodi',
      })
      .returning({ id: meetingArtifacts.id })

    if (inserted) {
      actionItemsArtifactId = inserted.id
      await createDraftWorkItems({
        orgId,
        meetingSessionId,
        artifactId: inserted.id,
        actionItems: actionResult.data.actionItems,
      })
    }
  } else {
    failedArtifacts.push('action_items')
    console.warn('[post-meeting] action items generation failed', {
      meetingSessionId,
      reason: actionResult.reason,
      error: 'error' in actionResult ? actionResult.error : undefined,
    })
  }

  // Mark meeting as completed regardless of partial failures.
  // Failed artifacts surface as missing in the UI; retries come later.
  await setMeetingStatus(meetingSessionId, 'completed', {
    postMeetingGeneratedAt: now.toISOString(),
    postMeetingFailedArtifacts:
      failedArtifacts.length > 0 ? failedArtifacts : null,
    postMeetingActionItemsArtifactId: actionItemsArtifactId,
  })

  console.info('[post-meeting] artifact generation complete', {
    meetingSessionId,
    generated: ['summary', 'decision_log', 'action_items'].filter(
      (t) => !failedArtifacts.includes(t)
    ),
    failed: failedArtifacts,
  })
}

// ---------------------------------------------------------------------------
// Retry entry point — clears existing generated artifacts and re-runs
// ---------------------------------------------------------------------------

export async function retryPostMeetingArtifacts(
  meetingSessionId: string,
  orgId: string
): Promise<void> {
  // Remove previously generated artifacts so we start fresh
  await db
    .delete(meetingArtifacts)
    .where(
      eq(meetingArtifacts.meetingSessionId as never, meetingSessionId as never) as never
    )

  // Remove draft work items created from artifacts (keep manually-created ones)
  const existingWorkItems = await db.query.workItems.findMany({
    where: (fields, { and, eq: eqFn }) =>
      and(
        eqFn(fields.meetingSessionId, meetingSessionId),
        eqFn(fields.status, 'draft')
      ),
    columns: { id: true, sourceArtifactId: true },
  })

  const artifactSourcedIds = existingWorkItems
    .filter((w) => w.sourceArtifactId !== null)
    .map((w) => w.id)

  for (const id of artifactSourcedIds) {
    await db
      .delete(workItems)
      .where(eq(workItems.id as never, id as never) as never)
  }

  await generatePostMeetingArtifacts(meetingSessionId, orgId)
}
