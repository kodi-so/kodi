import type { IncomingHttpHeaders } from 'node:http'
import { verifyRequest, DEFAULT_MAX_SKEW_MS } from '@kodi/shared/hmac'
import type { NonceDedupe } from './dedupe'

/**
 * HMAC-verify middleware for inbound calls into the kodi-bridge plugin.
 *
 * Wire format matches what kodi-client.ts emits and what the receiver
 * already expects on Kodi: the raw body bytes are signed with
 *   HMAC-SHA256(secret, `${timestamp}.${nonce}.${body}`)
 * and ride three headers:
 *   - x-kb-timestamp: unix epoch ms
 *   - x-kb-nonce:     uuid v4 / random hex (must be unique per request)
 *   - x-kb-signature: lowercase hex HMAC
 *
 * Failure modes (HTTP status returned by callers):
 *   - MISSING       → 401 (a header is absent)
 *   - BAD_TIMESTAMP → 401 (header isn't a finite integer)
 *   - SKEW          → 401 (timestamp outside the skew window)
 *   - SIGNATURE     → 401 (HMAC mismatch)
 *   - REPLAY        → 409 (nonce already seen within the dedupe window)
 *
 * SKEW vs SIGNATURE distinction is preserved here for diagnostics; the
 * router collapses them into a single 401 at the boundary so attackers
 * can't probe for valid timestamps.
 */

export type VerifyInboundInput = {
  headers: IncomingHttpHeaders
  /** Verbatim request body as a string — must be the bytes the signer hashed. */
  rawBody: string
  /** The instance's plugin HMAC secret. */
  secret: string
  /** Nonce deduper. Pass per-instance so dedupe state survives across calls. */
  dedupe: NonceDedupe
  /** Override `Date.now()` for tests. */
  now?: () => number
  /** Override the skew window. Defaults to {@link DEFAULT_MAX_SKEW_MS}. */
  maxSkewMs?: number
}

export type VerifyInboundResult =
  | { ok: true; timestamp: number; nonce: string }
  | { ok: false; code: 'MISSING' | 'BAD_TIMESTAMP' | 'SKEW' | 'SIGNATURE' | 'REPLAY' }

function readHeader(headers: IncomingHttpHeaders, name: string): string | undefined {
  const raw = headers[name.toLowerCase()]
  if (Array.isArray(raw)) return raw[0]
  return raw
}

export function verifyInbound(input: VerifyInboundInput): VerifyInboundResult {
  const tsHeader = readHeader(input.headers, 'x-kb-timestamp')
  const nonce = readHeader(input.headers, 'x-kb-nonce')
  const signature = readHeader(input.headers, 'x-kb-signature')

  if (!tsHeader || !nonce || !signature) {
    return { ok: false, code: 'MISSING' }
  }

  const timestamp = Number.parseInt(tsHeader, 10)
  if (!Number.isFinite(timestamp)) {
    return { ok: false, code: 'BAD_TIMESTAMP' }
  }

  const verify = verifyRequest({
    body: input.rawBody,
    secret: input.secret,
    timestamp,
    nonce,
    signature,
    maxSkewMs: input.maxSkewMs ?? DEFAULT_MAX_SKEW_MS,
    now: input.now,
  })

  if (!verify.ok) {
    return { ok: false, code: verify.code }
  }

  if (!input.dedupe.check(nonce, input.now ? input.now() : undefined)) {
    return { ok: false, code: 'REPLAY' }
  }

  return { ok: true, timestamp, nonce }
}
