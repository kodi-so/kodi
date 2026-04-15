import type { MeetingChatEvent, MeetingTranscriptEvent } from './events'

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function normalizeRecipient(value: string | null | undefined) {
  return value?.trim().replace(/^@/, '').toLowerCase() ?? null
}

export function detectChatTriggerInMessage(
  content: string,
  botNames: string[]
): { isExplicitAsk: boolean; question: string } {
  const trimmed = content.trim()

  for (const name of botNames) {
    if (!name) continue
    const escaped = escapeRegExp(name)
    const mentionPattern = new RegExp(`^@${escaped}\\b[\\s,:-]*(.+)$`, 'i')
    const plainNamePattern = new RegExp(`^${escaped}\\b[\\s,:-]+(.+)$`, 'i')

    const match = mentionPattern.exec(trimmed) ?? plainNamePattern.exec(trimmed)
    if (match?.[1]) {
      return {
        isExplicitAsk: true,
        question: match[1].trim(),
      }
    }
  }

  return { isExplicitAsk: false, question: trimmed }
}

export function isDirectMessageToBot(
  chatEvent: MeetingChatEvent,
  botNames: string[]
): boolean {
  const recipient = normalizeRecipient(chatEvent.message.to)
  if (!recipient || recipient === 'everyone') return false

  return botNames.some((name) => normalizeRecipient(name) === recipient)
}

function expandVoiceTriggerNames(botNames: string[]) {
  const variants = new Set<string>()

  for (const rawName of botNames) {
    const normalized = rawName.trim()
    if (!normalized) continue
    variants.add(normalized)

    if (normalized.toLowerCase() === 'kodi') {
      variants.add('cody')
      variants.add('kody')
      variants.add('codi')
      variants.add('codie')
    }
  }

  return [...variants]
}

export function detectVoiceTriggerInTranscript(
  content: string,
  botNames: string[]
): { isVoiceTrigger: boolean; question: string } {
  const trimmed = content.trim()
  const triggerNames = expandVoiceTriggerNames(botNames)

  for (const name of triggerNames) {
    if (!name) continue
    const escaped = escapeRegExp(name)
    const patterns = [
      new RegExp(`^@${escaped}\\b[\\s,:-]*(.+)$`, 'i'),
      new RegExp(`^(?:hey|hi|hello|ok|okay|yo)\\s+${escaped}\\b[\\s,:-]+(.+)$`, 'i'),
      new RegExp(`^.*\\b(?:hey|hi|hello|ok|okay|yo)\\s+${escaped}\\b[\\s,:-]+(.+)$`, 'i'),
      new RegExp(`^${escaped}\\b[\\s,:-]+(.+)$`, 'i'),
    ]

    for (const pattern of patterns) {
      const match = pattern.exec(trimmed)
      if (match?.[1]) {
        return {
          isVoiceTrigger: true,
          question: match[1].trim(),
        }
      }
    }
  }

  return { isVoiceTrigger: false, question: trimmed }
}

export function isBotOwnTranscriptEvent(
  transcriptEvent: MeetingTranscriptEvent,
  botNames: string[]
): boolean {
  const speakerName = transcriptEvent.transcript.speaker?.displayName?.trim().toLowerCase()
  if (!speakerName) return false

  return botNames.some((name) => name.trim().toLowerCase() === speakerName)
}
