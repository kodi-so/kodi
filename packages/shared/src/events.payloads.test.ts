import { describe, expect, test } from 'bun:test'
import {
  EventEnvelopeParseError,
  EVENT_KINDS,
  KODI_BRIDGE_PROTOCOL,
  PayloadByKind,
  parseEnvelope,
  type EventEnvelope,
  type EventKind,
  type Verbosity,
} from './events'

const INSTANCE_ID = '11111111-1111-4111-8111-111111111111'
const ORG_ID = '22222222-2222-4222-8222-222222222222'
const AGENT_ID = '33333333-3333-4333-8333-333333333333'
const USER_ID = '44444444-4444-4444-8444-444444444444'
const REQUEST_ID = '55555555-5555-4555-8555-555555555555'
const IDEM_KEY = '66666666-6666-4666-8666-666666666666'
const ISO = '2026-04-21T10:23:41.123Z'

function envelopeFor(
  kind: EventKind,
  payload: unknown,
  verbosity: Verbosity = 'summary',
): EventEnvelope {
  return {
    protocol: KODI_BRIDGE_PROTOCOL,
    plugin_version: '2026-04-21-abc1234',
    instance: { instance_id: INSTANCE_ID, org_id: ORG_ID },
    agent: {
      agent_id: AGENT_ID,
      openclaw_agent_id: 'oc-agent-abc',
      user_id: USER_ID,
    },
    event: {
      kind,
      verbosity,
      occurred_at: ISO,
      idempotency_key: IDEM_KEY,
      payload,
    },
  } as EventEnvelope
}

const validPayloads: Record<EventKind, unknown> = {
  'plugin.started': { pid: 1234, started_at: ISO },
  'plugin.degraded': { reason: 'kodi unreachable', since: ISO },
  'plugin.recovered': { since: ISO },
  'plugin.update_check': {
    current_version: '2026-04-21-abc1234',
    latest_version: '2026-04-22-def5678',
  },
  'plugin.update_attempted': {
    from_version: '2026-04-21-abc1234',
    to_version: '2026-04-22-def5678',
  },
  'plugin.update_succeeded': {
    from_version: '2026-04-21-abc1234',
    to_version: '2026-04-22-def5678',
  },
  'plugin.update_failed': {
    from_version: '2026-04-21-abc1234',
    to_version: '2026-04-22-def5678',
    error: 'sha256 mismatch',
  },
  'plugin.update_rolled_back': {
    from_version: '2026-04-22-def5678',
    to_version: '2026-04-21-abc1234',
    error: 'health check failed',
  },
  heartbeat: { uptime_s: 3600, agent_count: 4 },
  'agent.provisioned': {
    user_id: USER_ID,
    openclaw_agent_id: 'oc-agent-abc',
    composio_status: 'connected',
  },
  'agent.deprovisioned': { user_id: USER_ID, openclaw_agent_id: 'oc-agent-abc' },
  'agent.failed': { user_id: USER_ID, error: 'composio session creation failed' },
  'agent.bootstrap': { session_key: 'sess-1' },
  'message.received': { session_key: 'sess-1', content_summary: '12 chars', speaker: 'user' },
  'message.sent': { session_key: 'sess-1', content_summary: '20 chars', speaker: 'assistant' },
  'session.compact.after': {
    session_key: 'sess-1',
    before_tokens: 12_000,
    after_tokens: 4_000,
  },
  'session.ended': { session_key: 'sess-1', duration_s: 480 },
  'tool.invoke.before': {
    tool_name: 'github.create_issue',
    args_summary: '{"title":"..."}',
    session_key: 'sess-1',
  },
  'tool.invoke.after': {
    tool_name: 'github.create_issue',
    duration_ms: 412,
    outcome: 'ok',
  },
  'tool.denied': {
    tool_name: 'github.create_issue',
    reason: 'autonomy strict',
    policy_level: 'strict',
  },
  'tool.approval_requested': {
    request_id: REQUEST_ID,
    tool_name: 'github.create_issue',
    args: { title: 'hi' },
    session_key: 'sess-1',
    policy_level: 'normal',
  },
  'tool.approval_resolved': { request_id: REQUEST_ID, approved: true },
  'tool.approval_timeout': { request_id: REQUEST_ID },
  'composio.session_failed': { user_id: USER_ID, error: 'OAuth expired' },
  'composio.session_rotated': { user_id: USER_ID },
}

describe('PayloadByKind — every kind has a strict schema', () => {
  for (const kind of EVENT_KINDS) {
    test(`accepts a valid ${kind} payload`, () => {
      const result = PayloadByKind[kind]!.safeParse(validPayloads[kind])
      expect(result.success).toBe(true)
    })
  }

  test('rejects extra unknown fields are passed through (lenient)', () => {
    // We use plain z.object — by default extra props are stripped, not rejected.
    const parsed = PayloadByKind['plugin.started']!.parse({
      pid: 1,
      started_at: ISO,
      garbage: 'ignored',
    })
    expect(parsed).toEqual({ pid: 1, started_at: ISO })
  })

  test('rejects when a required field is missing', () => {
    const result = PayloadByKind['plugin.started']!.safeParse({ pid: 1 })
    expect(result.success).toBe(false)
  })

  test('tool.invoke.after rejects an outcome other than ok|error', () => {
    const result = PayloadByKind['tool.invoke.after']!.safeParse({
      tool_name: 't',
      duration_ms: 1,
      outcome: 'maybe',
    })
    expect(result.success).toBe(false)
  })

  test('tool.denied rejects an unknown policy_level', () => {
    const result = PayloadByKind['tool.denied']!.safeParse({
      tool_name: 't',
      reason: 'r',
      policy_level: 'paranoid',
    })
    expect(result.success).toBe(false)
  })
})

describe('verbosity coupling', () => {
  test('message.received summary parses without content', () => {
    const env = envelopeFor(
      'message.received',
      { session_key: 'sess-1', content_summary: '6 chars', speaker: 'user' },
      'summary',
    )
    expect(parseEnvelope(env).event.kind).toBe('message.received')
  })

  test('message.received summary rejects when content is present', () => {
    const env = envelopeFor(
      'message.received',
      {
        session_key: 'sess-1',
        content_summary: '6 chars',
        speaker: 'user',
        content: 'hello!',
      },
      'summary',
    )
    expect(() => parseEnvelope(env)).toThrow(EventEnvelopeParseError)
  })

  test('message.received full rejects when content is missing', () => {
    const env = envelopeFor(
      'message.received',
      { session_key: 'sess-1', content_summary: '6 chars', speaker: 'user' },
      'full',
    )
    expect(() => parseEnvelope(env)).toThrow(EventEnvelopeParseError)
  })

  test('message.received full parses when content is present', () => {
    const env = envelopeFor(
      'message.received',
      {
        session_key: 'sess-1',
        content_summary: '6 chars',
        speaker: 'user',
        content: 'hello!',
      },
      'full',
    )
    expect(parseEnvelope(env).event.kind).toBe('message.received')
  })

  test('message.sent obeys the same verbosity rule', () => {
    const summaryOk = envelopeFor(
      'message.sent',
      { session_key: 'sess-1', content_summary: '20 chars', speaker: 'assistant' },
      'summary',
    )
    expect(parseEnvelope(summaryOk).event.kind).toBe('message.sent')

    const fullMissing = envelopeFor(
      'message.sent',
      { session_key: 'sess-1', content_summary: '20 chars', speaker: 'assistant' },
      'full',
    )
    expect(() => parseEnvelope(fullMissing)).toThrow(EventEnvelopeParseError)
  })

  test('tool.invoke.before summary rejects when args is present', () => {
    const env = envelopeFor(
      'tool.invoke.before',
      {
        tool_name: 't',
        args_summary: '{...}',
        args: { hi: 1 },
        session_key: 'sess-1',
      },
      'summary',
    )
    expect(() => parseEnvelope(env)).toThrow(EventEnvelopeParseError)
  })

  test('tool.invoke.before full rejects when args is missing', () => {
    const env = envelopeFor(
      'tool.invoke.before',
      { tool_name: 't', args_summary: '{...}', session_key: 'sess-1' },
      'full',
    )
    expect(() => parseEnvelope(env)).toThrow(EventEnvelopeParseError)
  })

  test('tool.invoke.before full parses when args is present', () => {
    const env = envelopeFor(
      'tool.invoke.before',
      {
        tool_name: 't',
        args_summary: '{...}',
        args: { hi: 1 },
        session_key: 'sess-1',
      },
      'full',
    )
    expect(parseEnvelope(env).event.kind).toBe('tool.invoke.before')
  })

  test('kinds without verbosity coupling parse the same in both verbosities', () => {
    const summary = envelopeFor('heartbeat', { uptime_s: 1, agent_count: 0 }, 'summary')
    const full = envelopeFor('heartbeat', { uptime_s: 1, agent_count: 0 }, 'full')
    expect(parseEnvelope(summary).event.verbosity).toBe('summary')
    expect(parseEnvelope(full).event.verbosity).toBe('full')
  })
})

describe('payload errors propagate through parseEnvelope with prefixed path', () => {
  test('plugin.started missing pid surfaces under event.payload.pid', () => {
    const env = envelopeFor('plugin.started', { started_at: ISO })
    try {
      parseEnvelope(env)
      throw new Error('expected to throw')
    } catch (err) {
      expect(err).toBeInstanceOf(EventEnvelopeParseError)
      const issue = (err as EventEnvelopeParseError).issues.find((i) =>
        i.path.join('.').endsWith('payload.pid'),
      )
      expect(issue).toBeDefined()
    }
  })

  test('agent.provisioned with non-uuid user_id is rejected', () => {
    const env = envelopeFor('agent.provisioned', {
      user_id: 'not-a-uuid',
      openclaw_agent_id: 'oc',
      composio_status: 'connected',
    })
    expect(() => parseEnvelope(env)).toThrow(EventEnvelopeParseError)
  })
})
