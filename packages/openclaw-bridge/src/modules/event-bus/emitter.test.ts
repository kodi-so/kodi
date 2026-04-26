import { describe, expect, test } from 'bun:test'
import {
  EventEnvelopeSchema,
  KODI_BRIDGE_PROTOCOL,
} from '@kodi/shared/events'
import { createEmitter, resolveSubscription, type Subscriptions } from './emitter'
import { KodiClientError, type KodiClient } from '../bridge-core/kodi-client'
import type { Identity } from '../bridge-core/identity'

const IDENTITY: Identity = {
  instance_id: '11111111-1111-4111-8111-111111111111',
  org_id: '22222222-2222-4222-8222-222222222222',
  plugin_version: '2026-04-21-abc1234',
}

const FIXED_NOW = 1_750_000_000_000
const FIXED_KEY = '99999999-9999-4999-8999-999999999999'

type Capture = {
  calls: Array<{ path: string; init: unknown }>
  client: KodiClient
}

function captureClient(opts?: {
  status?: number
  throwError?: Error
  bodyText?: string
}): Capture {
  const calls: Array<{ path: string; init: unknown }> = []
  const client: KodiClient = {
    signedFetch: async (path, init) => {
      calls.push({ path, init })
      if (opts?.throwError) throw opts.throwError
      const status = opts?.status ?? 202
      if (status >= 400) {
        throw new KodiClientError(status, opts?.bodyText ?? '')
      }
      return new Response('', { status })
    },
  }
  return { calls, client }
}

function silentLogger() {
  const messages: string[] = []
  return {
    log: (...args: unknown[]) => messages.push(args.map(String).join(' ')),
    warn: (...args: unknown[]) => messages.push(args.map(String).join(' ')),
    messages,
  }
}

const DEFAULT_SUBS: Subscriptions = {
  'plugin.*': { enabled: true, verbosity: 'summary' },
  'message.*': { enabled: true, verbosity: 'summary' },
  'tool.*': { enabled: true, verbosity: 'summary' },
  'tool.invoke.after': { enabled: true, verbosity: 'full' },
  heartbeat: { enabled: false, verbosity: 'summary' },
}

describe('resolveSubscription', () => {
  test('exact match wins over prefix match', () => {
    expect(resolveSubscription('tool.invoke.after', DEFAULT_SUBS)).toEqual({
      enabled: true,
      verbosity: 'full',
    })
  })

  test('prefix match catches kinds without an exact entry', () => {
    expect(resolveSubscription('tool.denied', DEFAULT_SUBS)).toEqual({
      enabled: true,
      verbosity: 'summary',
    })
  })

  test('disabled exact match drops the kind', () => {
    expect(resolveSubscription('heartbeat', DEFAULT_SUBS)).toEqual({
      enabled: false,
      verbosity: 'summary',
    })
  })

  test('returns disabled fallback when no entry matches', () => {
    expect(resolveSubscription('composio.session_failed', DEFAULT_SUBS)).toEqual({
      enabled: false,
      verbosity: 'summary',
    })
  })

  test('longer prefix wins over shorter prefix', () => {
    const subs: Subscriptions = {
      'plugin.*': { enabled: true, verbosity: 'summary' },
      'plugin.update.*': { enabled: true, verbosity: 'full' },
    }
    expect(resolveSubscription('plugin.update_failed' as never, subs).verbosity).toBe(
      'summary',
    )
    expect(resolveSubscription('plugin.update.something' as never, subs).verbosity).toBe(
      'full',
    )
  })
})

describe('createEmitter — envelope construction', () => {
  test('emits a valid canonical envelope and POSTs to /api/openclaw/events', async () => {
    const { client, calls } = captureClient()
    const emitter = createEmitter({
      kodiClient: client,
      identity: IDENTITY,
      subscriptions: () => DEFAULT_SUBS,
      now: () => FIXED_NOW,
      idempotencyKeyFactory: () => FIXED_KEY,
    })

    await emitter.emit('plugin.started', { pid: 1234, started_at: new Date(FIXED_NOW).toISOString() })

    expect(calls).toHaveLength(1)
    const call = calls[0]!
    expect(call.path).toBe('/api/openclaw/events')
    const body = (call.init as { body: unknown }).body as Record<string, unknown>
    expect(body.protocol).toBe(KODI_BRIDGE_PROTOCOL)
    expect(body.plugin_version).toBe(IDENTITY.plugin_version)
    expect(body.instance).toEqual({
      instance_id: IDENTITY.instance_id,
      org_id: IDENTITY.org_id,
    })
    expect((body.event as Record<string, unknown>).kind).toBe('plugin.started')
    expect((body.event as Record<string, unknown>).verbosity).toBe('summary')
    expect((body.event as Record<string, unknown>).idempotency_key).toBe(FIXED_KEY)
  })

  test('produces an envelope that round-trips through the canonical schema', async () => {
    const { client, calls } = captureClient()
    const emitter = createEmitter({
      kodiClient: client,
      identity: IDENTITY,
      subscriptions: () => DEFAULT_SUBS,
      now: () => FIXED_NOW,
      idempotencyKeyFactory: () => FIXED_KEY,
    })

    await emitter.emit('plugin.started', { pid: 1, started_at: new Date(FIXED_NOW).toISOString() })

    const body = (calls[0]!.init as { body: unknown }).body
    expect(() => EventEnvelopeSchema.parse(body)).not.toThrow()
  })

  test('attaches the agent context when supplied', async () => {
    const { client, calls } = captureClient()
    const emitter = createEmitter({
      kodiClient: client,
      identity: IDENTITY,
      subscriptions: () => DEFAULT_SUBS,
      now: () => FIXED_NOW,
      idempotencyKeyFactory: () => FIXED_KEY,
    })

    await emitter.emit(
      'tool.invoke.after',
      { tool_name: 't', duration_ms: 1, outcome: 'ok' },
      {
        agent: {
          agent_id: '33333333-3333-4333-8333-333333333333',
          openclaw_agent_id: 'oc-1',
          user_id: '44444444-4444-4444-8444-444444444444',
        },
      },
    )

    const body = (calls[0]!.init as { body: unknown }).body as Record<string, unknown>
    expect((body.agent as Record<string, unknown>).openclaw_agent_id).toBe('oc-1')
    expect((body.event as Record<string, unknown>).verbosity).toBe('full')
  })
})

describe('createEmitter — subscription gating', () => {
  test('disabled subscription drops the emit (no fetch call)', async () => {
    const { client, calls } = captureClient()
    const emitter = createEmitter({
      kodiClient: client,
      identity: IDENTITY,
      subscriptions: () => ({
        ...DEFAULT_SUBS,
        'plugin.*': { enabled: false, verbosity: 'summary' },
      }),
      now: () => FIXED_NOW,
      idempotencyKeyFactory: () => FIXED_KEY,
    })

    await emitter.emit('plugin.started', { pid: 1, started_at: new Date(FIXED_NOW).toISOString() })

    expect(calls).toHaveLength(0)
  })

  test('subscription holder is re-read on every emit', async () => {
    const { client, calls } = captureClient()
    let subs: Subscriptions = {
      'plugin.*': { enabled: false, verbosity: 'summary' },
    }
    const emitter = createEmitter({
      kodiClient: client,
      identity: IDENTITY,
      subscriptions: () => subs,
      now: () => FIXED_NOW,
      idempotencyKeyFactory: () => FIXED_KEY,
    })

    await emitter.emit('plugin.started', { pid: 1, started_at: new Date(FIXED_NOW).toISOString() })
    expect(calls).toHaveLength(0)

    subs = { 'plugin.*': { enabled: true, verbosity: 'summary' } }
    await emitter.emit('plugin.started', { pid: 1, started_at: new Date(FIXED_NOW).toISOString() })
    expect(calls).toHaveLength(1)
  })
})

describe('createEmitter — failure handling', () => {
  test('5xx (after retries) without outbox logs a warning and resolves', async () => {
    const logger = silentLogger()
    const { client } = captureClient({ throwError: new KodiClientError(503, '') })
    const emitter = createEmitter({
      kodiClient: client,
      identity: IDENTITY,
      subscriptions: () => DEFAULT_SUBS,
      now: () => FIXED_NOW,
      idempotencyKeyFactory: () => FIXED_KEY,
      logger,
    })

    await emitter.emit('plugin.started', { pid: 1, started_at: new Date(FIXED_NOW).toISOString() })

    expect(logger.messages.some((m) => m.includes('event emit failed'))).toBe(true)
  })

  test('5xx with an outbox pushes the envelope and does not log an error', async () => {
    const logger = silentLogger()
    const pushed: unknown[] = []
    const { client } = captureClient({ throwError: new KodiClientError(503, '') })
    const emitter = createEmitter({
      kodiClient: client,
      identity: IDENTITY,
      subscriptions: () => DEFAULT_SUBS,
      outbox: { push: (env) => pushed.push(env) },
      now: () => FIXED_NOW,
      idempotencyKeyFactory: () => FIXED_KEY,
      logger,
    })

    await emitter.emit('plugin.started', { pid: 1, started_at: new Date(FIXED_NOW).toISOString() })

    expect(pushed).toHaveLength(1)
    expect(logger.messages.some((m) => m.includes('event emit failed'))).toBe(false)
  })

  test('401 logs auth_failed and skips the outbox (no retry)', async () => {
    const logger = silentLogger()
    const pushed: unknown[] = []
    const { client } = captureClient({ throwError: new KodiClientError(401, '') })
    const emitter = createEmitter({
      kodiClient: client,
      identity: IDENTITY,
      subscriptions: () => DEFAULT_SUBS,
      outbox: { push: (env) => pushed.push(env) },
      now: () => FIXED_NOW,
      idempotencyKeyFactory: () => FIXED_KEY,
      logger,
    })

    await emitter.emit('plugin.started', { pid: 1, started_at: new Date(FIXED_NOW).toISOString() })

    expect(pushed).toHaveLength(0)
    expect(logger.messages.some((m) => m.includes('plugin.auth_failed'))).toBe(true)
  })
})
