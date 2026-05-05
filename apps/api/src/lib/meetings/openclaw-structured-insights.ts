import type { MeetingSession } from '@kodi/db'
import { z } from 'zod'
import { openClawChatCompletion } from '../openclaw/client'
import {
  buildMeetingPromptContext,
  loadMeetingAnalysisContext,
} from './meeting-analysis-context'
import { saveMeetingStateSnapshotPatch } from './state-snapshots'

const structuredInsightsSchema = z.object({
  decisions: z
    .array(
      z.object({
        summary: z.string(),
        confidence: z.number().min(0).max(1).nullish(),
        sourceEvidence: z.array(z.string()).default([]),
      })
    )
    .default([]),
  openQuestions: z
    .array(
      z.object({
        summary: z.string(),
        ownerHint: z.string().nullish(),
        sourceEvidence: z.array(z.string()).default([]),
      })
    )
    .default([]),
  risks: z
    .array(
      z.object({
        summary: z.string(),
        severity: z.enum(['low', 'medium', 'high']).nullish(),
        kind: z.enum(['risk', 'blocker']).nullish(),
        sourceEvidence: z.array(z.string()).default([]),
      })
    )
    .default([]),
  candidateActionItems: z
    .array(
      z.object({
        title: z.string(),
        ownerHint: z.string().nullish(),
        confidence: z.number().min(0).max(1).nullish(),
        sourceEvidence: z.array(z.string()).default([]),
      })
    )
    .default([]),
})

type ProcessMeetingStructuredInsightsInput = {
  orgId: string
  meetingSession: MeetingSession
  lastEventSequence: number
}

function buildStructuredInsightMessages(input: {
  meetingSession: MeetingSession
  analysis: Awaited<ReturnType<typeof loadMeetingAnalysisContext>>
}) {
  return [
    {
      role: 'system' as const,
      content:
        'You are Kodi meeting intelligence running inside OpenClaw. Read the compressed meeting context and transcript turns, then extract grounded structured insights. Reply with JSON only and no prose using this shape: {"decisions":[{"summary":"decision","confidence":0.0,"sourceEvidence":["quote"]}],"openQuestions":[{"summary":"question","ownerHint":"person or team","sourceEvidence":["quote"]}],"risks":[{"summary":"risk or blocker","severity":"low|medium|high","kind":"risk|blocker","sourceEvidence":["quote"]}],"candidateActionItems":[{"title":"action item","ownerHint":"person or team","confidence":0.0,"sourceEvidence":["quote"]}]}. Only include items supported by the transcript or prior meeting state. Keep each summary concise and factual.',
    },
    {
      role: 'user' as const,
      content: JSON.stringify(
        buildMeetingPromptContext({
          meetingSession: input.meetingSession,
          analysis: input.analysis,
          protocolVersion: 'kodi.meeting.structured-insights.v1',
        })
      ),
    },
  ]
}

function parseStructuredInsights(content: string) {
  const normalized = content
    .trim()
    .replace(/^```json\s*/i, '')
    .replace(/^```\s*/i, '')
    .replace(/\s*```$/i, '')

  try {
    return structuredInsightsSchema.parse(JSON.parse(normalized))
  } catch {
    return null
  }
}

export async function processMeetingStructuredInsights(
  input: ProcessMeetingStructuredInsightsInput
) {
  const analysis = await loadMeetingAnalysisContext({
    meetingSessionId: input.meetingSession.id,
    transcriptLimit: 60,
  })

  if (analysis.transcriptTurns.length === 0) {
    return { ok: true as const, skipped: 'no-transcript' as const }
  }

  const response = await openClawChatCompletion({
    orgId: input.orgId,
    visibility: 'shared',
    sessionKey: `meeting:${input.meetingSession.id}:structured-insights`,
    messageChannel: 'meeting',
    messages: buildStructuredInsightMessages({
      meetingSession: input.meetingSession,
      analysis,
    }),
    timeoutMs: 15_000,
  })

  if (!response.ok) {
    return response
  }

  const parsed = parseStructuredInsights(response.content)
  if (!parsed) {
    return {
      ok: false as const,
      reason: 'invalid-response' as const,
      error: 'OpenClaw structured insights response was not valid JSON.',
      raw: response.content,
    }
  }

  await saveMeetingStateSnapshotPatch({
    meetingSessionId: input.meetingSession.id,
    lastEventSequence: input.lastEventSequence,
    patch: {
      decisions: parsed.decisions,
      openQuestions: parsed.openQuestions,
      risks: parsed.risks,
      candidateActionItems: parsed.candidateActionItems,
      lastClassifiedAt: new Date(),
    },
  })

  return {
    ok: true as const,
    structuredInsights: parsed,
  }
}
