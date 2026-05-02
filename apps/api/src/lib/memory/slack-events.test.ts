import { describe, expect, it } from 'bun:test'
import {
  buildSlackMemoryUpdateEvent,
  emitSlackMemoryUpdateEvent,
  resolveSlackMemoryEventInput,
} from './slack-events'

describe('buildSlackMemoryUpdateEvent', () => {
  it('builds a shared Slack channel event', () => {
    const event = buildSlackMemoryUpdateEvent({
      orgId: 'org_123',
      actorUserId: 'user_123',
      visibility: 'shared',
      action: 'SLACK_SEND_MESSAGE',
      sourceType: 'meeting',
      sourceId: 'meeting_123',
      channelId: 'C123',
      threadTs: '1714490000.1000',
      messageTs: '1714490001.1000',
      text: 'Meeting recap',
    })

    expect(event).toMatchObject({
      orgId: 'org_123',
      source: 'slack',
      visibility: 'shared',
      summary: 'Slack channel activity changed through Kodi.',
      actor: {
        userId: 'user_123',
      },
      payload: {
        channelId: 'C123',
        threadTs: '1714490000.1000',
        messageTs: '1714490001.1000',
        isDirectMessage: false,
      },
    })
  })

  it('marks DM-style channels as direct messages', () => {
    const event = buildSlackMemoryUpdateEvent({
      orgId: 'org_123',
      actorUserId: 'user_123',
      visibility: 'private',
      action: 'SLACK_SEND_MESSAGE',
      sourceType: 'chat',
      channelId: 'D123',
    })

    expect(event.visibility).toBe('private')
    expect(event.payload.isDirectMessage).toBe(true)
  })
})

describe('resolveSlackMemoryEventInput', () => {
  it('extracts Slack metadata from tool arguments and responses', () => {
    const input = resolveSlackMemoryEventInput({
      orgId: 'org_123',
      actorUserId: 'user_123',
      visibility: 'shared',
      action: 'SLACK_SEND_MESSAGE',
      sourceType: 'chat',
      sourceId: 'message_123',
      argumentsPayload: {
        channel: 'C123',
        text: 'Hello Slack',
        thread_ts: '1714490000.1000',
      },
      responsePayload: {
        data: {
          ts: '1714490001.1000',
        },
      },
    })

    expect(input).toMatchObject({
      orgId: 'org_123',
      actorUserId: 'user_123',
      visibility: 'shared',
      sourceType: 'chat',
      sourceId: 'message_123',
      channelId: 'C123',
      threadTs: '1714490000.1000',
      messageTs: '1714490001.1000',
      text: 'Hello Slack',
    })
  })

  it('ignores non-message Slack actions', () => {
    expect(
      resolveSlackMemoryEventInput({
        orgId: 'org_123',
        actorUserId: 'user_123',
        visibility: 'shared',
        action: 'SLACK_LIST_CHANNELS',
        sourceType: 'chat',
      })
    ).toBeNull()
  })
})

describe('emitSlackMemoryUpdateEvent', () => {
  it('passes the Slack event to the shared scheduler', async () => {
    const seen: unknown[] = []

    const event = await emitSlackMemoryUpdateEvent(
      {
        orgId: 'org_123',
        actorUserId: 'user_123',
        visibility: 'shared',
        action: 'SLACK_SEND_MESSAGE',
        sourceType: 'meeting',
        sourceId: 'meeting_123',
        channelId: 'C123',
      },
      async (memoryEvent) => {
        seen.push(memoryEvent)
      }
    )

    expect(seen).toHaveLength(1)
    expect(event.source).toBe('slack')
  })
})
