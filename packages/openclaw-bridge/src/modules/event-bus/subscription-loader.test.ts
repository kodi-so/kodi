import { describe, expect, test } from 'bun:test'
import {
  buildDefaultSubscriptions,
  createSubscriptionLoader,
  parseSubscriptionsBody,
  SubscriptionsParseError,
  SUBSCRIPTIONS_API_PATH,
} from './subscription-loader'
import type { Subscriptions } from './emitter'
import type { KodiClient } from '../bridge-core/kodi-client'
import { KodiClientError } from '../bridge-core/kodi-client'

const INSTANCE_ID = '11111111-1111-4111-8111-111111111111'

function silentLogger() {
  const messages: string[] = []
  return {
    log: (...args: unknown[]) => messages.push(args.map(String).join(' ')),
    warn: (...args: unknown[]) => messages.push(args.map(String).join(' ')),
    messages,
  }
}

function captureClient(opts: {
  body?: string
  status?: number
  throwError?: Error
} = {}) {
  const calls: Array<{ path: string; init: unknown }> = []
  const client: KodiClient = {
    signedFetch: async (p, init) => {
      calls.push({ path: p, init })
      if (opts.throwError) throw opts.throwError
      return new Response(opts.body ?? '{}', { status: opts.status ?? 200 })
    },
  }
  return { client, calls }
}

describe('buildDefaultSubscriptions', () => {
  test('matches spec § 4.2 default — all summary except two tool kinds', () => {
    const subs = buildDefaultSubscriptions()
    expect(subs['plugin.*']!.verbosity).toBe('summary')
    expect(subs['tool.*']!.verbosity).toBe('summary')
    expect(subs['tool.invoke.after']!.verbosity).toBe('full')
    expect(subs['tool.approval_requested']!.verbosity).toBe('full')
  })
})

describe('parseSubscriptionsBody', () => {
  test('extracts the subscriptions map from a well-formed body', () => {
    const subs = parseSubscriptionsBody({
      subscriptions: {
        'plugin.*': { enabled: true, verbosity: 'summary' },
        heartbeat: { enabled: false, verbosity: 'summary' },
      },
    })
    expect(subs['plugin.*']).toEqual({ enabled: true, verbosity: 'summary' })
    expect(subs.heartbeat).toEqual({ enabled: false, verbosity: 'summary' })
  })

  test('rejects when body is not an object', () => {
    expect(() => parseSubscriptionsBody(null)).toThrow(SubscriptionsParseError)
    expect(() => parseSubscriptionsBody('hi')).toThrow(SubscriptionsParseError)
  })

  test('rejects when body.subscriptions is missing or wrong-typed', () => {
    expect(() => parseSubscriptionsBody({})).toThrow(SubscriptionsParseError)
    expect(() => parseSubscriptionsBody({ subscriptions: 'no' })).toThrow(
      SubscriptionsParseError,
    )
  })

  test('rejects when an entry has a non-boolean enabled', () => {
    expect(() =>
      parseSubscriptionsBody({
        subscriptions: { 'plugin.*': { enabled: 'yes', verbosity: 'summary' } },
      }),
    ).toThrow(SubscriptionsParseError)
  })

  test('rejects when an entry has an unknown verbosity', () => {
    expect(() =>
      parseSubscriptionsBody({
        subscriptions: { 'plugin.*': { enabled: true, verbosity: 'loud' } },
      }),
    ).toThrow(SubscriptionsParseError)
  })

  test('reports every issue it finds, not just the first', () => {
    try {
      parseSubscriptionsBody({
        subscriptions: {
          'plugin.*': { enabled: 'yes', verbosity: 'loud' },
          heartbeat: { enabled: 1, verbosity: 'summary' },
        },
      })
      throw new Error('expected to throw')
    } catch (err) {
      expect(err).toBeInstanceOf(SubscriptionsParseError)
      const issues = (err as SubscriptionsParseError).issues
      expect(issues.length).toBeGreaterThanOrEqual(3)
    }
  })
})

describe('createSubscriptionLoader', () => {
  test('refetch parses a valid response and applies it', async () => {
    const applied: Subscriptions[] = []
    const responseBody = JSON.stringify({
      subscriptions: {
        'plugin.*': { enabled: true, verbosity: 'full' },
      },
    })
    const { client, calls } = captureClient({ body: responseBody })
    const loader = createSubscriptionLoader({
      kodiClient: client,
      instanceId: INSTANCE_ID,
      applySubscriptions: (next) => applied.push(next),
      logger: silentLogger(),
    })
    await loader.refetch()
    expect(calls[0]!.path).toBe(`${SUBSCRIPTIONS_API_PATH}?instance_id=${INSTANCE_ID}`)
    expect(applied).toHaveLength(1)
    expect(applied[0]!['plugin.*']!.verbosity).toBe('full')
  })

  test('refetch swallows network failures and does not apply', async () => {
    const applied: Subscriptions[] = []
    const logger = silentLogger()
    const { client } = captureClient({ throwError: new KodiClientError(503, '') })
    const loader = createSubscriptionLoader({
      kodiClient: client,
      instanceId: INSTANCE_ID,
      applySubscriptions: (next) => applied.push(next),
      logger,
    })
    await loader.refetch()
    expect(applied).toEqual([])
    expect(logger.messages.some((m) => m.includes('subscriptions.fetch.failed'))).toBe(true)
  })

  test('refetch logs and skips when the response body is not JSON', async () => {
    const applied: Subscriptions[] = []
    const logger = silentLogger()
    const { client } = captureClient({ body: 'not-json' })
    const loader = createSubscriptionLoader({
      kodiClient: client,
      instanceId: INSTANCE_ID,
      applySubscriptions: (next) => applied.push(next),
      logger,
    })
    await loader.refetch()
    expect(applied).toEqual([])
    expect(logger.messages.some((m) => m.includes('subscriptions.fetch.bad_json'))).toBe(true)
  })

  test('refetch logs and skips when the body shape is wrong', async () => {
    const applied: Subscriptions[] = []
    const logger = silentLogger()
    const { client } = captureClient({
      body: JSON.stringify({ wrong: 'shape' }),
    })
    const loader = createSubscriptionLoader({
      kodiClient: client,
      instanceId: INSTANCE_ID,
      applySubscriptions: (next) => applied.push(next),
      logger,
    })
    await loader.refetch()
    expect(applied).toEqual([])
    expect(logger.messages.some((m) => m.includes('subscriptions.fetch.invalid'))).toBe(true)
  })

  test('start() schedules setInterval at fetchIntervalMs', async () => {
    const scheduled: number[] = []
    const fakeSetInterval = ((_fn: () => void, ms: number) => {
      scheduled.push(ms)
      return {} as unknown as ReturnType<typeof setInterval>
    }) as unknown as typeof setInterval
    const fakeClearInterval = (() => {}) as unknown as typeof clearInterval

    const { client } = captureClient({ body: '{"subscriptions":{}}' })
    const loader = createSubscriptionLoader({
      kodiClient: client,
      instanceId: INSTANCE_ID,
      applySubscriptions: () => {},
      fetchIntervalMs: 600_000,
      setIntervalImpl: fakeSetInterval,
      clearIntervalImpl: fakeClearInterval,
      logger: silentLogger(),
    })
    await loader.start()
    expect(scheduled).toEqual([600_000])
  })

  test('stop() clears the interval', async () => {
    let cleared = false
    const fakeSetInterval = (() => ({}) as unknown as ReturnType<typeof setInterval>) as unknown as typeof setInterval
    const fakeClearInterval = (() => {
      cleared = true
    }) as unknown as typeof clearInterval

    const { client } = captureClient({ body: '{"subscriptions":{}}' })
    const loader = createSubscriptionLoader({
      kodiClient: client,
      instanceId: INSTANCE_ID,
      applySubscriptions: () => {},
      setIntervalImpl: fakeSetInterval,
      clearIntervalImpl: fakeClearInterval,
      logger: silentLogger(),
    })
    await loader.start()
    loader.stop()
    expect(cleared).toBe(true)
  })
})
