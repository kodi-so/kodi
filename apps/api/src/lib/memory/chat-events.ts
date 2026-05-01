import { scheduleMemoryUpdateEvent, type MemoryUpdateEvent } from './events'

type AppChatEventInput = {
  orgId: string
  orgMemberId: string
  actorUserId: string
  channelId: string
  threadId: string
  userMessageId: string
  assistantMessageId: string
  userMessage: string
  assistantMessage: string
}

type DashboardMemoryEventInput = {
  orgId: string
  orgMemberId: string
  actorUserId: string
  threadId: string
  userMessageId: string
  assistantMessageId: string
  userMessage: string
  assistantMessage: string
  conversationMode: 'thread' | 'conversation'
}

type ChatMemoryScheduler = (
  event:
    | Extract<MemoryUpdateEvent, { source: 'app_chat' }>
    | Extract<MemoryUpdateEvent, { source: 'dashboard_assistant' }>
) => Promise<unknown>

export function buildAppChatMemoryUpdateEvent(
  input: AppChatEventInput
): Extract<MemoryUpdateEvent, { source: 'app_chat' }> {
  return {
    id: crypto.randomUUID(),
    orgId: input.orgId,
    source: 'app_chat',
    occurredAt: new Date(),
    visibility: 'shared',
    summary: 'Shared app chat thread received a new assistant turn.',
    actor: {
      userId: input.actorUserId,
      orgMemberId: input.orgMemberId,
    },
    metadata: {
      channelId: input.channelId,
      threadId: input.threadId,
      userMessageId: input.userMessageId,
      assistantMessageId: input.assistantMessageId,
      userMessage: input.userMessage,
      assistantMessage: input.assistantMessage,
    },
    payload: {
      threadId: input.threadId,
      messageId: input.assistantMessageId,
    },
  }
}

export function buildDashboardAssistantMemoryUpdateEvent(
  input: DashboardMemoryEventInput
): Extract<MemoryUpdateEvent, { source: 'dashboard_assistant' }> {
  return {
    id: crypto.randomUUID(),
    orgId: input.orgId,
    source: 'dashboard_assistant',
    occurredAt: new Date(),
    visibility: 'private',
    summary:
      input.conversationMode === 'conversation'
        ? 'Private dashboard conversation received a new assistant turn.'
        : 'Dashboard assistant thread received a new assistant turn.',
    actor: {
      userId: input.actorUserId,
      orgMemberId: input.orgMemberId,
    },
    metadata: {
      threadId: input.threadId,
      userMessageId: input.userMessageId,
      assistantMessageId: input.assistantMessageId,
      userMessage: input.userMessage,
      assistantMessage: input.assistantMessage,
      conversationMode: input.conversationMode,
    },
    payload: {
      threadId: input.threadId,
      messageId: input.assistantMessageId,
    },
  }
}

export async function emitAppChatMemoryUpdateEvent(
  input: AppChatEventInput,
  schedule: ChatMemoryScheduler = scheduleMemoryUpdateEvent
) {
  const event = buildAppChatMemoryUpdateEvent(input)
  await schedule(event)
  return event
}

export async function emitDashboardAssistantMemoryUpdateEvent(
  input: DashboardMemoryEventInput,
  schedule: ChatMemoryScheduler = scheduleMemoryUpdateEvent
) {
  const event = buildDashboardAssistantMemoryUpdateEvent(input)
  await schedule(event)
  return event
}
