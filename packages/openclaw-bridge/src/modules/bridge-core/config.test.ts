import { describe, expect, test } from 'bun:test'
import { loadConfig } from './config'

const VALID_PLAIN = {
  instance_id: 'inst_01',
  org_id: 'org_01',
  kodi_api_base_url: 'https://api.kodi.so',
  hmac_secret: 'a'.repeat(32),
}

describe('loadConfig (with SecretRef resolution)', () => {
  test('passes through a fully-plain config', () => {
    const cfg = loadConfig(VALID_PLAIN, () => undefined)
    expect(cfg.hmac_secret).toBe('a'.repeat(32))
  })

  test('resolves a $secret reference via the injected resolver', () => {
    const cfg = loadConfig(
      { ...VALID_PLAIN, hmac_secret: { $secret: 'PLUGIN_HMAC_SECRET' } },
      (name) => (name === 'PLUGIN_HMAC_SECRET' ? 'b'.repeat(32) : undefined),
    )
    expect(cfg.hmac_secret).toBe('b'.repeat(32))
  })

  test('throws when a $secret references an unset env var', () => {
    expect(() =>
      loadConfig(
        { ...VALID_PLAIN, hmac_secret: { $secret: 'MISSING' } },
        () => undefined,
      ),
    ).toThrow(/references secret "MISSING"/)
  })

  test('throws on non-object config input', () => {
    expect(() => loadConfig('string', () => undefined)).toThrow(/must be an object/)
    expect(() => loadConfig(null, () => undefined)).toThrow(/must be an object/)
  })

  test('throws on invalid hmac_secret shape', () => {
    expect(() =>
      loadConfig({ ...VALID_PLAIN, hmac_secret: 42 as unknown as string }, () => undefined),
    ).toThrow(/must be a string or/)
  })

  test('forwards downstream validation errors (e.g., short secret)', () => {
    expect(() =>
      loadConfig({ ...VALID_PLAIN, hmac_secret: 'short' }, () => undefined),
    ).toThrow(/config invalid/)
  })
})
