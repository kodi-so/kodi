import { describe, expect, it } from 'bun:test'
import {
  buildAppChatMemoryUpdateEvent,
  buildDashboardAssistantMemoryUpdateEvent,
  emitAppChatMemoryUpdateEvent,
  emitDashboardAssistantMemoryUpdateEvent,
} from './chat-events'

describe('buildAppChatMemoryUpdateEvent', () => {
  it('builds a shared app chat memory event', () => {
    const event = buildAppChatMemoryUpdateEvent({
      orgId: 'org_123',
      orgMemberId: 'org_member_123',
      actorUserId: 'user_123',
      channelId: 'channel_123',
      threadId: 'thread_123',
      userMessageId: 'user_message_123',
      assistantMessageId: 'assistant_message_123',
      userMessage: 'What should we do next on onboarding?',
      assistantMessage: 'We should update the checklist and assign an owner.',
    })

    expect(event).toMatchObject({
      orgId: 'org_123',
      source: 'app_chat',
      visibility: 'shared',
      summary: 'Shared app chat thread received a new assistant turn.',
      actor: {
        userId: 'user_123',
        orgMemberId: 'org_member_123',
      },
      payload: {
        threadId: 'thread_123',
        messageId: 'assistant_message_123',
      },
      metadata: {
        channelId: 'channel_123',
        userMessageId: 'user_message_123',
        assistantMessageId: 'assistant_message_123',
      },
    })
  })
})

describe('buildDashboardAssistantMemoryUpdateEvent', () => {
  it('builds a private dashboard assistant memory event', () => {
    const event = buildDashboardAssistantMemoryUpdateEvent({
      orgId: 'org_123',
      orgMemberId: 'org_member_123',
      actorUserId: 'user_123',
      threadId: 'thread_123',
      userMessageId: 'user_message_123',
      assistantMessageId: 'assistant_message_123',
      userMessage: 'Remember that I prefer async recaps.',
      assistantMessage: 'Noted. I will favor async recaps for you.',
      conversationMode: 'thread',
    })

    expect(event).toMatchObject({
      orgId: 'org_123',
      source: 'dashboard_assistant',
      visibility: 'private',
      summary: 'Dashboard assistant thread received a new assistant turn.',
      actor: {
        userId: 'user_123',
        orgMemberId: 'org_member_123',
      },
      payload: {
        threadId: 'thread_123',
        messageId: 'assistant_message_123',
      },
      metadata: {
        conversationMode: 'thread',
      },
    })
  })
})

describe('chat memory emitters', () => {
  it('passes app chat events to the shared scheduler', async () => {
    const seen: unknown[] = []

    const event = await emitAppChatMemoryUpdateEvent(
      {
        orgId: 'org_123',
        orgMemberId: 'org_member_123',
        actorUserId: 'user_123',
        channelId: 'channel_123',
        threadId: 'thread_123',
        userMessageId: 'user_message_123',
        assistantMessageId: 'assistant_message_123',
        userMessage: 'Question',
        assistantMessage: 'Answer',
      },
      async (memoryEvent) => {
        seen.push(memoryEvent)
      }
    )

    expect(seen).toHaveLength(1)
    expect(event.source).toBe('app_chat')
  })

  it('passes dashboard assistant events to the shared scheduler', async () => {
    const seen: unknown[] = []

    const event = await emitDashboardAssistantMemoryUpdateEvent(
      {
        orgId: 'org_123',
        orgMemberId: 'org_member_123',
        actorUserId: 'user_123',
        threadId: 'thread_123',
        userMessageId: 'user_message_123',
        assistantMessageId: 'assistant_message_123',
        userMessage: 'Question',
        assistantMessage: 'Answer',
        conversationMode: 'conversation',
      },
      async (memoryEvent) => {
        seen.push(memoryEvent)
      }
    )

    expect(seen).toHaveLength(1)
    expect(event.source).toBe('dashboard_assistant')
    expect(event.summary).toBe(
      'Private dashboard conversation received a new assistant turn.'
    )
  })
})
