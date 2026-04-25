import { describe, expect, test } from 'bun:test'
import { signRequest, verifyRequest, DEFAULT_MAX_SKEW_MS } from './hmac'

const SECRET = 'test-secret-32-bytes-of-randomness--'
const NOW = 1_750_000_000_000

const baseInput = {
  body: '{"hello":"world"}',
  secret: SECRET,
  timestamp: NOW,
  nonce: '00000000-0000-0000-0000-000000000001',
}

describe('signRequest / verifyRequest', () => {
  test('roundtrip: a signed request verifies', () => {
    const signature = signRequest(baseInput)
    const result = verifyRequest({ ...baseInput, signature, now: () => NOW })
    expect(result).toEqual({ ok: true })
  })

  test('signature is deterministic for the same inputs', () => {
    expect(signRequest(baseInput)).toBe(signRequest(baseInput))
  })

  test('tampered body fails verification', () => {
    const signature = signRequest(baseInput)
    const result = verifyRequest({
      ...baseInput,
      body: '{"hello":"tampered"}',
      signature,
      now: () => NOW,
    })
    expect(result).toEqual({ ok: false, code: 'SIGNATURE' })
  })

  test('wrong secret fails verification', () => {
    const signature = signRequest(baseInput)
    const result = verifyRequest({
      ...baseInput,
      secret: 'different-secret',
      signature,
      now: () => NOW,
    })
    expect(result).toEqual({ ok: false, code: 'SIGNATURE' })
  })

  test('different nonce fails verification', () => {
    const signature = signRequest(baseInput)
    const result = verifyRequest({
      ...baseInput,
      nonce: '00000000-0000-0000-0000-000000000002',
      signature,
      now: () => NOW,
    })
    expect(result).toEqual({ ok: false, code: 'SIGNATURE' })
  })

  test('clock skew beyond default window rejects', () => {
    const signature = signRequest(baseInput)
    const result = verifyRequest({
      ...baseInput,
      signature,
      now: () => NOW + DEFAULT_MAX_SKEW_MS + 1,
    })
    expect(result).toEqual({ ok: false, code: 'SKEW' })
  })

  test('clock skew within window accepts', () => {
    const signature = signRequest(baseInput)
    const result = verifyRequest({
      ...baseInput,
      signature,
      now: () => NOW + DEFAULT_MAX_SKEW_MS - 1,
    })
    expect(result).toEqual({ ok: true })
  })

  test('future timestamp within skew window accepts', () => {
    const future = NOW + 60_000
    const signature = signRequest({ ...baseInput, timestamp: future })
    const result = verifyRequest({
      ...baseInput,
      timestamp: future,
      signature,
      now: () => NOW,
    })
    expect(result).toEqual({ ok: true })
  })

  test('uppercase signature is accepted (case-insensitive)', () => {
    const signature = signRequest(baseInput).toUpperCase()
    const result = verifyRequest({ ...baseInput, signature, now: () => NOW })
    expect(result).toEqual({ ok: true })
  })

  test('unicode body roundtrips', () => {
    const input = { ...baseInput, body: '{"emoji":"🦞","cn":"你好"}' }
    const signature = signRequest(input)
    const result = verifyRequest({ ...input, signature, now: () => NOW })
    expect(result).toEqual({ ok: true })
  })

  test('custom maxSkewMs is honored', () => {
    const signature = signRequest(baseInput)
    const result = verifyRequest({
      ...baseInput,
      signature,
      now: () => NOW + 10_000,
      maxSkewMs: 5_000,
    })
    expect(result).toEqual({ ok: false, code: 'SKEW' })
  })

  test('malformed hex signature fails (length mismatch)', () => {
    const result = verifyRequest({
      ...baseInput,
      signature: 'deadbeef',
      now: () => NOW,
    })
    expect(result).toEqual({ ok: false, code: 'SIGNATURE' })
  })
})
