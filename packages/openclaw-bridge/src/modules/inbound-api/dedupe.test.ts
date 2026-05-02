import { describe, expect, test } from 'bun:test'
import { createNonceDedupe } from './dedupe'

const NOW = 1_750_000_000_000

describe('createNonceDedupe', () => {
  test('first sighting of a nonce returns true', () => {
    const dedupe = createNonceDedupe()
    expect(dedupe.check('n-1', NOW)).toBe(true)
  })

  test('replays within the window return false', () => {
    const dedupe = createNonceDedupe({ ttlMs: 1000 })
    expect(dedupe.check('n-1', NOW)).toBe(true)
    expect(dedupe.check('n-1', NOW + 500)).toBe(false)
  })

  test('the same nonce after the window passes again', () => {
    const dedupe = createNonceDedupe({ ttlMs: 1000 })
    expect(dedupe.check('n-1', NOW)).toBe(true)
    expect(dedupe.check('n-1', NOW + 1500)).toBe(true)
  })

  test('size is bounded to maxSize, oldest evicted first', () => {
    const dedupe = createNonceDedupe({ ttlMs: 60_000, maxSize: 3 })
    dedupe.check('a', NOW)
    dedupe.check('b', NOW + 1)
    dedupe.check('c', NOW + 2)
    expect(dedupe.size()).toBe(3)
    dedupe.check('d', NOW + 3) // 'a' evicted; seen = {b, c, d}
    expect(dedupe.size()).toBe(3)
    // 'b' is still in the window — replay rejected
    expect(dedupe.check('b', NOW + 4)).toBe(false)
    // 'a' was evicted, so it's a fresh sighting now
    expect(dedupe.check('a', NOW + 5)).toBe(true)
  })

  test('expired entries are pruned on next check call', () => {
    const dedupe = createNonceDedupe({ ttlMs: 100 })
    dedupe.check('a', NOW)
    dedupe.check('b', NOW + 50)
    expect(dedupe.size()).toBe(2)
    // At NOW + 200 both 'a' (age 200) and 'b' (age 150) are past ttl=100,
    // so both get pruned and only 'c' remains.
    dedupe.check('c', NOW + 200)
    expect(dedupe.size()).toBe(1)
  })
})
