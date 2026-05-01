import { describe, expect, it } from 'bun:test'
import {
  buildAppChatMemoryUpdateEvent,
  buildChatMemoryCorrectionEvent,
  buildDashboardAssistantMemoryUpdateEvent,
  emitAppChatMemoryUpdateEvent,
  emitDashboardAssistantMemoryUpdateEvent,
} from './chat-events'

function createCorrectionDetection(payload: Record<string, unknown>) {
  return async () => ({
    ok: true as const,
    content: JSON.stringify(payload),
    connection: {
      instance: {} as never,
      instanceUrl: 'https://openclaw.test',
      headers: {},
      model: 'openclaw/default',
      routedAgent: {
        id: 'agent_123',
        agentType: 'org' as const,
        openclawAgentId: 'agent_123',
        status: 'active' as const,
      },
      fallbackToDefaultAgent: false,
    },
  })
}

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

describe('buildChatMemoryCorrectionEvent', () => {
  it('builds an explicit user-request memory correction event', () => {
    const event = buildChatMemoryCorrectionEvent(
      {
        orgId: 'org_123',
        orgMemberId: 'org_member_123',
        actorUserId: 'user_123',
        threadId: 'thread_123',
        userMessageId: 'user_message_123',
        assistantMessageId: 'assistant_message_123',
        userMessage: 'Please update Kodi memory: Maya owns onboarding now.',
        assistantMessage: 'I will update that.',
        surface: 'app_chat',
        channelId: 'channel_123',
      },
      {
        shouldRouteAsCorrection: true,
        summary: 'User explicitly corrected shared onboarding ownership memory.',
        pathHint: 'Projects/Onboarding.md',
        rationale: ['The user explicitly asked Kodi to update durable memory.'],
      }
    )

    expect(event).toMatchObject({
      source: 'user_request',
      visibility: 'shared',
      summary: 'User explicitly corrected shared onboarding ownership memory.',
      dedupeKey: 'memory-correction:org_123:user_message_123',
      payload: {
        requestId: 'user_message_123',
        surface: 'app_chat',
        path: 'Projects/Onboarding.md',
      },
      metadata: {
        channelId: 'channel_123',
        pathHint: 'Projects/Onboarding.md',
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
      },
      {
        completeCorrectionChat: createCorrectionDetection({
          shouldRouteAsCorrection: false,
          summary: null,
          pathHint: null,
          rationale: ['Normal working conversation.'],
        }),
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
      },
      {
        completeCorrectionChat: createCorrectionDetection({
          shouldRouteAsCorrection: false,
          summary: null,
          pathHint: null,
          rationale: ['Normal working conversation.'],
        }),
      }
    )

    expect(seen).toHaveLength(1)
    expect(event.source).toBe('dashboard_assistant')
    expect(event.summary).toBe(
      'Private dashboard conversation received a new assistant turn.'
    )
  })

  it('routes explicit app-chat memory corrections as user requests', async () => {
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
        userMessage:
          'Please update Kodi memory: Maya owns onboarding now, not Alex.',
        assistantMessage: 'I will correct that memory.',
      },
      async (memoryEvent) => {
        seen.push(memoryEvent)
      },
      {
        completeCorrectionChat: createCorrectionDetection({
          shouldRouteAsCorrection: true,
          summary: 'User explicitly corrected shared onboarding ownership memory.',
          pathHint: 'Projects/Onboarding.md',
          rationale: ['The user explicitly instructed Kodi to correct memory.'],
        }),
      }
    )

    expect(seen).toHaveLength(1)
    expect(event.source).toBe('user_request')
    if (event.source === 'user_request') {
      expect(event.payload.surface).toBe('app_chat')
      expect(event.payload.path).toBe('Projects/Onboarding.md')
    }
  })

  it('routes explicit dashboard memory corrections as private user requests', async () => {
    const seen: unknown[] = []

    const event = await emitDashboardAssistantMemoryUpdateEvent(
      {
        orgId: 'org_123',
        orgMemberId: 'org_member_123',
        actorUserId: 'user_123',
        threadId: 'thread_123',
        userMessageId: 'user_message_123',
        assistantMessageId: 'assistant_message_123',
        userMessage: 'Please remember that I do not want Friday recap pings.',
        assistantMessage: 'I will correct that private memory.',
        conversationMode: 'conversation',
      },
      async (memoryEvent) => {
        seen.push(memoryEvent)
      },
      {
        completeCorrectionChat: createCorrectionDetection({
          shouldRouteAsCorrection: true,
          summary: 'User explicitly corrected a private recap preference.',
          pathHint: 'Preferences/Recap Preferences.md',
          rationale: ['The user explicitly instructed Kodi to correct private memory.'],
        }),
      }
    )

    expect(seen).toHaveLength(1)
    expect(event.source).toBe('user_request')
    expect(event.visibility).toBe('private')
    if (event.source === 'user_request') {
      expect(event.payload.surface).toBe('dashboard_assistant')
    }
  })
})
