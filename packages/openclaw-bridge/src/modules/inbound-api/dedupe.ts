/**
 * Bounded in-memory nonce deduper for inbound HMAC requests.
 *
 * Backs the replay-protection requirement in implementation-spec § 4 +
 * KOD-376: a nonce that's been seen within the active window MUST be
 * rejected with 409. The window is 10 minutes by default — comfortably
 * larger than the HMAC skew tolerance so we never accept a request twice.
 *
 * Bounded at 10k entries by default (per ticket "Technical Notes"). On
 * insert past capacity we evict the oldest seen entry — `Map` preserves
 * insertion order, so `keys().next()` gives us the LRU candidate.
 *
 * Uses real wall-clock time so an instance restart resets the window;
 * acceptable since Kodi's own retry budget (3 attempts within seconds)
 * never approaches the 10-minute window.
 */

export type NonceDedupe = {
  /**
   * Returns `true` if this is the first time the nonce has been seen
   * (and records it); `false` if it's a replay.
   */
  check: (nonce: string, now?: number) => boolean
  /** Number of entries currently retained. */
  size: () => number
}

export type CreateNonceDedupeOptions = {
  /** Default 10 minutes. */
  ttlMs?: number
  /** Default 10_000. */
  maxSize?: number
}

export function createNonceDedupe(opts: CreateNonceDedupeOptions = {}): NonceDedupe {
  const ttlMs = opts.ttlMs ?? 10 * 60 * 1000
  const maxSize = opts.maxSize ?? 10_000

  /** Map preserves insertion order so the first key is always the oldest. */
  const seen = new Map<string, number>()

  function pruneExpired(now: number): void {
    for (const [nonce, ts] of seen) {
      if (now - ts <= ttlMs) break
      seen.delete(nonce)
    }
  }

  function check(nonce: string, nowOverride?: number): boolean {
    const now = nowOverride ?? Date.now()

    pruneExpired(now)

    const previous = seen.get(nonce)
    if (previous !== undefined && now - previous <= ttlMs) {
      return false
    }

    if (previous !== undefined) seen.delete(nonce)
    seen.set(nonce, now)

    while (seen.size > maxSize) {
      const oldest = seen.keys().next().value
      if (oldest === undefined) break
      seen.delete(oldest)
    }

    return true
  }

  return { check, size: () => seen.size }
}
