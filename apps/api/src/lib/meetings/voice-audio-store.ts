import { randomUUID } from 'crypto'

/**
 * Short-lived in-memory store for TTS audio blobs.
 *
 * After the bot fetches the audio via the `/voice-output/:token` route, the
 * entry is evicted. Entries also expire after TTL_MS to avoid unbounded growth.
 *
 * This is intentionally simple: fine for a single-server pilot. A production
 * multi-instance deployment would use signed S3/R2 presigned URLs instead.
 */

const TTL_MS = 5 * 60 * 1000 // 5 minutes

type AudioEntry = {
  buffer: Buffer
  contentType: 'audio/mpeg'
  expiresAt: number
}

const store = new Map<string, AudioEntry>()

/** Store audio bytes and return a single-use token. */
export function storeVoiceAudio(buffer: Buffer): string {
  evictExpired()
  const token = randomUUID()
  store.set(token, {
    buffer,
    contentType: 'audio/mpeg',
    expiresAt: Date.now() + TTL_MS,
  })
  return token
}

/** Retrieve and consume an audio entry by token. Returns null if missing or expired. */
export function consumeVoiceAudio(
  token: string
): { buffer: Buffer; contentType: 'audio/mpeg' } | null {
  const entry = store.get(token)
  if (!entry || Date.now() > entry.expiresAt) {
    store.delete(token)
    return null
  }
  store.delete(token) // single-use
  return { buffer: entry.buffer, contentType: entry.contentType }
}

function evictExpired() {
  const now = Date.now()
  for (const [token, entry] of store.entries()) {
    if (now > entry.expiresAt) {
      store.delete(token)
    }
  }
}
