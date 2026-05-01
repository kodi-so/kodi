import { describe, expect, it } from 'bun:test'
import { evaluateMemoryUpdateEvent } from './evaluation'
import { normalizeMemoryUpdateEvent } from './events'

describe('evaluateMemoryUpdateEvent', () => {
  it('routes explicit private preferences to member memory', () => {
    const event = normalizeMemoryUpdateEvent({
      orgId: 'org_123',
      source: 'dashboard_assistant',
      occurredAt: '2026-05-01T10:00:00.000Z',
      visibility: 'private',
      summary: 'Dashboard assistant thread received a new assistant turn.',
      actor: {
        userId: 'user_123',
        orgMemberId: 'org_member_123',
      },
      metadata: {
        userMessage: 'Remember that I prefer async recaps.',
        assistantMessage: 'Noted. I will favor async recaps for you.',
      },
      payload: {
        threadId: 'thread_123',
        messageId: 'message_123',
      },
    })

    const evaluation = evaluateMemoryUpdateEvent(event)

    expect(evaluation.shouldWrite).toBe(true)
    expect(evaluation.scope).toBe('member')
    expect(evaluation.signalTags).toContain('preference')
  })

  it('routes shared decisions and next steps to org memory', () => {
    const event = normalizeMemoryUpdateEvent({
      orgId: 'org_123',
      source: 'app_chat',
      occurredAt: '2026-05-01T10:00:00.000Z',
      visibility: 'shared',
      summary: 'Shared app chat thread received a new assistant turn.',
      actor: {
        userId: 'user_123',
        orgMemberId: 'org_member_123',
      },
      metadata: {
        userMessage: 'We decided to move the launch checklist into the roadmap and Maya owns the follow-up.',
        assistantMessage: 'I can capture the team decision and owner change.',
      },
      payload: {
        threadId: 'thread_123',
        messageId: 'message_123',
      },
    })

    const evaluation = evaluateMemoryUpdateEvent(event)

    expect(evaluation.shouldWrite).toBe(true)
    expect(evaluation.scope).toBe('org')
    expect(evaluation.signalTags).toEqual(
      expect.arrayContaining(['decision', 'next_steps', 'project_state'])
    )
  })

  it('routes mixed shared and personal commitments to both scopes', () => {
    const event = normalizeMemoryUpdateEvent({
      orgId: 'org_123',
      source: 'slack',
      occurredAt: '2026-05-01T10:00:00.000Z',
      visibility: 'private',
      summary: 'Slack direct-message activity changed through Kodi.',
      actor: {
        userId: 'user_123',
        orgMemberId: 'org_member_123',
      },
      metadata: {
        text: 'We decided to send the customer recap tomorrow, and I prefer to own the async follow-up myself.',
      },
      payload: {
        channelId: 'D123',
        isDirectMessage: true,
      },
    })

    const evaluation = evaluateMemoryUpdateEvent(event)

    expect(evaluation.shouldWrite).toBe(true)
    expect(evaluation.scope).toBe('both')
  })

  it('ignores transient chatter', () => {
    const event = normalizeMemoryUpdateEvent({
      orgId: 'org_123',
      source: 'app_chat',
      occurredAt: '2026-05-01T10:00:00.000Z',
      visibility: 'shared',
      summary: 'Shared app chat thread received a new assistant turn.',
      metadata: {
        userMessage: 'Thanks, sounds good.',
        assistantMessage: 'Happy to help.',
      },
      payload: {
        threadId: 'thread_123',
        messageId: 'message_123',
      },
    })

    const evaluation = evaluateMemoryUpdateEvent(event)

    expect(evaluation.shouldWrite).toBe(false)
    expect(evaluation.scope).toBe('none')
    expect(evaluation.action).toBe('ignore')
  })

  it('ignores temporary meeting state-change events but keeps meeting completion durable', () => {
    const stateChange = evaluateMemoryUpdateEvent(
      normalizeMemoryUpdateEvent({
        orgId: 'org_123',
        source: 'meeting',
        occurredAt: '2026-05-01T10:00:00.000Z',
        visibility: 'shared',
        summary: 'Meeting started.',
        payload: {
          meetingSessionId: 'meeting_123',
          trigger: 'state_changed',
        },
      })
    )

    const completed = evaluateMemoryUpdateEvent(
      normalizeMemoryUpdateEvent({
        orgId: 'org_123',
        source: 'meeting',
        occurredAt: '2026-05-01T10:30:00.000Z',
        visibility: 'shared',
        summary: 'Meeting completed.',
        payload: {
          meetingSessionId: 'meeting_123',
          trigger: 'completed',
        },
      })
    )

    expect(stateChange.shouldWrite).toBe(false)
    expect(completed.shouldWrite).toBe(true)
    expect(completed.scope).toBe('org')
  })
})
