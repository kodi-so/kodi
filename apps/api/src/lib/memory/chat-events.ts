import { z } from 'zod'
import {
  openClawChatCompletion,
  type OpenClawConversationVisibility,
} from '../openclaw/client'
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

type ChatMemoryCorrectionSurface = 'app_chat' | 'dashboard_assistant'

type ChatMemoryCorrectionInput = {
  orgId: string
  orgMemberId: string
  actorUserId: string
  userMessageId: string
  assistantMessageId: string
  userMessage: string
  assistantMessage: string
  threadId: string
  channelId?: string
  conversationMode?: 'thread' | 'conversation'
  surface: ChatMemoryCorrectionSurface
}

type ChatMemoryScheduler = (
  event:
    | Extract<MemoryUpdateEvent, { source: 'app_chat' }>
    | Extract<MemoryUpdateEvent, { source: 'dashboard_assistant' }>
    | Extract<MemoryUpdateEvent, { source: 'user_request' }>
) => Promise<unknown>

type OpenClawChatCompletionFn = typeof openClawChatCompletion

type ChatMemoryIntentDeps = {
  completeCorrectionChat?: OpenClawChatCompletionFn
}

const CHAT_MEMORY_CORRECTION_PROTOCOL_VERSION =
  'kodi.memory.chat-correction-detector.v1'
const CHAT_MEMORY_CORRECTION_TIMEOUT_MS = 8_000

const chatMemoryCorrectionResponseSchema = z
  .object({
    shouldRouteAsCorrection: z.boolean(),
    summary: z.string().trim().min(1).nullish(),
    pathHint: z.string().trim().min(1).nullish(),
    rationale: z.array(z.string().trim().min(1)).default([]),
  })
  .strict()

type ChatMemoryCorrectionResponse = z.infer<
  typeof chatMemoryCorrectionResponseSchema
>

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

export function buildChatMemoryCorrectionEvent(
  input: ChatMemoryCorrectionInput,
  detection: ChatMemoryCorrectionResponse
): Extract<MemoryUpdateEvent, { source: 'user_request' }> {
  return {
    id: crypto.randomUUID(),
    orgId: input.orgId,
    source: 'user_request',
    occurredAt: new Date(),
    visibility: input.surface === 'app_chat' ? 'shared' : 'private',
    summary:
      detection.summary?.trim() ||
      'User explicitly asked Kodi to correct durable memory.',
    actor: {
      userId: input.actorUserId,
      orgMemberId: input.orgMemberId,
    },
    dedupeKey: `memory-correction:${input.orgId}:${input.userMessageId}`,
    metadata: {
      surface: input.surface,
      threadId: input.threadId,
      channelId: input.channelId,
      conversationMode: input.conversationMode,
      userMessageId: input.userMessageId,
      assistantMessageId: input.assistantMessageId,
      userMessage: input.userMessage,
      assistantMessage: input.assistantMessage,
      detectionRationale: detection.rationale,
      pathHint: detection.pathHint?.trim() || null,
    },
    payload: {
      requestId: input.userMessageId,
      surface: input.surface,
      path: detection.pathHint?.trim() || undefined,
    },
  }
}

function buildCorrectionDetectionRouting(
  input: ChatMemoryCorrectionInput
): {
  visibility: OpenClawConversationVisibility
  actorUserId?: string
} {
  if (input.surface === 'dashboard_assistant') {
    return {
      visibility: 'private',
      actorUserId: input.actorUserId,
    }
  }

  return {
    visibility: 'shared',
    actorUserId: undefined,
  }
}

function buildCorrectionDetectionMessages(input: ChatMemoryCorrectionInput) {
  return [
    {
      role: 'system' as const,
      content:
        'You detect explicit user requests to correct Kodi durable memory. Reply with JSON only and no prose using this exact shape: {"shouldRouteAsCorrection":true,"summary":"short summary","pathHint":"optional relative markdown path or null","rationale":["short reason"]}. Route as a correction only when the user is clearly instructing Kodi to update, correct, replace, forget, remove, or explicitly remember something in durable memory. Normal working conversation, ordinary planning, and routine questions should return shouldRouteAsCorrection=false. If the user names a specific memory file or directory, include it as pathHint when safe; otherwise use null.',
    },
    {
      role: 'user' as const,
      content: JSON.stringify({
        protocolVersion: CHAT_MEMORY_CORRECTION_PROTOCOL_VERSION,
        goal:
          'Decide whether this chat turn should be routed as an explicit durable-memory correction request instead of generic chat evidence.',
        surface: input.surface,
        visibility: input.surface === 'app_chat' ? 'shared' : 'private',
        userMessage: input.userMessage,
        assistantMessage: input.assistantMessage,
        context: {
          threadId: input.threadId,
          channelId: input.channelId ?? null,
          conversationMode: input.conversationMode ?? null,
        },
      }),
    },
  ]
}

function parseCorrectionDetectionResponse(content: string) {
  const normalized = content
    .trim()
    .replace(/^```json\s*/i, '')
    .replace(/^```\s*/i, '')
    .replace(/\s*```$/i, '')

  try {
    return chatMemoryCorrectionResponseSchema.parse(JSON.parse(normalized))
  } catch {
    return null
  }
}

async function detectChatMemoryCorrection(
  input: ChatMemoryCorrectionInput,
  deps: ChatMemoryIntentDeps = {}
) {
  const routing = buildCorrectionDetectionRouting(input)
  const response = await (deps.completeCorrectionChat ?? openClawChatCompletion)({
    orgId: input.orgId,
    actorUserId: routing.actorUserId,
    visibility: routing.visibility,
    sessionKey: `memory-correction-detect:${input.userMessageId}`,
    messageChannel: 'memory',
    messages: buildCorrectionDetectionMessages(input),
    timeoutMs: CHAT_MEMORY_CORRECTION_TIMEOUT_MS,
    temperature: 0.1,
    maxTokens: 300,
  })

  if (!response.ok) {
    return null
  }

  return parseCorrectionDetectionResponse(response.content)
}

export async function emitAppChatMemoryUpdateEvent(
  input: AppChatEventInput,
  schedule: ChatMemoryScheduler = scheduleMemoryUpdateEvent,
  deps: ChatMemoryIntentDeps = {}
) {
  const correction = await detectChatMemoryCorrection(
    {
      ...input,
      surface: 'app_chat',
    },
    deps
  )
  const event =
    correction?.shouldRouteAsCorrection
      ? buildChatMemoryCorrectionEvent(
          {
            ...input,
            surface: 'app_chat',
          },
          correction
        )
      : buildAppChatMemoryUpdateEvent(input)
  await schedule(event)
  return event
}

export async function emitDashboardAssistantMemoryUpdateEvent(
  input: DashboardMemoryEventInput,
  schedule: ChatMemoryScheduler = scheduleMemoryUpdateEvent,
  deps: ChatMemoryIntentDeps = {}
) {
  const correction = await detectChatMemoryCorrection(
    {
      ...input,
      surface: 'dashboard_assistant',
    },
    deps
  )
  const event =
    correction?.shouldRouteAsCorrection
      ? buildChatMemoryCorrectionEvent(
          {
            ...input,
            surface: 'dashboard_assistant',
          },
          correction
        )
      : buildDashboardAssistantMemoryUpdateEvent(input)
  await schedule(event)
  return event
}
