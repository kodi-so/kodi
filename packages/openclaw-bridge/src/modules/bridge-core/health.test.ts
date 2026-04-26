import { describe, expect, test } from 'bun:test'
import { buildHealthBody, createHealthState, createRateLimiter } from './health'

describe('buildHealthBody', () => {
  test('reports identity + uptime + counters', () => {
    const state = createHealthState()
    state.agentCount = 5
    state.lastHeartbeatSentAt = 1_750_000_000_000

    const body = buildHealthBody(state, {
      instance_id: 'inst_01',
      org_id: 'org_01',
      plugin_version: '2026-04-21-abc1234',
    })

    expect(body.status).toBe('ok')
    expect(body.plugin_version).toBe('2026-04-21-abc1234')
    expect(body.agent_count).toBe(5)
    expect(body.last_heartbeat_sent_at).toBe(1_750_000_000_000)
    expect(body.uptime_s).toBeGreaterThanOrEqual(0)
  })

  test('default state has zero agent count and null heartbeat', () => {
    const body = buildHealthBody(createHealthState(), {
      instance_id: 'i',
      org_id: 'o',
      plugin_version: 'dev',
    })
    expect(body.agent_count).toBe(0)
    expect(body.last_heartbeat_sent_at).toBeNull()
  })
})

describe('createRateLimiter', () => {
  test('allows up to N hits, then blocks', () => {
    const limiter = createRateLimiter(3, 60_000)
    expect(limiter.consume('a')).toBe(true)
    expect(limiter.consume('a')).toBe(true)
    expect(limiter.consume('a')).toBe(true)
    expect(limiter.consume('a')).toBe(false)
  })

  test('separates buckets by key', () => {
    const limiter = createRateLimiter(1, 60_000)
    expect(limiter.consume('a')).toBe(true)
    expect(limiter.consume('b')).toBe(true)
    expect(limiter.consume('a')).toBe(false)
    expect(limiter.consume('b')).toBe(false)
  })
})
