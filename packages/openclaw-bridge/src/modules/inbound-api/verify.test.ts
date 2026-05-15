import { describe, expect, test } from 'bun:test'
import { signRequest } from '@kodi/shared/hmac'
import { createNonceDedupe } from './dedupe'
import { verifyInbound } from './verify'

const SECRET = 'test-secret-32-bytes-of-randomness--'
const NOW = 1_750_000_000_000

function signedHeaders(body: string, opts?: { timestamp?: number; nonce?: string }) {
  const timestamp = opts?.timestamp ?? NOW
  const nonce = opts?.nonce ?? '00000000-0000-0000-0000-000000000001'
  const signature = signRequest({ body, secret: SECRET, timestamp, nonce })
  return {
    'x-kb-timestamp': String(timestamp),
    'x-kb-nonce': nonce,
    'x-kb-signature': signature,
  }
}

describe('verifyInbound', () => {
  test('valid signed request passes', () => {
    const body = '{"hello":"world"}'
    const result = verifyInbound({
      headers: signedHeaders(body),
      rawBody: body,
      secret: SECRET,
      dedupe: createNonceDedupe(),
      now: () => NOW,
    })
    expect(result.ok).toBe(true)
  })

  test('missing headers return MISSING', () => {
    const result = verifyInbound({
      headers: {},
      rawBody: '{}',
      secret: SECRET,
      dedupe: createNonceDedupe(),
      now: () => NOW,
    })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.code).toBe('MISSING')
  })

  test('non-numeric timestamp returns BAD_TIMESTAMP', () => {
    const headers = signedHeaders('{}')
    headers['x-kb-timestamp'] = 'not-a-number'
    const result = verifyInbound({
      headers,
      rawBody: '{}',
      secret: SECRET,
      dedupe: createNonceDedupe(),
      now: () => NOW,
    })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.code).toBe('BAD_TIMESTAMP')
  })

  test('signature mismatch returns SIGNATURE', () => {
    const headers = signedHeaders('{"hello":"world"}')
    const result = verifyInbound({
      headers,
      rawBody: '{"hello":"tampered"}',
      secret: SECRET,
      dedupe: createNonceDedupe(),
      now: () => NOW,
    })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.code).toBe('SIGNATURE')
  })

  test('timestamp outside skew window returns SKEW', () => {
    const headers = signedHeaders('{}', { timestamp: NOW - 60 * 60 * 1000 })
    const result = verifyInbound({
      headers,
      rawBody: '{}',
      secret: SECRET,
      dedupe: createNonceDedupe(),
      now: () => NOW,
    })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.code).toBe('SKEW')
  })

  test('replayed nonce returns REPLAY', () => {
    const dedupe = createNonceDedupe()
    const body = '{"x":1}'
    const headers = signedHeaders(body, { nonce: 'replay-nonce-1' })
    const first = verifyInbound({
      headers,
      rawBody: body,
      secret: SECRET,
      dedupe,
      now: () => NOW,
    })
    expect(first.ok).toBe(true)

    const second = verifyInbound({
      headers,
      rawBody: body,
      secret: SECRET,
      dedupe,
      now: () => NOW,
    })
    expect(second.ok).toBe(false)
    if (!second.ok) expect(second.code).toBe('REPLAY')
  })
})
