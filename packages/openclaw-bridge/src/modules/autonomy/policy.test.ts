import { describe, expect, test } from 'bun:test'
import {
  createPolicyLoader,
  defaultPolicyFor,
  parsePolicyResponse,
  DEFAULT_POLICY_TTL_MS,
  type AutonomyPolicy,
} from './policy'
import type { KodiClient } from '../bridge-core/kodi-client'

const AGENT = 'kodi-member-agent-aaa'

const POLICY_STRICT: AutonomyPolicy = {
  agent_id: AGENT,
  autonomy_level: 'strict',
  overrides: { 'gmail__send_email': 'deny' },
}

function silentLogger() {
  return { log: () => {}, warn: () => {} }
}

function fakeKodi(opts: {
  status?: number
  body?: unknown
  bodyText?: string
  throws?: Error
}): KodiClient & { calls: Array<{ path: string; init: unknown }> } {
  const calls: Array<{ path: string; init: unknown }> = []
  return Object.assign(
    {
      signedFetch: async (path: string, init?: unknown) => {
        calls.push({ path, init })
        if (opts.throws) throw opts.throws
        const text =
          opts.bodyText ?? JSON.stringify(opts.body ?? defaultPolicyFor(AGENT))
        return new Response(text, {
          status: opts.status ?? 200,
          headers: { 'content-type': 'application/json' },
        })
      },
    } as KodiClient,
    { calls } as { calls: Array<{ path: string; init: unknown }> },
  )
}

describe('parsePolicyResponse', () => {
  test('valid full payload', () => {
    expect(parsePolicyResponse(POLICY_STRICT)).toEqual(POLICY_STRICT)
  })

  test('overrides null is allowed', () => {
    expect(
      parsePolicyResponse({ agent_id: AGENT, autonomy_level: 'normal', overrides: null }),
    ).toEqual({ agent_id: AGENT, autonomy_level: 'normal', overrides: null })
  })

  test('overrides absent treated as null', () => {
    expect(
      parsePolicyResponse({ agent_id: AGENT, autonomy_level: 'yolo' }),
    ).toEqual({ agent_id: AGENT, autonomy_level: 'yolo', overrides: null })
  })

  test.each([
    ['null body', null],
    ['array body', []],
    ['empty agent_id', { agent_id: '', autonomy_level: 'normal' }],
    ['unknown level', { agent_id: AGENT, autonomy_level: 'godmode' }],
    ['missing agent_id', { autonomy_level: 'normal' }],
    ['unknown override action', { agent_id: AGENT, autonomy_level: 'normal', overrides: { 'gmail.*': 'maybe' } }],
    ['non-object overrides', { agent_id: AGENT, autonomy_level: 'normal', overrides: 'all' }],
  ])('rejects: %s', (_label, body) => {
    expect(parsePolicyResponse(body)).toBeNull()
  })
})

describe('createPolicyLoader — happy path', () => {
  test('cache miss → fetch from Kodi → cache populated', async () => {
    const kodi = fakeKodi({ body: POLICY_STRICT })
    const loader = createPolicyLoader({ kodiClient: kodi, logger: silentLogger() })
    const result = await loader.getPolicy(AGENT)
    expect(result).toEqual(POLICY_STRICT)
    expect(kodi.calls).toHaveLength(1)
    expect(kodi.calls[0]?.path).toBe(
      `/api/openclaw/agents/${encodeURIComponent(AGENT)}/autonomy`,
    )
    expect(loader.list()).toHaveLength(1)
  })

  test('cache hit before TTL → no second fetch', async () => {
    const kodi = fakeKodi({ body: POLICY_STRICT })
    const loader = createPolicyLoader({ kodiClient: kodi, logger: silentLogger() })
    await loader.getPolicy(AGENT)
    await loader.getPolicy(AGENT)
    expect(kodi.calls).toHaveLength(1)
  })

  test('cache expired → re-fetches', async () => {
    const kodi = fakeKodi({ body: POLICY_STRICT })
    let clock = 0
    const loader = createPolicyLoader({
      kodiClient: kodi,
      ttlMs: 1000,
      now: () => clock,
      logger: silentLogger(),
    })
    await loader.getPolicy(AGENT)
    clock += 1500 // > TTL
    await loader.getPolicy(AGENT)
    expect(kodi.calls).toHaveLength(2)
  })

  test('TTL is 15 minutes by default', () => {
    expect(DEFAULT_POLICY_TTL_MS).toBe(15 * 60 * 1000)
  })
})

describe('createPolicyLoader — failure modes', () => {
  test('Kodi unreachable + nothing cached → returns default', async () => {
    const kodi = fakeKodi({ throws: new Error('ECONNREFUSED') })
    const loader = createPolicyLoader({ kodiClient: kodi, logger: silentLogger() })
    const result = await loader.getPolicy(AGENT)
    expect(result).toEqual(defaultPolicyFor(AGENT))
  })

  test('Kodi unreachable + stale cache → returns stale', async () => {
    let throwNext = false
    const kodi: KodiClient = {
      signedFetch: async () => {
        if (throwNext) throw new Error('ECONNREFUSED')
        return new Response(JSON.stringify(POLICY_STRICT), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        })
      },
    }
    let clock = 0
    const loader = createPolicyLoader({
      kodiClient: kodi,
      ttlMs: 1000,
      now: () => clock,
      logger: silentLogger(),
    })
    await loader.getPolicy(AGENT) // populates cache
    clock += 5000 // way past TTL
    throwNext = true
    const result = await loader.getPolicy(AGENT)
    expect(result).toEqual(POLICY_STRICT) // stale wins over default
  })

  test('Kodi 404 → returns default and caches it', async () => {
    const kodi = fakeKodi({ status: 404, bodyText: 'Not Found' })
    const loader = createPolicyLoader({ kodiClient: kodi, logger: silentLogger() })
    const result = await loader.getPolicy(AGENT)
    expect(result).toEqual(defaultPolicyFor(AGENT))
    // Default was cached so the next call doesn't refetch
    await loader.getPolicy(AGENT)
    expect(kodi.calls).toHaveLength(1)
  })

  test('Kodi 5xx → falls back to default', async () => {
    const kodi = fakeKodi({ status: 503, bodyText: 'unavailable' })
    const loader = createPolicyLoader({ kodiClient: kodi, logger: silentLogger() })
    const result = await loader.getPolicy(AGENT)
    expect(result).toEqual(defaultPolicyFor(AGENT))
  })

  test('Kodi returns malformed body → falls back to default (does not cache)', async () => {
    const kodi = fakeKodi({ bodyText: 'not-json' })
    const loader = createPolicyLoader({ kodiClient: kodi, logger: silentLogger() })
    const result = await loader.getPolicy(AGENT)
    expect(result).toEqual(defaultPolicyFor(AGENT))
    // Did not cache → next call refetches
    await loader.getPolicy(AGENT)
    expect(kodi.calls).toHaveLength(2)
  })

  test('Kodi returns wrong shape → falls back to default (does not cache)', async () => {
    const kodi = fakeKodi({ body: { wrong: 'shape' } })
    const loader = createPolicyLoader({ kodiClient: kodi, logger: silentLogger() })
    expect(await loader.getPolicy(AGENT)).toEqual(defaultPolicyFor(AGENT))
    expect(loader.list()).toHaveLength(0)
  })
})

describe('createPolicyLoader — invalidation + setPolicy', () => {
  test('setPolicy: subsequent getPolicy returns the pushed policy without fetching', async () => {
    const kodi = fakeKodi({ body: { agent_id: AGENT, autonomy_level: 'lenient', overrides: null } })
    const loader = createPolicyLoader({ kodiClient: kodi, logger: silentLogger() })
    loader.setPolicy(POLICY_STRICT)
    const result = await loader.getPolicy(AGENT)
    expect(result).toEqual(POLICY_STRICT)
    expect(kodi.calls).toHaveLength(0)
  })

  test('invalidate: drops the cache entry, next get refetches', async () => {
    const kodi = fakeKodi({ body: POLICY_STRICT })
    const loader = createPolicyLoader({ kodiClient: kodi, logger: silentLogger() })
    await loader.getPolicy(AGENT)
    expect(kodi.calls).toHaveLength(1)
    loader.invalidate(AGENT)
    await loader.getPolicy(AGENT)
    expect(kodi.calls).toHaveLength(2)
  })

  test('invalidateAll: drops everything', async () => {
    const kodi = fakeKodi({ body: POLICY_STRICT })
    const loader = createPolicyLoader({ kodiClient: kodi, logger: silentLogger() })
    await loader.getPolicy(AGENT)
    await loader.getPolicy('agent-2')
    expect(loader.list().length).toBeGreaterThan(0)
    loader.invalidateAll()
    expect(loader.list()).toHaveLength(0)
  })
})
