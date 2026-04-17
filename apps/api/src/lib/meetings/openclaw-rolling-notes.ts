import {
  db,
  eq,
  meetingSessions,
} from '@kodi/db'
import type { MeetingSession } from '@kodi/db'
import { z } from 'zod'
import { openClawChatCompletion } from '../openclaw/client'
import {
  buildMeetingPromptContext,
  loadMeetingAnalysisContext,
} from './meeting-analysis-context'
import { saveMeetingStateSnapshotPatch } from './state-snapshots'

const rollingNotesSchema = z.object({
  summary: z.string().nullish(),
  rollingNotes: z.string().nullish(),
  activeTopics: z.array(z.string()).nullish(),
})

type ProcessMeetingRollingNotesInput = {
  orgId: string
  meetingSession: MeetingSession
  lastEventSequence: number
}

function buildRollingNotesMessages(input: {
  meetingSession: MeetingSession
  analysis: Awaited<ReturnType<typeof loadMeetingAnalysisContext>>
}) {
  return [
    {
      role: 'system' as const,
      content:
        'You are Kodi meeting intelligence running inside OpenClaw. Read the provided JSON meeting context, prior meeting state, and transcript turns, then reply with JSON only and no prose. Return this shape: {"summary":"short current summary","rollingNotes":"bullet-style running notes as plain text","activeTopics":["topic one","topic two"]}. Keep summary concise, keep rollingNotes grounded in the transcript, preserve important existing context when still relevant, and do not invent facts.',
    },
    {
      role: 'user' as const,
      content: JSON.stringify(
        buildMeetingPromptContext({
          meetingSession: input.meetingSession,
          analysis: input.analysis,
          protocolVersion: 'kodi.meeting.notes.v2',
        })
      ),
    },
  ]
}

function parseRollingNotes(content: string) {
  const normalized = content
    .trim()
    .replace(/^```json\s*/i, '')
    .replace(/^```\s*/i, '')
    .replace(/\s*```$/i, '')

  try {
    return rollingNotesSchema.parse(JSON.parse(normalized))
  } catch {
    return null
  }
}

export async function processMeetingRollingNotes(
  input: ProcessMeetingRollingNotesInput
) {
  const analysis = await loadMeetingAnalysisContext({
    meetingSessionId: input.meetingSession.id,
    transcriptLimit: 60,
  })

  if (
    analysis.snapshot?.lastEventSequence != null &&
    analysis.snapshot.lastEventSequence >= input.lastEventSequence
  ) {
    return { ok: true as const, skipped: 'already-processed' as const }
  }

  if (analysis.transcriptTurns.length === 0) {
    return { ok: true as const, skipped: 'no-transcript' as const }
  }

  const response = await openClawChatCompletion({
    orgId: input.orgId,
    messages: buildRollingNotesMessages({
      meetingSession: input.meetingSession,
      analysis,
    }),
    timeoutMs: 15_000,
  })

  if (!response.ok) {
    return response
  }

  const snapshot = parseRollingNotes(response.content)
  if (!snapshot) {
    return {
      ok: false as const,
      reason: 'invalid-response' as const,
      error: 'OpenClaw rolling notes response was not valid JSON.',
      raw: response.content,
    }
  }

  await saveMeetingStateSnapshotPatch({
    meetingSessionId: input.meetingSession.id,
    lastEventSequence: input.lastEventSequence,
    patch: {
      summary: snapshot.summary ?? null,
      rollingNotes: snapshot.rollingNotes ?? null,
      activeTopics: snapshot.activeTopics ?? null,
      lastProcessedAt: new Date(),
    },
  })

  await db
    .update(meetingSessions)
    .set({
      liveSummary: snapshot.summary ?? input.meetingSession.liveSummary,
      updatedAt: new Date(),
    })
    .where(eq(meetingSessions.id, input.meetingSession.id))

  return {
    ok: true as const,
    snapshot,
  }
}
