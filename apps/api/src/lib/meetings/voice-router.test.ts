import { describe, expect, it } from 'bun:test'
import type { MeetingTranscriptEvent } from './events'
import {
  detectVoiceTriggerInTranscript,
  isBotOwnTranscriptEvent,
} from './interaction-triggers'

function transcriptEvent(
  content: string,
  speakerDisplayName = 'Noah Milberger'
): MeetingTranscriptEvent {
  return {
    kind: 'transcript',
    provider: 'zoom',
    occurredAt: new Date('2026-04-13T18:05:00.000Z'),
    transcript: {
      content,
      isPartial: false,
      speaker: {
        displayName: speakerDisplayName,
      },
    },
  }
}

describe('voice-router triggers', () => {
  it('treats leading bot names as voice prompts', () => {
    expect(
      detectVoiceTriggerInTranscript(
        'Kodi, what did we decide about pricing?',
        ['Kodi']
      )
    ).toEqual({
      isVoiceTrigger: true,
      question: 'what did we decide about pricing?',
    })
  })

  it('supports conversational greetings before the bot name', () => {
    expect(
      detectVoiceTriggerInTranscript(
        'hello kodi can you summarize the blockers?',
        ['Kodi']
      )
    ).toEqual({
      isVoiceTrigger: true,
      question: 'can you summarize the blockers?',
    })
  })

  it('supports common ASR misspellings for Kodi', () => {
    expect(
      detectVoiceTriggerInTranscript('Cody what should I do next?', ['Kodi'])
    ).toEqual({
      isVoiceTrigger: true,
      question: 'what should I do next?',
    })
  })

  it('does not trigger on unrelated transcript text', () => {
    expect(
      detectVoiceTriggerInTranscript(
        'We should ship pricing updates this week.',
        ['Kodi']
      )
    ).toEqual({
      isVoiceTrigger: false,
      question: 'We should ship pricing updates this week.',
    })
  })

  it('ignores transcript turns spoken by the bot itself', () => {
    expect(isBotOwnTranscriptEvent(transcriptEvent('Kodi, can you repeat that?', 'Kodi'), ['Kodi'])).toBe(
      true
    )
  })
})
