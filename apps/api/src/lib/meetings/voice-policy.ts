import type { MeetingAnswer, MeetingCopilotSettings, MeetingParticipationMode } from '@kodi/db'

export type VoiceParticipationPolicy = {
  /**
   * Whether voice output is allowed at all for this session given the current controls
   * and workspace settings.
   */
  voiceAllowed: boolean

  /**
   * When voiceAllowed is false, describes why voice is being suppressed.
   */
  suppressionReason: string | null
}

export type VoiceEligibilityResult =
  | { eligible: true }
  | { eligible: false; reason: string }

/**
 * Evaluate whether voice output is currently allowed given the session's participation
 * controls and workspace settings.
 */
export function evaluateVoicePolicy(input: {
  participationMode: MeetingParticipationMode
  liveResponsesDisabled: boolean
  liveResponsesDisabledReason: string | null
  settings: MeetingCopilotSettings
  requireExplicitPrompt: boolean
}): VoiceParticipationPolicy {
  if (input.liveResponsesDisabled) {
    return {
      voiceAllowed: false,
      suppressionReason:
        input.liveResponsesDisabledReason ?? 'Live responses have been disabled.',
    }
  }

  if (input.participationMode !== 'voice_enabled') {
    return {
      voiceAllowed: false,
      suppressionReason: `Participation mode is "${input.participationMode}" — voice output requires "voice_enabled".`,
    }
  }

  if (input.requireExplicitPrompt && !input.settings.voiceResponsesRequireExplicitPrompt) {
    // The caller says an explicit prompt is required but the settings say otherwise —
    // the caller constraint wins (explicit prompt is always the conservative path).
    return {
      voiceAllowed: false,
      suppressionReason: 'Voice response requires an explicit prompt.',
    }
  }

  return { voiceAllowed: true, suppressionReason: null }
}

/**
 * Check whether a grounded answer is still fresh enough to be spoken.
 * An answer is considered stale for voice if more than 90 seconds have passed
 * since it was created — the meeting may have already moved on.
 */
export function isAnswerFreshForVoice(answer: MeetingAnswer): VoiceEligibilityResult {
  const staleThresholdMs = 90_000 // 90 seconds
  const ageMs = Date.now() - answer.createdAt.getTime()

  if (ageMs > staleThresholdMs) {
    return {
      eligible: false,
      reason: `Answer is ${Math.round(ageMs / 1000)}s old — too stale to speak (limit: ${staleThresholdMs / 1000}s).`,
    }
  }

  return { eligible: true }
}

/**
 * Check whether an answer is in a terminal or non-speakable state.
 * Only grounded or delivered_to_ui answers can transition to voice.
 */
export function isAnswerSpeakable(answer: MeetingAnswer): VoiceEligibilityResult {
  const speakableStatuses = ['grounded', 'delivered_to_ui'] as const

  if (!speakableStatuses.includes(answer.status as (typeof speakableStatuses)[number])) {
    return {
      eligible: false,
      reason: `Answer status "${answer.status}" is not eligible for voice delivery.`,
    }
  }

  if (!answer.answerText?.trim()) {
    return { eligible: false, reason: 'Answer has no text to speak.' }
  }

  return { eligible: true }
}

/**
 * Truncate answer text to a safe maximum length for voice output.
 * Long answers are cut at a sentence boundary where possible.
 */
export function truncateForVoice(text: string, maxChars = 320): string {
  if (text.length <= maxChars) return text

  const truncated = text.slice(0, maxChars)
  // Try to cut at the last sentence boundary within the window
  const lastPeriod = Math.max(
    truncated.lastIndexOf('. '),
    truncated.lastIndexOf('? '),
    truncated.lastIndexOf('! ')
  )

  if (lastPeriod > maxChars * 0.6) {
    return truncated.slice(0, lastPeriod + 1).trim()
  }

  // Fall back to word boundary
  const lastSpace = truncated.lastIndexOf(' ')
  return lastSpace > 0 ? truncated.slice(0, lastSpace).trim() + '…' : truncated.trim() + '…'
}
