import { describe, expect, test } from 'bun:test'
import { KodiBridgeConfigError, validateConfig } from './config'

const VALID = {
  instance_id: 'inst_01',
  org_id: 'org_01',
  kodi_api_base_url: 'https://api.kodi.so',
  hmac_secret: 'a'.repeat(32),
}

describe('kodi-bridge config validation', () => {
  test('accepts a minimal valid config', () => {
    const cfg = validateConfig(VALID)
    expect(cfg.instance_id).toBe('inst_01')
    expect(cfg.heartbeat_interval_seconds).toBe(60)
    expect(cfg.bundle_check_interval_seconds).toBe(3600)
    expect(cfg.outbox_path).toBeUndefined()
  })

  test('uses provided override intervals', () => {
    const cfg = validateConfig({
      ...VALID,
      heartbeat_interval_seconds: 30,
      bundle_check_interval_seconds: 7200,
      outbox_path: '/var/lib/kodi-bridge/outbox',
    })
    expect(cfg.heartbeat_interval_seconds).toBe(30)
    expect(cfg.bundle_check_interval_seconds).toBe(7200)
    expect(cfg.outbox_path).toBe('/var/lib/kodi-bridge/outbox')
  })

  test('rejects non-object input', () => {
    expect(() => validateConfig(null)).toThrow(KodiBridgeConfigError)
    expect(() => validateConfig('string')).toThrow(KodiBridgeConfigError)
  })

  test('rejects missing required fields with actionable issues', () => {
    try {
      validateConfig({ instance_id: 'x' })
      throw new Error('should not reach')
    } catch (err) {
      expect(err).toBeInstanceOf(KodiBridgeConfigError)
      const issues = (err as KodiBridgeConfigError).issues.map((i) => i.path)
      expect(issues).toContain('org_id')
      expect(issues).toContain('hmac_secret')
      expect(issues).toContain('kodi_api_base_url')
    }
  })

  test('rejects short hmac_secret', () => {
    expect(() => validateConfig({ ...VALID, hmac_secret: 'short' })).toThrow(
      KodiBridgeConfigError,
    )
  })

  test('rejects malformed kodi_api_base_url', () => {
    expect(() => validateConfig({ ...VALID, kodi_api_base_url: 'not a url' })).toThrow(
      KodiBridgeConfigError,
    )
  })

  test('rejects below-minimum heartbeat interval', () => {
    expect(() =>
      validateConfig({ ...VALID, heartbeat_interval_seconds: 1 }),
    ).toThrow(KodiBridgeConfigError)
  })

  test('rejects below-minimum bundle check interval', () => {
    expect(() =>
      validateConfig({ ...VALID, bundle_check_interval_seconds: 30 }),
    ).toThrow(KodiBridgeConfigError)
  })

  test('rejects non-integer interval', () => {
    expect(() =>
      validateConfig({ ...VALID, heartbeat_interval_seconds: 12.5 }),
    ).toThrow(KodiBridgeConfigError)
  })
})
