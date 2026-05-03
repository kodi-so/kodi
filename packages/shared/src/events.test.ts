import { describe, expect, test } from 'bun:test'
import {
  EVENT_KINDS,
  EventEnvelopeParseError,
  EventEnvelopeSchema,
  EventKindSchema,
  KODI_BRIDGE_PROTOCOL,
  PayloadByKind,
  parseEnvelope,
  type EventEnvelope,
} from './events'

const INSTANCE_ID = '11111111-1111-4111-8111-111111111111'
const ORG_ID = '22222222-2222-4222-8222-222222222222'
const AGENT_ID = '33333333-3333-4333-8333-333333333333'
const USER_ID = '44444444-4444-4444-8444-444444444444'
const IDEM_KEY = '55555555-5555-4555-8555-555555555555'

function validEnvelope(overrides: Partial<EventEnvelope> = {}): EventEnvelope {
  return {
    protocol: KODI_BRIDGE_PROTOCOL,
    plugin_version: '2026-04-21-abc1234',
    instance: { instance_id: INSTANCE_ID, org_id: ORG_ID },
    event: {
      kind: 'plugin.started',
      verbosity: 'summary',
      occurred_at: '2026-04-21T10:23:41.123Z',
      idempotency_key: IDEM_KEY,
      payload: { pid: 1234, started_at: '2026-04-21T10:23:41.123Z' },
    },
    ...overrides,
  }
}

describe('EventKindSchema and EVENT_KINDS', () => {
  test('every catalog kind from spec § 4.1 is present', () => {
    const expected = [
      'plugin.started',
      'plugin.degraded',
      'plugin.recovered',
      'plugin.update_check',
      'plugin.update_attempted',
      'plugin.update_succeeded',
      'plugin.update_failed',
      'plugin.update_rolled_back',
      'heartbeat',
      'agent.provisioned',
      'agent.deprovisioned',
      'agent.failed',
      'agent.bootstrap',
      'message.received',
      'message.sent',
      'session.compact.after',
      'session.ended',
      'tool.invoke.before',
      'tool.invoke.after',
      'tool.denied',
      'tool.approval_requested',
      'tool.approval_resolved',
      'tool.approval_timeout',
      'composio.session_failed',
      'composio.session_rotated',
    ] as const

    for (const kind of expected) {
      expect(EVENT_KINDS).toContain(kind)
    }
    expect(EVENT_KINDS.length).toBe(expected.length)
  })

  test('PayloadByKind has an entry for every kind', () => {
    for (const kind of EVENT_KINDS) {
      expect(PayloadByKind[kind]).toBeDefined()
    }
  })

  test('rejects an unknown kind', () => {
    const result = EventKindSchema.safeParse('plugin.exploded')
    expect(result.success).toBe(false)
  })
})

describe('parseEnvelope', () => {
  test('parses a valid envelope without an agent context', () => {
    const env = parseEnvelope(validEnvelope())
    expect(env.protocol).toBe(KODI_BRIDGE_PROTOCOL)
    expect(env.event.kind).toBe('plugin.started')
    expect(env.agent).toBeUndefined()
  })

  test('parses a valid envelope with an agent context', () => {
    const env = parseEnvelope(
      validEnvelope({
        agent: {
          agent_id: AGENT_ID,
          openclaw_agent_id: 'oc-agent-abc',
          user_id: USER_ID,
        },
        event: {
          kind: 'tool.invoke.after',
          verbosity: 'full',
          occurred_at: '2026-04-21T10:23:41.123Z',
          idempotency_key: IDEM_KEY,
          payload: { tool_name: 'github.create_issue', duration_ms: 42, outcome: 'ok' },
        },
      }),
    )
    expect(env.agent?.openclaw_agent_id).toBe('oc-agent-abc')
    expect(env.event.kind).toBe('tool.invoke.after')
  })

  test('rejects when protocol is wrong', () => {
    expect(() => parseEnvelope({ ...validEnvelope(), protocol: 'kodi-bridge.v0' })).toThrow(
      EventEnvelopeParseError,
    )
  })

  test('rejects when plugin_version is missing', () => {
    const { plugin_version: _drop, ...rest } = validEnvelope()
    expect(() => parseEnvelope(rest)).toThrow(EventEnvelopeParseError)
  })

  test('rejects when instance is missing', () => {
    const { instance: _drop, ...rest } = validEnvelope()
    expect(() => parseEnvelope(rest)).toThrow(EventEnvelopeParseError)
  })

  test('rejects when event.kind is unknown', () => {
    const env = validEnvelope()
    expect(() =>
      parseEnvelope({
        ...env,
        event: { ...env.event, kind: 'plugin.exploded' as never },
      }),
    ).toThrow(EventEnvelopeParseError)
  })

  test('rejects when event.idempotency_key is not a uuid', () => {
    const env = validEnvelope()
    expect(() =>
      parseEnvelope({ ...env, event: { ...env.event, idempotency_key: 'not-a-uuid' } }),
    ).toThrow(EventEnvelopeParseError)
  })

  test('rejects when event.occurred_at is not ISO datetime', () => {
    const env = validEnvelope()
    expect(() =>
      parseEnvelope({ ...env, event: { ...env.event, occurred_at: '2026-04-21' } }),
    ).toThrow(EventEnvelopeParseError)
  })

  test('rejects when verbosity is not summary or full', () => {
    const env = validEnvelope()
    expect(() =>
      parseEnvelope({ ...env, event: { ...env.event, verbosity: 'verbose' as never } }),
    ).toThrow(EventEnvelopeParseError)
  })

  test('attaches zod issues to the thrown error for diagnostics', () => {
    try {
      parseEnvelope({})
      throw new Error('expected parseEnvelope to throw')
    } catch (err) {
      expect(err).toBeInstanceOf(EventEnvelopeParseError)
      expect((err as EventEnvelopeParseError).issues.length).toBeGreaterThan(0)
    }
  })

  test('round-trips through JSON serialization', () => {
    const env = validEnvelope()
    const round = parseEnvelope(JSON.parse(JSON.stringify(env)))
    expect(round).toEqual(env)
  })
})

describe('EventEnvelopeSchema', () => {
  test('exposes the same parser as parseEnvelope', () => {
    const env = validEnvelope()
    const parsed = EventEnvelopeSchema.parse(env)
    expect(parsed).toEqual(env)
  })
})
