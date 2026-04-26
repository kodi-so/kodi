import { randomUUID } from 'node:crypto'
import { KodiClientError, type KodiClient } from './kodi-client'
import type { Identity } from './identity'

/**
 * Minimum-viable outbound path: emit one `plugin.started` event when the
 * plugin finishes loading. Kodi's events ingest (KOD-369) verifies the
 * HMAC + dedupes by `(instance_id, idempotency_key)` and logs the event.
 *
 * Envelope shape matches `apps/api/src/routes/openclaw-events.ts` exactly:
 *   { protocol_version, kind, payload, idempotency_key, emitted_at, agent_id? }
 *
 * The richer nested envelope (instance/agent/event sub-objects + verbosity)
 * lands when M3-T1 (KOD-371) defines the canonical schema and both sides
 * upgrade together. For now we match the receiver so the end-to-end smoke
 * test (KOD-370) actually exercises the round-trip.
 *
 * Delivery is fire-and-forget: errors are logged but never thrown — a
 * Kodi outage at startup must not break the plugin's own load. The full
 * event-bus (M3) replaces this with the disk outbox + retry loop.
 */

export const PLUGIN_STARTED_EVENT_KIND = 'plugin.started'
export const KODI_BRIDGE_PROTOCOL_VERSION = 'kodi-bridge.v1'
export const EVENTS_INGEST_PATH = '/api/openclaw/events'

export type EmitPluginStartedDeps = {
  kodiClient: KodiClient
  identity: Identity
  /** Override `process.pid` and `Date.now()` for tests. */
  pid?: number
  now?: () => number
  idempotencyKeyFactory?: () => string
  /** Override `console` for tests. */
  logger?: Pick<Console, 'log' | 'warn'>
}

export type PluginStartedEnvelope = {
  protocol_version: string
  kind: typeof PLUGIN_STARTED_EVENT_KIND
  payload: {
    pid: number
    started_at: string
    plugin_version: string
    instance_id: string
    org_id: string
  }
  idempotency_key: string
  emitted_at: string
}

export function buildPluginStartedEnvelope(
  identity: Identity,
  pid: number,
  now: number,
  idempotencyKey: string,
): PluginStartedEnvelope {
  const isoNow = new Date(now).toISOString()
  return {
    protocol_version: KODI_BRIDGE_PROTOCOL_VERSION,
    kind: PLUGIN_STARTED_EVENT_KIND,
    payload: {
      pid,
      started_at: isoNow,
      plugin_version: identity.plugin_version,
      instance_id: identity.instance_id,
      org_id: identity.org_id,
    },
    idempotency_key: idempotencyKey,
    emitted_at: isoNow,
  }
}

/**
 * Sends `plugin.started` to Kodi. Resolves once the call completes (success
 * or failure); never throws — caller can `await` without try/catch.
 */
export async function emitPluginStarted(deps: EmitPluginStartedDeps): Promise<void> {
  const {
    kodiClient,
    identity,
    pid = typeof process !== 'undefined' ? process.pid : 0,
    now = Date.now,
    idempotencyKeyFactory = randomUUID,
    logger = console,
  } = deps

  const envelope = buildPluginStartedEnvelope(identity, pid, now(), idempotencyKeyFactory())

  try {
    const res = await kodiClient.signedFetch(EVENTS_INGEST_PATH, {
      method: 'POST',
      body: envelope,
    })
    logger.log(
      JSON.stringify({
        msg: 'plugin.started emitted',
        instance_id: identity.instance_id,
        plugin_version: identity.plugin_version,
        idempotency_key: envelope.idempotency_key,
        status: res.status,
      }),
    )
  } catch (err) {
    const status = err instanceof KodiClientError ? err.status : null
    logger.warn(
      JSON.stringify({
        msg: 'plugin.started failed',
        instance_id: identity.instance_id,
        idempotency_key: envelope.idempotency_key,
        status,
        error: err instanceof Error ? err.message : String(err),
      }),
    )
  }
}
