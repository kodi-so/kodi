import { describe, expect, it } from 'bun:test'
import type { MeetingChatEvent } from './events'
import {
  detectChatTriggerInMessage,
  isDirectMessageToBot,
} from './interaction-triggers'

function chatEvent(overrides?: Partial<MeetingChatEvent>): MeetingChatEvent {
  return {
    kind: 'chat',
    provider: 'zoom',
    occurredAt: new Date('2026-04-13T18:00:00.000Z'),
    action: 'meeting.chat_message.received',
    message: {
      content: 'Can you summarize the last decision?',
      to: 'everyone',
      sender: {
        displayName: 'Noah Milberger',
      },
    },
    ...overrides,
  }
}

describe('chat-router triggers', () => {
  it('treats @mentions as explicit asks', () => {
    expect(
      detectChatTriggerInMessage('@Kodi what did we decide?', ['Kodi'])
    ).toEqual({
      isExplicitAsk: true,
      question: 'what did we decide?',
    })
  })

  it('treats leading bot names as explicit asks', () => {
    expect(
      detectChatTriggerInMessage('Kodi, what did we decide?', ['Kodi'])
    ).toEqual({
      isExplicitAsk: true,
      question: 'what did we decide?',
    })
  })

  it('detects direct bot messages without a mention', () => {
    expect(
      isDirectMessageToBot(
        chatEvent({
          message: {
            content: 'What did we decide?',
            to: 'Kodi',
            sender: { displayName: 'Noah Milberger' },
          },
        }),
        ['Kodi']
      )
    ).toBe(true)
  })

  it('ignores messages addressed to everyone', () => {
    expect(isDirectMessageToBot(chatEvent(), ['Kodi'])).toBe(false)
  })
})
