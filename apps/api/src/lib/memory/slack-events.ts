import { scheduleMemoryUpdateEvent, type MemoryUpdateEvent } from './events'

type SlackMemoryEventInput = {
  orgId: string
  actorUserId: string | null
  visibility: 'private' | 'shared'
  action: string
  channelId?: string | null
  threadTs?: string | null
  messageTs?: string | null
  text?: string | null
  sourceType: 'chat' | 'meeting'
  sourceId?: string | null
}

type SlackMemoryScheduler = (
  event: Extract<MemoryUpdateEvent, { source: 'slack' }>
) => Promise<unknown>

export function buildSlackMemoryUpdateEvent(
  input: SlackMemoryEventInput
): Extract<MemoryUpdateEvent, { source: 'slack' }> {
  const normalizedChannelId = input.channelId?.trim() || 'unknown-channel'
  const normalizedThreadTs = input.threadTs?.trim() || null
  const normalizedMessageTs = input.messageTs?.trim() || null

  return {
    id: crypto.randomUUID(),
    orgId: input.orgId,
    source: 'slack',
    occurredAt: new Date(),
    visibility: input.visibility,
    summary:
      input.visibility === 'private'
        ? 'Slack direct-message activity changed through Kodi.'
        : 'Slack channel activity changed through Kodi.',
    actor: input.actorUserId
      ? {
          userId: input.actorUserId,
        }
      : undefined,
    metadata: {
      action: input.action,
      sourceType: input.sourceType,
      sourceId: input.sourceId ?? null,
      channelId: normalizedChannelId,
      threadTs: normalizedThreadTs,
      messageTs: normalizedMessageTs,
      text: input.text ?? null,
    },
    payload: {
      channelId: normalizedChannelId,
      threadTs: normalizedThreadTs ?? undefined,
      messageTs: normalizedMessageTs ?? undefined,
      isDirectMessage: normalizedChannelId.startsWith('D'),
    },
  }
}

export async function emitSlackMemoryUpdateEvent(
  input: SlackMemoryEventInput,
  schedule: SlackMemoryScheduler = scheduleMemoryUpdateEvent
) {
  const event = buildSlackMemoryUpdateEvent(input)
  await schedule(event)
  return event
}

export function resolveSlackMemoryEventInput(input: {
  orgId: string
  actorUserId: string | null
  visibility: 'private' | 'shared'
  action: string
  sourceType: 'chat' | 'meeting'
  sourceId?: string | null
  argumentsPayload?: Record<string, unknown> | null
  responsePayload?: Record<string, unknown> | null
}) {
  if (input.action !== 'SLACK_SEND_MESSAGE') {
    return null
  }

  const args = input.argumentsPayload ?? {}
  const response = input.responsePayload ?? {}

  return {
    orgId: input.orgId,
    actorUserId: input.actorUserId,
    visibility: input.visibility,
    action: input.action,
    sourceType: input.sourceType,
    sourceId: input.sourceId ?? null,
    channelId: firstString(
      args.channel,
      args.channel_id,
      response.channel,
      response.channel_id,
      nestedValue(response, ['data', 'channel']),
      nestedValue(response, ['data', 'channel_id'])
    ),
    threadTs: firstString(
      args.thread_ts,
      nestedValue(response, ['data', 'thread_ts']),
      nestedValue(response, ['thread_ts'])
    ),
    messageTs: firstString(
      nestedValue(response, ['data', 'ts']),
      nestedValue(response, ['ts'])
    ),
    text: firstString(
      args.text,
      nestedValue(response, ['data', 'text']),
      nestedValue(response, ['text'])
    ),
  } satisfies SlackMemoryEventInput
}

function firstString(...values: unknown[]) {
  for (const value of values) {
    if (typeof value === 'string' && value.trim().length > 0) {
      return value.trim()
    }
  }

  return null
}

function nestedValue(
  record: Record<string, unknown>,
  path: string[]
): unknown {
  let current: unknown = record

  for (const key of path) {
    if (!current || typeof current !== 'object') return null
    current = (current as Record<string, unknown>)[key]
  }

  return current
}
