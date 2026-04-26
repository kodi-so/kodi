import { describe, expect, test } from 'bun:test'
import {
  buildPluginStartedEnvelope,
  emitPluginStarted,
  EVENTS_INGEST_PATH,
  KODI_BRIDGE_PROTOCOL_VERSION,
  PLUGIN_STARTED_EVENT_KIND,
} from './started-event'
import { KodiClientError, type KodiClient } from './kodi-client'
import type { Identity } from './identity'

const IDENTITY: Identity = {
  instance_id: 'inst_01',
  org_id: 'org_01',
  plugin_version: '2026-04-21-abc1234',
}

describe('buildPluginStartedEnvelope', () => {
  test('shape matches the receiver schema (KOD-369)', () => {
    const env = buildPluginStartedEnvelope(IDENTITY, 12345, 1_750_000_000_000, 'fixed-uuid')
    expect(env.protocol_version).toBe(KODI_BRIDGE_PROTOCOL_VERSION)
    expect(env.kind).toBe(PLUGIN_STARTED_EVENT_KIND)
    expect(env.idempotency_key).toBe('fixed-uuid')
    expect(env.emitted_at).toBe(new Date(1_750_000_000_000).toISOString())
    expect(env.payload.pid).toBe(12345)
    expect(env.payload.started_at).toBe(env.emitted_at)
    expect(env.payload.plugin_version).toBe('2026-04-21-abc1234')
    expect(env.payload.instance_id).toBe('inst_01')
    expect(env.payload.org_id).toBe('org_01')
  })
})

function makeKodiClient(behavior: 'ok' | 'err4xx' | 'err5xx' | 'throw'): {
  client: KodiClient
  calls: Array<{ path: string; body: unknown }>
} {
  const calls: Array<{ path: string; body: unknown }> = []
  const client: KodiClient = {
    signedFetch: async (path, init) => {
      calls.push({ path, body: init?.body })
      if (behavior === 'ok') return new Response('{}', { status: 202 })
      if (behavior === 'err4xx') throw new KodiClientError(401, 'unauthorized')
      if (behavior === 'err5xx') throw new KodiClientError(503, 'busy')
      throw new Error('network down')
    },
  }
  return { client, calls }
}

describe('emitPluginStarted', () => {
  test('sends the envelope to /api/openclaw/events on success', async () => {
    const { client, calls } = makeKodiClient('ok')
    const logs: string[] = []
    await emitPluginStarted({
      kodiClient: client,
      identity: IDENTITY,
      pid: 99,
      now: () => 1_750_000_000_000,
      idempotencyKeyFactory: () => 'k1',
      logger: { log: (m) => logs.push(String(m)), warn: () => undefined },
    })
    expect(calls).toHaveLength(1)
    expect(calls[0]!.path).toBe(EVENTS_INGEST_PATH)
    const body = calls[0]!.body as Record<string, unknown>
    expect(body.kind).toBe(PLUGIN_STARTED_EVENT_KIND)
    expect(body.idempotency_key).toBe('k1')
    expect(logs[0]).toContain('plugin.started emitted')
    expect(logs[0]).toContain('"status":202')
  })

  test('does not throw on 4xx; logs failure', async () => {
    const { client } = makeKodiClient('err4xx')
    const warns: string[] = []
    await emitPluginStarted({
      kodiClient: client,
      identity: IDENTITY,
      pid: 1,
      now: () => 1,
      idempotencyKeyFactory: () => 'k2',
      logger: { log: () => undefined, warn: (m) => warns.push(String(m)) },
    })
    expect(warns[0]).toContain('plugin.started failed')
    expect(warns[0]).toContain('"status":401')
  })

  test('does not throw on 5xx after retries are exhausted', async () => {
    const { client } = makeKodiClient('err5xx')
    const warns: string[] = []
    await emitPluginStarted({
      kodiClient: client,
      identity: IDENTITY,
      pid: 1,
      now: () => 1,
      idempotencyKeyFactory: () => 'k3',
      logger: { log: () => undefined, warn: (m) => warns.push(String(m)) },
    })
    expect(warns[0]).toContain('"status":503')
  })

  test('does not throw on non-HTTP error (network down)', async () => {
    const { client } = makeKodiClient('throw')
    const warns: string[] = []
    await emitPluginStarted({
      kodiClient: client,
      identity: IDENTITY,
      pid: 1,
      now: () => 1,
      idempotencyKeyFactory: () => 'k4',
      logger: { log: () => undefined, warn: (m) => warns.push(String(m)) },
    })
    expect(warns[0]).toContain('network down')
    expect(warns[0]).toContain('"status":null')
  })

  test('idempotency key changes per call', async () => {
    const { client } = makeKodiClient('ok')
    let count = 0
    const factory = () => `k-${count++}`
    await emitPluginStarted({
      kodiClient: client,
      identity: IDENTITY,
      pid: 1,
      now: () => 1,
      idempotencyKeyFactory: factory,
      logger: { log: () => undefined, warn: () => undefined },
    })
    await emitPluginStarted({
      kodiClient: client,
      identity: IDENTITY,
      pid: 1,
      now: () => 1,
      idempotencyKeyFactory: factory,
      logger: { log: () => undefined, warn: () => undefined },
    })
    expect(count).toBe(2)
  })
})
