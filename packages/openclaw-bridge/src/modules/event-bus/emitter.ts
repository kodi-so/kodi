import { randomUUID } from 'node:crypto'
import {
  KODI_BRIDGE_PROTOCOL,
  type AgentContext,
  type EventEnvelope,
  type EventKind,
  type Verbosity,
} from '@kodi/shared/events'
import { KodiClientError, type KodiClient } from '../bridge-core/kodi-client'
import type { Identity } from '../bridge-core/identity'

/**
 * Outbound event emitter for the kodi-bridge plugin. Constructs the canonical
 * envelope (per implementation-spec § 4 / KOD-371), picks the right verbosity
 * via the active subscription map, signs+POSTs to `/api/openclaw/events` using
 * the bridge-core KodiClient, and falls back to an outbox on failure.
 *
 * Subscription resolution rules (spec § 4.2):
 *   - exact-kind match wins over prefix match
 *   - longer prefix wins over shorter prefix
 *   - no match → drop (treated as `enabled: false`)
 *
 * If subscriptions haven't loaded yet (KOD-375 brings the config loader),
 * pass `() => DEFAULT_SUBSCRIPTIONS` and every kind ships at `summary`
 * verbosity per the ticket's "default to all-summary until config arrives".
 */

export const EVENTS_INGEST_PATH = '/api/openclaw/events'

export type SubscriptionEntry = {
  enabled: boolean
  verbosity: Verbosity
}
export type Subscriptions = Record<string, SubscriptionEntry>

export const DEFAULT_SUBSCRIPTIONS: Subscriptions = {
  'plugin.*': { enabled: true, verbosity: 'summary' },
  heartbeat: { enabled: true, verbosity: 'summary' },
  'agent.*': { enabled: true, verbosity: 'summary' },
  'message.*': { enabled: true, verbosity: 'summary' },
  'session.*': { enabled: true, verbosity: 'summary' },
  'tool.*': { enabled: true, verbosity: 'summary' },
  'composio.*': { enabled: true, verbosity: 'summary' },
}

export type EmitterDeps = {
  kodiClient: KodiClient
  identity: Identity
  subscriptions: () => Subscriptions
  outbox?: { push: (envelope: EventEnvelope) => void }
  now?: () => number
  idempotencyKeyFactory?: () => string
  logger?: Pick<Console, 'log' | 'warn'>
}

export type EmitOptions = {
  agent?: AgentContext
  /** Override `now()` for tests. */
  occurredAt?: string
  /** Override randomUUID() for tests. */
  idempotencyKey?: string
}

export type Emitter = {
  emit: (kind: EventKind, payload: unknown, opts?: EmitOptions) => Promise<void>
}

/**
 * Returns the subscription entry that applies to a given kind. Picks the most
 * specific match: exact > longer prefix > shorter prefix.
 */
export function resolveSubscription(
  kind: EventKind,
  subscriptions: Subscriptions,
): SubscriptionEntry {
  let best: { entry: SubscriptionEntry; specificity: number } | null = null
  for (const [pattern, entry] of Object.entries(subscriptions)) {
    let matches = false
    let specificity = -1
    if (pattern === kind) {
      matches = true
      specificity = pattern.length + 1_000_000
    } else if (pattern.endsWith('.*')) {
      const prefix = pattern.slice(0, -2)
      if (kind === prefix || kind.startsWith(`${prefix}.`)) {
        matches = true
        specificity = prefix.length
      }
    }
    if (matches && (!best || specificity > best.specificity)) {
      best = { entry, specificity }
    }
  }
  return best?.entry ?? { enabled: false, verbosity: 'summary' }
}

export function createEmitter(deps: EmitterDeps): Emitter {
  const {
    kodiClient,
    identity,
    subscriptions,
    outbox,
    now = Date.now,
    idempotencyKeyFactory = randomUUID,
    logger = console,
  } = deps

  async function emit(
    kind: EventKind,
    payload: unknown,
    opts: EmitOptions = {},
  ): Promise<void> {
    const sub = resolveSubscription(kind, subscriptions())
    if (!sub.enabled) return

    const occurred_at = opts.occurredAt ?? new Date(now()).toISOString()
    const idempotency_key = opts.idempotencyKey ?? idempotencyKeyFactory()
    const envelope: EventEnvelope = {
      protocol: KODI_BRIDGE_PROTOCOL,
      plugin_version: identity.plugin_version,
      instance: { instance_id: identity.instance_id, org_id: identity.org_id },
      ...(opts.agent ? { agent: opts.agent } : {}),
      event: {
        kind,
        verbosity: sub.verbosity,
        occurred_at,
        idempotency_key,
        payload,
      },
    }

    try {
      await kodiClient.signedFetch(EVENTS_INGEST_PATH, {
        method: 'POST',
        body: envelope as unknown as Record<string, unknown>,
      })
    } catch (err) {
      if (err instanceof KodiClientError && err.status === 401) {
        logger.warn(
          JSON.stringify({
            msg: 'plugin.auth_failed',
            instance_id: identity.instance_id,
            kind,
            idempotency_key,
          }),
        )
        return
      }
      if (outbox) {
        outbox.push(envelope)
      } else {
        logger.warn(
          JSON.stringify({
            msg: 'event emit failed',
            instance_id: identity.instance_id,
            kind,
            idempotency_key,
            error: err instanceof Error ? err.message : String(err),
          }),
        )
      }
    }
  }

  return { emit }
}
