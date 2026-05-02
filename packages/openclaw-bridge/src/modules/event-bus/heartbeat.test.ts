import { describe, expect, test } from 'bun:test'
import { createHeartbeat } from './heartbeat'
import type { Emitter } from './emitter'

type Captured = { kind: string; payload: unknown }

function captureEmitter(): { emitter: Emitter; captured: Captured[] } {
  const captured: Captured[] = []
  const emitter: Emitter = {
    emit: async (kind, payload) => {
      captured.push({ kind, payload })
    },
  }
  return { emitter, captured }
}

describe('createHeartbeat', () => {
  test('tick() emits heartbeat with uptime_s and agent_count', async () => {
    const { emitter, captured } = captureEmitter()
    const t0 = 1_750_000_000_000
    let tNow = t0
    const heartbeat = createHeartbeat({
      emitter,
      intervalSeconds: 60,
      getAgentCount: () => 3,
      now: () => tNow,
    })
    tNow = t0 + 5_500 // 5.5 seconds later
    await heartbeat.tick()
    expect(captured).toHaveLength(1)
    expect(captured[0]!.kind).toBe('heartbeat')
    expect(captured[0]!.payload).toEqual({ uptime_s: 5, agent_count: 3 })
  })

  test('uptime_s never goes negative if clock skews backwards', async () => {
    const { emitter, captured } = captureEmitter()
    const t0 = 1_750_000_000_000
    let tNow = t0
    const heartbeat = createHeartbeat({
      emitter,
      intervalSeconds: 60,
      now: () => tNow,
    })
    tNow = t0 - 1_000 // clock went backwards
    await heartbeat.tick()
    expect((captured[0]!.payload as { uptime_s: number }).uptime_s).toBe(0)
  })

  test('agent_count defaults to 0 when getAgentCount is omitted', async () => {
    const { emitter, captured } = captureEmitter()
    const heartbeat = createHeartbeat({
      emitter,
      intervalSeconds: 60,
      now: () => 1_750_000_000_000,
    })
    await heartbeat.tick()
    expect((captured[0]!.payload as { agent_count: number }).agent_count).toBe(0)
  })

  test('start() schedules setInterval with intervalSeconds * 1000 ms', async () => {
    const { emitter } = captureEmitter()
    const scheduled: number[] = []
    const fakeSetInterval = ((_fn: () => void, ms: number) => {
      scheduled.push(ms)
      return {} as unknown as ReturnType<typeof setInterval>
    }) as unknown as typeof setInterval
    const fakeClearInterval = (() => {}) as unknown as typeof clearInterval
    const heartbeat = createHeartbeat({
      emitter,
      intervalSeconds: 90,
      setIntervalImpl: fakeSetInterval,
      clearIntervalImpl: fakeClearInterval,
    })
    heartbeat.start()
    expect(scheduled).toEqual([90_000])
  })

  test('stop() clears the interval', async () => {
    const { emitter } = captureEmitter()
    let cleared = false
    const fakeSetInterval = (() => ({}) as unknown as ReturnType<typeof setInterval>) as unknown as typeof setInterval
    const fakeClearInterval = (() => {
      cleared = true
    }) as unknown as typeof clearInterval
    const heartbeat = createHeartbeat({
      emitter,
      intervalSeconds: 60,
      setIntervalImpl: fakeSetInterval,
      clearIntervalImpl: fakeClearInterval,
    })
    heartbeat.start()
    heartbeat.stop()
    expect(cleared).toBe(true)
  })

  test('start() is idempotent — calling twice schedules only once', async () => {
    const { emitter } = captureEmitter()
    let intervalCalls = 0
    const fakeSetInterval = ((_fn: () => void, _ms: number) => {
      intervalCalls += 1
      return { calls: intervalCalls } as unknown as ReturnType<typeof setInterval>
    }) as unknown as typeof setInterval
    const fakeClearInterval = (() => {}) as unknown as typeof clearInterval
    const heartbeat = createHeartbeat({
      emitter,
      intervalSeconds: 60,
      setIntervalImpl: fakeSetInterval,
      clearIntervalImpl: fakeClearInterval,
    })
    heartbeat.start()
    heartbeat.start()
    expect(intervalCalls).toBe(1)
  })

  test('subscription gating: heartbeat tick does not throw if emit is dropped', async () => {
    // The emitter is passed in; if its subscription says heartbeat is disabled,
    // emit will return early. The heartbeat module itself doesn't need to
    // know about subscriptions — this test just confirms a no-op emit doesn't
    // break the tick loop.
    const noopEmitter: Emitter = { emit: async () => {} }
    const heartbeat = createHeartbeat({
      emitter: noopEmitter,
      intervalSeconds: 60,
    })
    await expect(heartbeat.tick()).resolves.toBeUndefined()
  })
})
