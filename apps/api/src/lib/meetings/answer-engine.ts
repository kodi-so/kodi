import type { MeetingSession } from '@kodi/db'
import { openClawChatCompletion } from '../openclaw/client'
import {
  loadMeetingAnalysisContext,
  serializeMeetingParticipants,
  serializeMeetingTranscriptTurns,
} from './meeting-analysis-context'

export type MeetingAnswerGrounding = {
  transcriptTurnCount: number
  hasSnapshot: boolean
  participantCount: number
  protocolVersion: string
}

export type GenerateMeetingAnswerResult =
  | {
      ok: true
      answerText: string
      grounding: MeetingAnswerGrounding
    }
  | {
      ok: false
      reason:
        | 'no-context'
        | 'openclaw-unavailable'
        | 'openclaw-failed'
        | 'empty-response'
      error?: string
    }

type GenerateMeetingAnswerInput = {
  orgId: string
  meetingSession: MeetingSession
  question: string
}

function buildAnswerMessages(input: {
  meetingSession: MeetingSession
  analysis: Awaited<ReturnType<typeof loadMeetingAnalysisContext>>
  question: string
}) {
  const hasMeetingContext =
    input.analysis.transcriptTurns.length > 0 || input.analysis.snapshot != null

  const systemPrompt = hasMeetingContext
    ? "You are Kodi, an AI meeting copilot. You have access to the live meeting context below including the current transcript, participants, and meeting state. Answer the user's question directly and helpfully. For questions about the meeting, use the provided context. For general questions, draw on your broader knowledge. Be concise. Respond in markdown."
    : "You are Kodi, an AI meeting copilot. No meeting context is available yet for this session. Answer the user's question using your general knowledge. Be concise. Respond in markdown."

  if (!hasMeetingContext) {
    return [
      { role: 'system' as const, content: systemPrompt },
      { role: 'user' as const, content: input.question },
    ]
  }

  // Lean Q&A context — summary + recent transcript is sufficient for answering
  // questions. Omitting decisions/risks/tasks/draftActions/timestamps keeps the
  // payload small so local models can respond within the timeout budget.
  const context = {
    protocolVersion: 'kodi.meeting.answer.v1',
    meeting: {
      meetingSessionId: input.meetingSession.id,
      provider: input.meetingSession.provider,
      title: input.meetingSession.title,
      status: input.meetingSession.status,
      actualStartAt: input.meetingSession.actualStartAt?.toISOString() ?? null,
    },
    participants: serializeMeetingParticipants(input.analysis.participants),
    meetingState: {
      summary: input.analysis.snapshot?.summary ?? null,
      rollingNotes: input.analysis.snapshot?.rollingNotes ?? null,
      activeTopics: input.analysis.snapshot?.activeTopics ?? [],
      decisions: input.analysis.snapshot?.decisions ?? [],
    },
    recentTranscript: serializeMeetingTranscriptTurns(input.analysis.transcriptTurns),
    question: input.question,
  }

  return [
    { role: 'system' as const, content: systemPrompt },
    { role: 'user' as const, content: JSON.stringify(context) },
  ]
}

export async function generateMeetingAnswer(
  input: GenerateMeetingAnswerInput
): Promise<GenerateMeetingAnswerResult> {
  // 20 recent turns covers the live conversation window; older context is
  // captured in the rolling summary/notes, so 60 turns was unnecessary overhead.
  const analysis = await loadMeetingAnalysisContext({
    meetingSessionId: input.meetingSession.id,
    transcriptLimit: 20,
  })

  const messages = buildAnswerMessages({
    meetingSession: input.meetingSession,
    analysis,
    question: input.question,
  })

  const response = await openClawChatCompletion({
    orgId: input.orgId,
    messages,
    timeoutMs: 60_000,
    // temperature: 0 uses greedy decoding — deterministic and faster than
    // sampling, especially on cloud models billed by processing time.
    temperature: 0,
    // Cap response length: Q&A answers don't need to be essays. This bounds
    // generation time and prevents runaway long outputs.
    maxTokens: 600,
  })

  if (!response.ok) {
    const reason =
      response.reason === 'missing-instance' ||
      response.reason === 'instance-not-running' ||
      response.reason === 'missing-instance-url'
        ? ('openclaw-unavailable' as const)
        : ('openclaw-failed' as const)

    return { ok: false, reason, error: response.error }
  }

  if (!response.content.trim()) {
    return { ok: false, reason: 'empty-response' }
  }

  return {
    ok: true,
    answerText: response.content.trim(),
    grounding: {
      transcriptTurnCount: analysis.transcriptTurns.length,
      hasSnapshot: analysis.snapshot != null,
      participantCount: analysis.participants.length,
      protocolVersion: 'kodi.meeting.answer.v1',
    },
  }
}
