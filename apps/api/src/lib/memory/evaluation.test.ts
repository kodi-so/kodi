import { describe, expect, it } from 'bun:test'
import {
  evaluateMemoryUpdateEvent,
  type MemoryEvaluationDeps,
} from './evaluation'
import { normalizeMemoryUpdateEvent } from './events'

type MemoryCompletionFn = NonNullable<MemoryEvaluationDeps['completeChat']>
type MemoryCompletionResult = Awaited<ReturnType<MemoryCompletionFn>>
type MemoryCompletionFailure = Extract<MemoryCompletionResult, { ok: false }>
type MemoryCompletionSuccessPayload = Record<string, unknown> | string

function createModelCompletion(
  payload:
    | MemoryCompletionSuccessPayload
    | MemoryCompletionFailure
): MemoryCompletionFn {
  return async () => {
    if (isFailurePayload(payload)) {
      return payload
    }

    return {
      ok: true as const,
      content:
        typeof payload === 'string' ? payload : JSON.stringify(payload),
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
    } satisfies Extract<MemoryCompletionResult, { ok: true }>
  }
}

function isFailurePayload(
  payload: MemoryCompletionSuccessPayload | MemoryCompletionFailure
): payload is MemoryCompletionFailure {
  return typeof payload === 'object' && payload !== null && 'ok' in payload
}

describe('evaluateMemoryUpdateEvent', () => {
  it('routes explicit private preferences to member memory', async () => {
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

    const evaluation = await evaluateMemoryUpdateEvent(event, {
      completeChat: createModelCompletion({
        shouldWrite: true,
        scope: 'member',
        action: 'update_existing',
        durability: 'durable',
        confidence: 'high',
        memoryKind: 'preference',
        rationale: ['The user stated a durable personal preference.'],
        signalTags: ['personal_preference'],
      }),
    })

    expect(evaluation.shouldWrite).toBe(true)
    expect(evaluation.scope).toBe('member')
    expect(evaluation.memoryKind).toBe('preference')
    expect(evaluation.signalTags).toContain('personal_preference')
    expect(evaluation.guardrailsApplied).toEqual([])
  })

  it('routes shared decisions and next steps to org memory', async () => {
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

    const evaluation = await evaluateMemoryUpdateEvent(event, {
      completeChat: createModelCompletion({
        shouldWrite: true,
        scope: 'org',
        action: 'update_existing',
        durability: 'durable',
        confidence: 'high',
        memoryKind: 'decision',
        rationale: ['The event contains a team decision and ownership update.'],
        signalTags: ['decision', 'owner_change', 'project_state'],
      }),
    })

    expect(evaluation.shouldWrite).toBe(true)
    expect(evaluation.scope).toBe('org')
    expect(evaluation.signalTags).toEqual(
      expect.arrayContaining(['decision', 'owner_change', 'project_state'])
    )
  })

  it('allows both scopes when a shared event explicitly justifies personal memory', async () => {
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
        userMessage:
          'We agreed to send the customer recap tomorrow, and I want Kodi to remember that I prefer drafting the follow-up myself.',
      },
      payload: {
        threadId: 'thread_123',
        messageId: 'message_123',
      },
    })

    const evaluation = await evaluateMemoryUpdateEvent(event, {
      completeChat: createModelCompletion({
        shouldWrite: true,
        scope: 'both',
        action: 'update_existing',
        durability: 'durable',
        confidence: 'medium',
        memoryKind: 'responsibility',
        rationale: [
          'The event includes both a shared org commitment and a durable personal working preference.',
        ],
        signalTags: ['customer_follow_up', 'personal_preference'],
        memberScopeJustification:
          'The actor expressed a durable personal preference about how they want future follow-up handled.',
      }),
    })

    expect(evaluation.shouldWrite).toBe(true)
    expect(evaluation.scope).toBe('both')
    expect(evaluation.guardrailsApplied).toEqual([])
  })

  it('blocks member-only scope on a shared event without explicit justification', async () => {
    const event = normalizeMemoryUpdateEvent({
      orgId: 'org_123',
      source: 'app_chat',
      occurredAt: '2026-05-01T10:00:00.000Z',
      visibility: 'shared',
      summary: 'Shared app chat thread received a new assistant turn.',
      actor: {
        userId: 'user_123',
      },
      metadata: {
        userMessage: 'I prefer async recaps.',
      },
      payload: {
        threadId: 'thread_123',
        messageId: 'message_123',
      },
    })

    const evaluation = await evaluateMemoryUpdateEvent(event, {
      completeChat: createModelCompletion({
        shouldWrite: true,
        scope: 'member',
        action: 'update_existing',
        durability: 'durable',
        confidence: 'medium',
        memoryKind: 'preference',
        rationale: ['The event contains a personal preference.'],
        signalTags: ['personal_preference'],
      }),
    })

    expect(evaluation.shouldWrite).toBe(false)
    expect(evaluation.scope).toBe('none')
    expect(evaluation.ignoredReason).toBe('guardrail-blocked')
    expect(evaluation.guardrailsApplied).toEqual([
      'Blocked member-only scope for a shared or system event without explicit justification.',
    ])
  })

  it('fails closed when the model response is invalid JSON', async () => {
    const event = normalizeMemoryUpdateEvent({
      orgId: 'org_123',
      source: 'app_chat',
      occurredAt: '2026-05-01T10:00:00.000Z',
      visibility: 'shared',
      summary: 'Shared app chat thread received a new assistant turn.',
      payload: {
        threadId: 'thread_123',
        messageId: 'message_123',
      },
    })

    const evaluation = await evaluateMemoryUpdateEvent(event, {
      completeChat: createModelCompletion('not json'),
    })

    expect(evaluation.shouldWrite).toBe(false)
    expect(evaluation.engine).toBe('guardrail-fallback')
    expect(evaluation.ignoredReason).toBe('invalid-model-response')
  })

  it('fails closed when OpenClaw is unavailable', async () => {
    const event = normalizeMemoryUpdateEvent({
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

    const evaluation = await evaluateMemoryUpdateEvent(event, {
      completeChat: createModelCompletion({
        ok: false,
        reason: 'request-failed',
        error: 'OpenClaw request timed out after 12000ms.',
      }),
    })

    expect(evaluation.shouldWrite).toBe(false)
    expect(evaluation.ignoredReason).toBe('model-unavailable')
    expect(evaluation.durability).toBe('unknown')
  })
})
