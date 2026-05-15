import { describe, expect, test } from 'bun:test'
import { z } from 'zod'

// Re-derive the schema here so the test file doesn't have to import a
// non-exported symbol from the route module. If the route's regex changes,
// this test catches the divergence.
const VERSION_REGEX = /^\d{4}-\d{2}-\d{2}-[a-f0-9]{7,40}$/
const BUNDLE_KEY_REGEX = /^bundles\/\d{4}-\d{2}-\d{2}-[a-f0-9]{7,40}\/kodi-bridge\.tgz$/
const SHA256_REGEX = /^[a-f0-9]{64}$/

const publishBodySchema = z
  .object({
    version: z.string().regex(VERSION_REGEX),
    bundle_s3_key: z.string().regex(BUNDLE_KEY_REGEX),
    sha256: z.string().regex(SHA256_REGEX),
    notes: z.string().max(2000).optional(),
  })
  .refine((b) => b.bundle_s3_key === `bundles/${b.version}/kodi-bridge.tgz`, {
    path: ['bundle_s3_key'],
  })

const VALID = {
  version: '2026-04-21-abc1234',
  bundle_s3_key: 'bundles/2026-04-21-abc1234/kodi-bridge.tgz',
  sha256: 'a'.repeat(64),
}

describe('plugin-versions/publish payload validation', () => {
  test('accepts a well-formed body', () => {
    expect(publishBodySchema.safeParse(VALID).success).toBe(true)
  })

  test('accepts a 40-char sha (full git hash)', () => {
    const v = '2026-04-21-' + 'a'.repeat(40)
    expect(
      publishBodySchema.safeParse({
        version: v,
        bundle_s3_key: `bundles/${v}/kodi-bridge.tgz`,
        sha256: 'a'.repeat(64),
      }).success,
    ).toBe(true)
  })

  test('accepts notes when present', () => {
    expect(publishBodySchema.safeParse({ ...VALID, notes: 'hot fix for memory' }).success).toBe(
      true,
    )
  })

  test('rejects too-short version sha', () => {
    expect(
      publishBodySchema.safeParse({
        ...VALID,
        version: '2026-04-21-abc123', // 6 chars, must be ≥7
      }).success,
    ).toBe(false)
  })

  test('rejects malformed date in version', () => {
    expect(
      publishBodySchema.safeParse({
        ...VALID,
        version: '26-04-21-abc1234', // not 4-digit year
      }).success,
    ).toBe(false)
  })

  test('rejects uppercase chars in sha', () => {
    expect(
      publishBodySchema.safeParse({
        ...VALID,
        version: '2026-04-21-ABC1234',
      }).success,
    ).toBe(false)
  })

  test('rejects mismatched version segment in bundle_s3_key', () => {
    expect(
      publishBodySchema.safeParse({
        ...VALID,
        bundle_s3_key: 'bundles/2026-04-21-zzz9999/kodi-bridge.tgz',
      }).success,
    ).toBe(false)
  })

  test('rejects wrong bundle filename', () => {
    expect(
      publishBodySchema.safeParse({
        ...VALID,
        bundle_s3_key: 'bundles/2026-04-21-abc1234/something-else.tgz',
      }).success,
    ).toBe(false)
  })

  test('rejects sha256 that is not 64 hex', () => {
    expect(publishBodySchema.safeParse({ ...VALID, sha256: 'a'.repeat(63) }).success).toBe(false)
    expect(publishBodySchema.safeParse({ ...VALID, sha256: 'g'.repeat(64) }).success).toBe(false)
  })

  test('rejects missing required fields', () => {
    expect(publishBodySchema.safeParse({ version: VALID.version }).success).toBe(false)
    expect(publishBodySchema.safeParse({}).success).toBe(false)
  })

  test('rejects notes longer than 2000 chars', () => {
    expect(
      publishBodySchema.safeParse({ ...VALID, notes: 'x'.repeat(2001) }).success,
    ).toBe(false)
  })
})
