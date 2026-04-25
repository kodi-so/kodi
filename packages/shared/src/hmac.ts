import { createHmac, timingSafeEqual } from 'node:crypto'

/**
 * HMAC-SHA256 signing utility shared between Kodi and the kodi-bridge
 * OpenClaw plugin. Both sides MUST compute byte-identical signatures —
 * this single utility is the source of truth.
 *
 * Algorithm:
 *   signature = HMAC-SHA256(secret, `${timestamp}.${nonce}.${body}`)
 *
 * The timestamp + nonce + body are joined with `.` separators (no padding,
 * no escaping) and HMAC'd over UTF-8 bytes. Verification uses
 * `timingSafeEqual` to prevent leaking byte differences via timing.
 */

export const DEFAULT_MAX_SKEW_MS = 5 * 60 * 1000 // 5 minutes

export type SignRequestInput = {
  /** Raw request body. Must be the exact serialized string sent on the wire. */
  body: string
  /** Shared HMAC secret. Both sides must hold the same value. */
  secret: string
  /** Unix epoch milliseconds at signing time. */
  timestamp: number
  /** Nonce — recommend a uuid v4 or random hex. Must be unique per request to enable replay protection. */
  nonce: string
}

export type VerifyRequestInput = SignRequestInput & {
  /** Hex signature received from the peer (lowercase or uppercase, case-insensitive). */
  signature: string
  /**
   * Maximum allowed clock skew between signer and verifier in milliseconds.
   * Defaults to {@link DEFAULT_MAX_SKEW_MS}.
   */
  maxSkewMs?: number
  /** Override `Date.now()` for tests. */
  now?: () => number
}

export type VerifyRequestResult =
  | { ok: true }
  | { ok: false; code: 'SKEW' | 'SIGNATURE' }

function payloadFor({
  body,
  timestamp,
  nonce,
}: Pick<SignRequestInput, 'body' | 'timestamp' | 'nonce'>): string {
  return `${timestamp}.${nonce}.${body}`
}

/**
 * Returns the lowercase hex HMAC-SHA256 signature for the given request.
 */
export function signRequest(input: SignRequestInput): string {
  const payload = payloadFor(input)
  return createHmac('sha256', input.secret).update(payload, 'utf8').digest('hex')
}

/**
 * Verifies a signature. Returns `{ ok: true }` on success or
 * `{ ok: false, code }` with one of:
 *
 *   - `SKEW`: `|now - timestamp| > maxSkewMs`. Future timestamps within
 *     the skew window are accepted; only out-of-window deltas reject.
 *   - `SIGNATURE`: signatures do not match (constant-time compared).
 */
export function verifyRequest(input: VerifyRequestInput): VerifyRequestResult {
  const maxSkewMs = input.maxSkewMs ?? DEFAULT_MAX_SKEW_MS
  const now = (input.now ?? Date.now)()

  if (Math.abs(now - input.timestamp) > maxSkewMs) {
    return { ok: false, code: 'SKEW' }
  }

  const expected = signRequest(input)

  // Buffer comparison must be of equal length to use timingSafeEqual.
  // Normalize to lowercase hex on both sides.
  const a = Buffer.from(expected, 'hex')
  const b = Buffer.from(input.signature.toLowerCase(), 'hex')
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    return { ok: false, code: 'SIGNATURE' }
  }

  return { ok: true }
}
