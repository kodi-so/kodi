import { randomUUID } from 'crypto'

/**
 * Short-lived in-memory store for TTS audio blobs.
 *
 * Entries expire after TTL_MS to avoid unbounded growth.
 *
 * This remains intentionally simple for the pilot, but unlike a single-use
 * token store it tolerates HEAD probes and fetch retries from the media
 * consumer. A production multi-instance deployment should still use signed
 * object storage URLs instead of in-memory state.
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

/** Retrieve an audio entry by token. Returns null if missing or expired. */
export function getVoiceAudio(
  token: string
): { buffer: Buffer; contentType: 'audio/mpeg' } | null {
  const entry = store.get(token)
  if (!entry || Date.now() > entry.expiresAt) {
    store.delete(token)
    return null
  }
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
