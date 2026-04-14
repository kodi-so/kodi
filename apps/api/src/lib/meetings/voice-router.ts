import { db, eq } from '@kodi/db'
import type { MeetingTranscriptEvent } from './events'
import { generateMeetingAnswer } from './answer-engine'
import {
  createAnswerRequest,
  markAnswerDeliveredToVoice,
  markAnswerFailed,
  markAnswerGrounded,
  markAnswerInterrupted,
  markAnswerSpeaking,
  suppressAnswer,
  transitionAnswerState,
} from './answer-lifecycle'
import {
  getWorkspaceMeetingCopilotConfig,
  resolveMeetingSessionControls,
} from './copilot-policy'
import {
  evaluateVoicePolicy,
  isAnswerFreshForVoice,
  isAnswerSpeakable,
  truncateForVoice,
} from './voice-policy'
import {
  acquireVoiceLock,
  interruptActiveVoice,
} from './voice-concurrency'
import {
  detectVoiceTriggerInTranscript,
  isBotOwnTranscriptEvent,
} from './interaction-triggers'
import { generateSpeech, isTtsAvailable } from '../providers/tts/client'
import {
  sendRecallBotAudioOutput,
  stopRecallBotAudioOutput,
} from '../providers/recall/client'
import { storeVoiceAudio } from './voice-audio-store'
import { env } from '../../env'

type OrgIdentity = {
  id: string
  name: string
  slug: string
}

type VoiceRouterContext = {
  meetingSessionId: string
  org: OrgIdentity
  transcriptEvent: MeetingTranscriptEvent
}

/**
 * Route a transcript event through the voice participation pipeline.
 *
 * Called fire-and-forget from the orchestration service when voice_enabled mode
 * is active and a transcript turn completes. The function handles policy gating,
 * TTS generation, Recall audio output, and full lifecycle tracking.
 */
export async function routeMeetingVoiceEvent(ctx: VoiceRouterContext): Promise<void> {
  const { meetingSessionId, org, transcriptEvent } = ctx

  // Only act on final (non-partial) transcript turns
  if (transcriptEvent.transcript.isPartial) return

  const content = transcriptEvent.transcript.content ?? ''
  if (!content.trim()) return

  if (!isTtsAvailable()) return

  const [meetingSession, copilotConfig] = await Promise.all([
    db.query.meetingSessions.findFirst({
      where: (fields, { eq }) => eq(fields.id, meetingSessionId),
    }),
    getWorkspaceMeetingCopilotConfig(db, org),
  ])

  if (!meetingSession) return

  const { settings, identity } = copilotConfig
  const botNames = [identity.displayName, 'kodi'].filter(Boolean)

  if (isBotOwnTranscriptEvent(transcriptEvent, botNames)) return

  const { isVoiceTrigger, question } = detectVoiceTriggerInTranscript(content, botNames)

  if (!isVoiceTrigger) return
  if (!question) return

  // Check participation mode and controls
  const controls = await resolveMeetingSessionControls(db, {
    meetingSessionId,
    orgId: org.id,
    settings,
  })

  const policy = evaluateVoicePolicy({
    participationMode: controls.participationMode,
    liveResponsesDisabled: controls.liveResponsesDisabled,
    liveResponsesDisabledReason: controls.liveResponsesDisabledReason,
    settings,
    requireExplicitPrompt: settings.voiceResponsesRequireExplicitPrompt,
  })

  if (!policy.voiceAllowed) {
    console.info('[voice] voice suppressed by policy', {
      meetingSessionId,
      reason: policy.suppressionReason,
    })
    return
  }

  // Create the answer record
  const answer = await createAnswerRequest({
    meetingSessionId,
    orgId: org.id,
    requestedByUserId: null,
    source: 'chat', // transcript-triggered answers share the 'chat' source
    question,
  })

  await transitionAnswerState(answer.id, meetingSessionId, 'preparing')

  // Generate the answer text
  const result = await generateMeetingAnswer({
    orgId: org.id,
    meetingSession,
    question,
  })

  if (!result.ok) {
    await markAnswerFailed(answer.id, meetingSessionId, result.reason)
    return
  }

  await markAnswerGrounded(answer.id, meetingSessionId, result.answerText, result.grounding)

  // Re-fetch the answer to get the latest state for freshness checks
  const freshAnswer = await db.query.meetingAnswers.findFirst({
    where: (fields, { eq }) => eq(fields.id, answer.id),
  })

  if (!freshAnswer) return

  // Stale-response suppression: if the answer is no longer fresh, skip voice
  const freshnessCheck = isAnswerFreshForVoice(freshAnswer)
  if (!freshnessCheck.eligible) {
    await suppressAnswer(answer.id, meetingSessionId, freshnessCheck.reason)
    return
  }

  const speakableCheck = isAnswerSpeakable(freshAnswer)
  if (!speakableCheck.eligible) {
    await suppressAnswer(answer.id, meetingSessionId, speakableCheck.reason)
    return
  }

  // Acquire the per-session voice lock (interrupts any in-flight response)
  const lockResult = acquireVoiceLock(meetingSessionId, answer.id, () => {
    void markAnswerInterrupted(answer.id, meetingSessionId).catch(() => {})
  })

  if (!lockResult.acquired) {
    await suppressAnswer(answer.id, meetingSessionId, lockResult.reason)
    return
  }

  try {
    await markAnswerSpeaking(answer.id, meetingSessionId)

    // Generate TTS audio
    const voiceText = truncateForVoice(result.answerText)
    const ttsResult = await generateSpeech({ text: voiceText })

    if (!ttsResult.ok) {
      await markAnswerFailed(
        answer.id,
        meetingSessionId,
        `TTS generation failed: ${ttsResult.reason}`
      )
      return
    }

    // Store audio and build a Recall-accessible URL
    const token = storeVoiceAudio(ttsResult.audioBuffer)
    const apiBaseUrl = env.API_BASE_URL
    if (!apiBaseUrl) {
      await markAnswerFailed(
        answer.id,
        meetingSessionId,
        'API_BASE_URL is not configured — cannot build voice audio URL for Recall.'
      )
      return
    }

    const audioUrl = `${apiBaseUrl}/voice-output/${token}`

    // Deliver audio via Recall Output Media
    const botSessionId = meetingSession.providerBotSessionId
    if (!botSessionId) {
      await markAnswerFailed(
        answer.id,
        meetingSessionId,
        'No active bot session to deliver voice output.'
      )
      return
    }

    await sendRecallBotAudioOutput(botSessionId, { url: audioUrl })
    await markAnswerDeliveredToVoice(answer.id, meetingSessionId)
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error('[voice] voice delivery failed', { meetingSessionId, answerId: answer.id, error: message })
    await markAnswerFailed(answer.id, meetingSessionId, message)
  } finally {
    lockResult.release()
  }
}

/**
 * Immediately stop any active voice output for a session.
 * Used by operator controls or when the meeting ends.
 */
export async function stopMeetingVoiceOutput(
  meetingSessionId: string,
  botSessionId: string
): Promise<void> {
  const interruptedAnswerId = interruptActiveVoice(meetingSessionId)

  if (interruptedAnswerId) {
    await markAnswerInterrupted(
      interruptedAnswerId,
      meetingSessionId,
      'Voice output stopped by operator.'
    )
  }

  try {
    await stopRecallBotAudioOutput(botSessionId)
  } catch (err) {
    console.warn('[voice] stop audio output failed', {
      meetingSessionId,
      error: err instanceof Error ? err.message : String(err),
    })
  }
}
