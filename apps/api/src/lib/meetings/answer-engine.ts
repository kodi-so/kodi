import type { MeetingSession } from '@kodi/db'
import { openClawChatCompletion } from '../openclaw/client'
import {
  buildMeetingPromptContext,
  loadMeetingAnalysisContext,
  serializeMeetingParticipants,
  serializeMeetingSnapshot,
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

  const promptContext = buildMeetingPromptContext({
    meetingSession: input.meetingSession,
    analysis: input.analysis,
    protocolVersion: 'kodi.meeting.answer.v1',
  })

  const systemPrompt = hasMeetingContext
    ? 'You are Kodi, an AI meeting copilot. You have access to the live meeting context below including the current transcript, participants, and structured meeting state. Answer the user\'s question directly and helpfully. For questions about the meeting, use the provided context. For general questions, draw on your broader knowledge — you are not limited to meeting context only. Be concise. Respond in markdown.'
    : 'You are Kodi, an AI meeting copilot. No meeting context is available yet for this session. Answer the user\'s question using your general knowledge. Be concise. Respond in markdown.'

  return [
    {
      role: 'system' as const,
      content: systemPrompt,
    },
    {
      role: 'user' as const,
      content: hasMeetingContext
        ? JSON.stringify({ ...promptContext, question: input.question })
        : input.question,
    },
  ]
}

export async function generateMeetingAnswer(
  input: GenerateMeetingAnswerInput
): Promise<GenerateMeetingAnswerResult> {
  const analysis = await loadMeetingAnalysisContext({
    meetingSessionId: input.meetingSession.id,
    transcriptLimit: 60,
  })

  const messages = buildAnswerMessages({
    meetingSession: input.meetingSession,
    analysis,
    question: input.question,
  })

  const response = await openClawChatCompletion({
    orgId: input.orgId,
    messages,
    timeoutMs: 20_000,
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
