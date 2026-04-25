import { describe, expect, test } from 'bun:test'
import { createKodiClient, KodiClientError } from './kodi-client'

type Recorded = { url: string; init: RequestInit | undefined }

function makeFetchMock(
  responses: Array<Response | (() => Promise<Response>)>,
): { fetchImpl: typeof fetch; calls: Recorded[] } {
  const calls: Recorded[] = []
  let i = 0
  const fetchImpl = (async (input: string | URL | Request, init?: RequestInit) => {
    calls.push({ url: String(input), init })
    const next = responses[i++]
    if (!next) throw new Error('fetch mock: ran out of canned responses')
    return typeof next === 'function' ? await next() : next
  }) as unknown as typeof fetch
  return { fetchImpl, calls }
}

const BASE = {
  baseUrl: 'https://api.kodi.so',
  gatewayToken: 'gw_token_123',
  hmacSecret: 'a'.repeat(32),
  now: () => 1_750_000_000_000,
  nonceFactory: () => 'fixed-nonce',
  sleep: async () => undefined, // no real timers in tests
}

describe('createKodiClient', () => {
  test('attaches Bearer + HMAC headers on a successful POST', async () => {
    const { fetchImpl, calls } = makeFetchMock([new Response('{"ok":true}', { status: 200 })])
    const client = createKodiClient({ ...BASE, fetchImpl })

    const res = await client.signedFetch('/api/openclaw/events', {
      method: 'POST',
      body: { kind: 'plugin.started' },
    })

    expect(res.status).toBe(200)
    expect(calls).toHaveLength(1)
    const headers = calls[0].init!.headers as Record<string, string>
    expect(headers.Authorization).toBe('Bearer gw_token_123')
    expect(headers['x-kb-nonce']).toBe('fixed-nonce')
    expect(headers['x-kb-timestamp']).toBe('1750000000000')
    expect(headers['x-kb-signature']).toMatch(/^[a-f0-9]{64}$/)
    expect(headers['Content-Type']).toBe('application/json')
    expect(calls[0].init!.body).toBe('{"kind":"plugin.started"}')
  })

  test('signs the verbatim string body when caller pre-serializes', async () => {
    const { fetchImpl, calls } = makeFetchMock([new Response('', { status: 200 })])
    const client = createKodiClient({ ...BASE, fetchImpl })
    await client.signedFetch('/x', { method: 'POST', body: '{"already":"json"}' })
    expect(calls[0].init!.body).toBe('{"already":"json"}')
  })

  test('GET with no body still signs an empty body', async () => {
    const { fetchImpl, calls } = makeFetchMock([new Response('{}', { status: 200 })])
    const client = createKodiClient({ ...BASE, fetchImpl })
    await client.signedFetch('/api/whatever')
    const headers = calls[0].init!.headers as Record<string, string>
    expect(headers['x-kb-signature']).toBeDefined()
    expect(headers['Content-Type']).toBeUndefined()
  })

  test('retries on 503 up to maxRetries then throws KodiClientError', async () => {
    const { fetchImpl, calls } = makeFetchMock([
      new Response('busy', { status: 503 }),
      new Response('busy', { status: 503 }),
      new Response('busy', { status: 503 }),
      new Response('busy', { status: 503 }),
    ])
    const client = createKodiClient({ ...BASE, fetchImpl, maxRetries: 3 })

    let caught: unknown
    try {
      await client.signedFetch('/x', { method: 'POST', body: {} })
    } catch (err) {
      caught = err
    }
    expect(caught).toBeInstanceOf(KodiClientError)
    expect((caught as KodiClientError).status).toBe(503)
    expect(calls).toHaveLength(4) // initial + 3 retries
  })

  test('does not retry on 4xx; throws KodiClientError immediately', async () => {
    const { fetchImpl, calls } = makeFetchMock([
      new Response('forbidden', { status: 403 }),
    ])
    const client = createKodiClient({ ...BASE, fetchImpl, maxRetries: 3 })

    let caught: unknown
    try {
      await client.signedFetch('/x', { method: 'POST', body: {} })
    } catch (err) {
      caught = err
    }
    expect(caught).toBeInstanceOf(KodiClientError)
    expect((caught as KodiClientError).status).toBe(403)
    expect(calls).toHaveLength(1)
  })

  test('eventually succeeds on 503 → 200 sequence', async () => {
    const { fetchImpl, calls } = makeFetchMock([
      new Response('', { status: 503 }),
      new Response('{"ok":true}', { status: 200 }),
    ])
    const client = createKodiClient({ ...BASE, fetchImpl, maxRetries: 3 })

    const res = await client.signedFetch('/x', { method: 'POST', body: {} })
    expect(res.status).toBe(200)
    expect(calls).toHaveLength(2)
  })

  test('joins relative paths correctly with trailing-slash baseUrl', async () => {
    const { fetchImpl, calls } = makeFetchMock([new Response('{}', { status: 200 })])
    const client = createKodiClient({
      ...BASE,
      baseUrl: 'https://api.kodi.so/',
      fetchImpl,
    })
    await client.signedFetch('/api/openclaw/events')
    expect(calls[0].url).toBe('https://api.kodi.so/api/openclaw/events')
  })

  test('absolute URLs override baseUrl', async () => {
    const { fetchImpl, calls } = makeFetchMock([new Response('{}', { status: 200 })])
    const client = createKodiClient({ ...BASE, fetchImpl })
    await client.signedFetch('https://other.example/x')
    expect(calls[0].url).toBe('https://other.example/x')
  })
})
