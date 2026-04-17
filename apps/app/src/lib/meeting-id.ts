const BASE62 =
  '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz'

/**
 * Encode a UUID into a compact base62 string (~22 chars).
 * Purely cosmetic — the UUID is recoverable with `decodeMeetingId`.
 */
export function encodeMeetingId(uuid: string): string {
  const hex = uuid.replace(/-/g, '')
  let num = BigInt('0x' + hex)
  if (num === 0n) return '0'

  let result = ''
  while (num > 0n) {
    result = BASE62[Number(num % 62n)] + result
    num = num / 62n
  }
  return result
}

/**
 * Decode a base62-encoded meeting ID back into a UUID string.
 * Returns the standard 8-4-4-4-12 UUID format.
 */
export function decodeMeetingId(shortId: string): string {
  let num = 0n
  for (const char of shortId) {
    const idx = BASE62.indexOf(char)
    if (idx === -1) return shortId // not base62 — return as-is (graceful fallback)
    num = num * 62n + BigInt(idx)
  }

  const hex = num.toString(16).padStart(32, '0')
  return [
    hex.slice(0, 8),
    hex.slice(8, 12),
    hex.slice(12, 16),
    hex.slice(16, 20),
    hex.slice(20),
  ].join('-')
}

/**
 * Check if a string looks like a UUID (contains hyphens in the right places).
 * Used to support both old UUID URLs and new base62 URLs during transition.
 */
export function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
    value
  )
}

/**
 * Resolve a URL param to a UUID — handles both base62 short IDs and raw UUIDs.
 */
export function resolveSessionId(param: string): string {
  return isUuid(param) ? param : decodeMeetingId(param)
}
