import {
  EVENT_KINDS,
  type EventKind,
} from '@kodi/shared/events'
import type { KodiClient } from '../bridge-core/kodi-client'
import { DEFAULT_SUBSCRIPTIONS, type Subscriptions, type SubscriptionEntry } from './emitter'

/**
 * Subscription loader: fetches per-instance subscription config from Kodi
 * on startup, falls back to the default if the fetch fails, and re-fetches
 * every 10 minutes as a backstop in case the inbound `admin/reload` push
 * (KOD-379) gets lost.
 *
 * Default per implementation-spec § 4.2 + KOD-375:
 *   - every kind enabled at `summary` verbosity
 *   - `tool.invoke.after` and `tool.approval_requested` at `full`
 *
 * The cache lives on the event-bus module's mutable holder (KOD-373);
 * this loader just calls `setSubscriptions` to swap. The emitter re-reads
 * the holder on every emit, so changes apply within one emission cycle.
 */

export const SUBSCRIPTIONS_API_PATH = '/api/openclaw/subscriptions'
export const DEFAULT_FETCH_INTERVAL_MS = 10 * 60 * 1000

const FULL_VERBOSITY_KINDS: ReadonlySet<EventKind> = new Set([
  'tool.invoke.after',
  'tool.approval_requested',
])

/**
 * Spec § 4.2 default — used when Kodi returns no row, or when the
 * startup fetch fails outright. Lifecycle, agent, message, session,
 * tool, composio kinds at summary; the two listed full-verbosity
 * kinds are explicit.
 */
export function buildDefaultSubscriptions(): Subscriptions {
  const out: Subscriptions = {
    'plugin.*': { enabled: true, verbosity: 'summary' },
    heartbeat: { enabled: true, verbosity: 'summary' },
    'agent.*': { enabled: true, verbosity: 'summary' },
    'message.*': { enabled: true, verbosity: 'summary' },
    'session.*': { enabled: true, verbosity: 'summary' },
    'tool.*': { enabled: true, verbosity: 'summary' },
    'composio.*': { enabled: true, verbosity: 'summary' },
  }
  for (const kind of FULL_VERBOSITY_KINDS) {
    out[kind] = { enabled: true, verbosity: 'full' }
  }
  return out
}

export class SubscriptionsParseError extends Error {
  readonly issues: ReadonlyArray<string>
  constructor(issues: ReadonlyArray<string>) {
    super(`Invalid subscriptions: ${issues.join(', ')}`)
    this.name = 'SubscriptionsParseError'
    this.issues = issues
  }
}

function isVerbosity(value: unknown): value is 'summary' | 'full' {
  return value === 'summary' || value === 'full'
}

/**
 * Validates a `{ subscriptions: { '<pattern>': { enabled, verbosity } } }`
 * body and returns the inner subscriptions map. Throws
 * `SubscriptionsParseError` on malformed input.
 *
 * Hand-rolled rather than zod-imported so the plugin bundle stays lean
 * (zod ships with the canonical envelope already; this is an extra
 * dependency we'd prefer not to drag in for one validator).
 */
export function parseSubscriptionsBody(raw: unknown): Subscriptions {
  const issues: string[] = []
  const root = raw as { subscriptions?: unknown } | null
  if (!root || typeof root !== 'object') {
    throw new SubscriptionsParseError(['body must be an object'])
  }
  const subs = root.subscriptions
  if (!subs || typeof subs !== 'object') {
    throw new SubscriptionsParseError(['body.subscriptions must be an object'])
  }
  const out: Subscriptions = {}
  for (const [pattern, value] of Object.entries(subs as Record<string, unknown>)) {
    if (!value || typeof value !== 'object') {
      issues.push(`subscriptions.${pattern}: must be an object`)
      continue
    }
    const entry = value as { enabled?: unknown; verbosity?: unknown }
    if (typeof entry.enabled !== 'boolean') {
      issues.push(`subscriptions.${pattern}.enabled: must be a boolean`)
    }
    if (!isVerbosity(entry.verbosity)) {
      issues.push(`subscriptions.${pattern}.verbosity: must be "summary" or "full"`)
    }
    if (typeof entry.enabled === 'boolean' && isVerbosity(entry.verbosity)) {
      out[pattern] = { enabled: entry.enabled, verbosity: entry.verbosity } satisfies SubscriptionEntry
    }
  }
  if (issues.length > 0) throw new SubscriptionsParseError(issues)
  return out
}

export type SubscriptionLoaderDeps = {
  kodiClient: KodiClient
  /** Identity captures the instance_id we ask Kodi about. */
  instanceId: string
  /** Called with the parsed subscriptions on every successful fetch. */
  applySubscriptions: (next: Subscriptions) => void
  /** ms; default 10 minutes. */
  fetchIntervalMs?: number
  logger?: Pick<Console, 'log' | 'warn'>
  setIntervalImpl?: typeof setInterval
  clearIntervalImpl?: typeof clearInterval
}

export type SubscriptionLoader = {
  /** Fetch once + start the periodic timer. */
  start: () => Promise<void>
  /** Cancel the periodic timer. */
  stop: () => void
  /** One-shot fetch + apply (used for tests / manual refresh). */
  refetch: () => Promise<void>
}

export function createSubscriptionLoader(deps: SubscriptionLoaderDeps): SubscriptionLoader {
  const {
    kodiClient,
    instanceId,
    applySubscriptions,
    fetchIntervalMs = DEFAULT_FETCH_INTERVAL_MS,
    logger = console,
    setIntervalImpl = setInterval,
    clearIntervalImpl = clearInterval,
  } = deps

  let timer: ReturnType<typeof setInterval> | null = null

  async function refetch(): Promise<void> {
    try {
      const res = await kodiClient.signedFetch(
        `${SUBSCRIPTIONS_API_PATH}?instance_id=${encodeURIComponent(instanceId)}`,
        { method: 'GET' },
      )
      const text = await res.text()
      let parsedBody: unknown
      try {
        parsedBody = JSON.parse(text)
      } catch {
        logger.warn(JSON.stringify({ msg: 'subscriptions.fetch.bad_json' }))
        return
      }
      try {
        const subs = parseSubscriptionsBody(parsedBody)
        applySubscriptions(subs)
      } catch (err) {
        logger.warn(
          JSON.stringify({
            msg: 'subscriptions.fetch.invalid',
            error: err instanceof Error ? err.message : String(err),
          }),
        )
      }
    } catch (err) {
      logger.warn(
        JSON.stringify({
          msg: 'subscriptions.fetch.failed',
          error: err instanceof Error ? err.message : String(err),
        }),
      )
    }
  }

  async function start(): Promise<void> {
    await refetch()
    if (!timer) {
      timer = setIntervalImpl(() => {
        void refetch()
      }, fetchIntervalMs)
      const t = timer as { unref?: () => void }
      t.unref?.()
    }
  }

  function stop(): void {
    if (timer) {
      clearIntervalImpl(timer)
      timer = null
    }
  }

  return { start, stop, refetch }
}

// Re-export EVENT_KINDS for convenience — callers building defaults often
// want to iterate every kind for diagnostics.
export { EVENT_KINDS, DEFAULT_SUBSCRIPTIONS }
