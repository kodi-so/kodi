import { signRequest } from '@kodi/shared/hmac'
import { randomUUID } from 'node:crypto'

/**
 * Thin HTTP client for outbound calls from the plugin into the Kodi API.
 *
 * Every request:
 *   - carries `Authorization: Bearer <gatewayToken>` so Kodi can resolve
 *     the calling instance row
 *   - carries the HMAC headers (`x-kb-timestamp`, `x-kb-nonce`,
 *     `x-kb-signature`) verifying the body bytes against the per-instance
 *     plugin secret
 *
 * 5xx errors retry with exponential backoff (3 attempts max). 4xx errors
 * return immediately as a `KodiClientError` so callers can surface them
 * to the agent without burning retries on permanent failures.
 */

export type CreateKodiClientOptions = {
  baseUrl: string
  gatewayToken: string
  hmacSecret: string
  /** Override `Date.now()` for tests. */
  now?: () => number
  /** Override `randomUUID()` for tests. */
  nonceFactory?: () => string
  /** Override `fetch` for tests. */
  fetchImpl?: typeof fetch
  /** Max retries on 5xx / network errors. Default 3. */
  maxRetries?: number
  /** Initial backoff in ms; doubles each retry. Default 250. */
  baseBackoffMs?: number
  /** Sleep override for tests (avoids real timers). */
  sleep?: (ms: number) => Promise<void>
}

export type KodiClient = {
  /**
   * Issue a signed request to `baseUrl + path`. Body is serialized as JSON
   * if an object is passed in `init.body`; pre-serialized strings are sent
   * as-is so the caller controls the exact bytes (signature MUST match the
   * verbatim wire body).
   */
  signedFetch: (path: string, init?: SignedFetchInit) => Promise<Response>
}

export type SignedFetchInit = {
  method?: string
  /** Pre-serialized JSON string, or an object that will be JSON.stringify'd. */
  body?: string | Record<string, unknown> | null
  headers?: Record<string, string>
}

export class KodiClientError extends Error {
  readonly status: number
  readonly bodyText: string

  constructor(status: number, bodyText: string, message?: string) {
    super(message ?? `Kodi API error ${status}: ${bodyText.slice(0, 200)}`)
    this.name = 'KodiClientError'
    this.status = status
    this.bodyText = bodyText
  }
}

const RETRYABLE_STATUSES = new Set([502, 503, 504])

function defaultSleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

export function createKodiClient(opts: CreateKodiClientOptions): KodiClient {
  const {
    baseUrl,
    gatewayToken,
    hmacSecret,
    now = Date.now,
    nonceFactory = randomUUID,
    fetchImpl = fetch,
    maxRetries = 3,
    baseBackoffMs = 250,
    sleep = defaultSleep,
  } = opts

  const trimmedBase = baseUrl.replace(/\/+$/, '')

  async function signedFetch(path: string, init: SignedFetchInit = {}): Promise<Response> {
    const url = path.startsWith('http') ? path : `${trimmedBase}${path.startsWith('/') ? '' : '/'}${path}`

    // Serialize body if needed; the bytes-on-the-wire are what we sign.
    let bodyString: string
    if (init.body == null) {
      bodyString = ''
    } else if (typeof init.body === 'string') {
      bodyString = init.body
    } else {
      bodyString = JSON.stringify(init.body)
    }

    const method = (init.method ?? (bodyString ? 'POST' : 'GET')).toUpperCase()

    let lastError: unknown
    for (let attempt = 0; attempt <= maxRetries; attempt += 1) {
      const timestamp = now()
      const nonce = nonceFactory()
      const signature = signRequest({
        body: bodyString,
        secret: hmacSecret,
        timestamp,
        nonce,
      })

      const headers: Record<string, string> = {
        Authorization: `Bearer ${gatewayToken}`,
        'x-kb-timestamp': String(timestamp),
        'x-kb-nonce': nonce,
        'x-kb-signature': signature,
        ...(bodyString ? { 'Content-Type': 'application/json' } : {}),
        ...(init.headers ?? {}),
      }

      try {
        const res = await fetchImpl(url, {
          method,
          headers,
          body: bodyString ? bodyString : undefined,
        })

        if (res.status >= 200 && res.status < 300) return res

        // 4xx is a permanent failure for the caller — clone the body and
        // throw a structured error so callers can branch on `status`.
        if (res.status >= 400 && res.status < 500) {
          const bodyText = await res.text().catch(() => '')
          throw new KodiClientError(res.status, bodyText)
        }

        // 5xx — retryable. Read the body so the connection can free up.
        const bodyText = await res.text().catch(() => '')
        if (!RETRYABLE_STATUSES.has(res.status) || attempt === maxRetries) {
          throw new KodiClientError(res.status, bodyText)
        }
        lastError = new KodiClientError(res.status, bodyText)
      } catch (err) {
        // KodiClientError for 4xx already bubbled — rethrow without retry.
        if (err instanceof KodiClientError && err.status >= 400 && err.status < 500) {
          throw err
        }
        if (attempt === maxRetries) throw err
        lastError = err
      }

      // Exponential backoff: 250ms, 500ms, 1s, …
      const backoff = baseBackoffMs * 2 ** attempt
      await sleep(backoff)
    }

    // Unreachable in normal flow; the loop either returns or throws.
    throw lastError instanceof Error ? lastError : new Error('signedFetch: exhausted retries')
  }

  return { signedFetch }
}
