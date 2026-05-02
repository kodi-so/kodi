import { describe, expect, test } from 'bun:test'
import {
  buildDefaultSubscriptions,
  SubscriptionsSchema,
} from './subscriptions'

describe('buildDefaultSubscriptions', () => {
  test('every category is enabled at summary verbosity', () => {
    const subs = buildDefaultSubscriptions()
    for (const pattern of [
      'plugin.*',
      'heartbeat',
      'agent.*',
      'message.*',
      'session.*',
      'tool.*',
      'composio.*',
    ]) {
      expect(subs[pattern]).toEqual({ enabled: true, verbosity: 'summary' })
    }
  })

  test('tool.invoke.after and tool.approval_requested are full verbosity', () => {
    const subs = buildDefaultSubscriptions()
    expect(subs['tool.invoke.after']).toEqual({ enabled: true, verbosity: 'full' })
    expect(subs['tool.approval_requested']).toEqual({ enabled: true, verbosity: 'full' })
  })

  test('passes its own SubscriptionsSchema validation', () => {
    expect(SubscriptionsSchema.safeParse(buildDefaultSubscriptions()).success).toBe(true)
  })
})

describe('SubscriptionsSchema', () => {
  test('accepts a single-entry valid subscriptions map', () => {
    const result = SubscriptionsSchema.safeParse({
      'plugin.*': { enabled: true, verbosity: 'summary' },
    })
    expect(result.success).toBe(true)
  })

  test('rejects an entry with a non-boolean enabled', () => {
    const result = SubscriptionsSchema.safeParse({
      'plugin.*': { enabled: 'yes', verbosity: 'summary' },
    })
    expect(result.success).toBe(false)
  })

  test('rejects an entry with an unknown verbosity', () => {
    const result = SubscriptionsSchema.safeParse({
      'plugin.*': { enabled: true, verbosity: 'verbose' },
    })
    expect(result.success).toBe(false)
  })

  test('rejects empty-string keys', () => {
    const result = SubscriptionsSchema.safeParse({
      '': { enabled: true, verbosity: 'summary' },
    })
    expect(result.success).toBe(false)
  })
})
