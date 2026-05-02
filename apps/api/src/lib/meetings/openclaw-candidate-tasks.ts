import type { MeetingSession } from '@kodi/db'
import { z } from 'zod'
import { openClawChatCompletion } from '../openclaw/client'
import {
  buildMeetingPromptContext,
  loadMeetingAnalysisContext,
} from './meeting-analysis-context'
import { saveMeetingStateSnapshotPatch } from './state-snapshots'

const candidateTasksSchema = z.object({
  candidateTasks: z.array(
    z.object({
      title: z.string(),
      ownerHint: z.string().nullish(),
      confidence: z.number().min(0).max(1),
      sourceEvidence: z.array(z.string()).default([]),
    })
  ),
})

type ProcessCandidateTasksInput = {
  orgId: string
  meetingSession: MeetingSession
  lastEventSequence: number
}

function buildCandidateTaskMessages(input: {
  meetingSession: MeetingSession
  analysis: Awaited<ReturnType<typeof loadMeetingAnalysisContext>>
}) {
  return [
    {
      role: 'system' as const,
      content:
        'You are Kodi meeting intelligence running inside OpenClaw. Read the compressed meeting state and transcript turns, then identify likely follow-up tasks that were discussed or clearly implied. Reply with JSON only and no prose using this shape: {"candidateTasks":[{"title":"task title","ownerHint":"person or team","confidence":0.0,"sourceEvidence":["quote or short evidence"]}]}. Only include tasks with concrete evidence. Keep titles short and actionable.',
    },
    {
      role: 'user' as const,
      content: JSON.stringify(
        buildMeetingPromptContext({
          meetingSession: input.meetingSession,
          analysis: input.analysis,
          protocolVersion: 'kodi.meeting.tasks.v2',
        })
      ),
    },
  ]
}

function parseCandidateTasks(content: string) {
  const normalized = content
    .trim()
    .replace(/^```json\s*/i, '')
    .replace(/^```\s*/i, '')
    .replace(/\s*```$/i, '')

  try {
    return candidateTasksSchema.parse(JSON.parse(normalized))
  } catch {
    return null
  }
}

export async function processMeetingCandidateTasks(
  input: ProcessCandidateTasksInput
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
    sessionKey: `meeting:${input.meetingSession.id}:candidate-tasks`,
    messageChannel: 'meeting',
    messages: buildCandidateTaskMessages({
      meetingSession: input.meetingSession,
      analysis,
    }),
    timeoutMs: 15_000,
  })

  if (!response.ok) {
    return response
  }

  const parsed = parseCandidateTasks(response.content)
  if (!parsed) {
    return {
      ok: false as const,
      reason: 'invalid-response' as const,
      error: 'OpenClaw candidate task response was not valid JSON.',
      raw: response.content,
    }
  }

  await saveMeetingStateSnapshotPatch({
    meetingSessionId: input.meetingSession.id,
    lastEventSequence: input.lastEventSequence,
    patch: {
      candidateTasks: parsed.candidateTasks,
      lastClassifiedAt: new Date(),
    },
  })

  return {
    ok: true as const,
    candidateTasks: parsed.candidateTasks,
  }
}
