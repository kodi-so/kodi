import type { Hono } from 'hono'
import { db, decrypt, eq, instances, pluginEventLog, type Instance } from '@kodi/db'
import { verifyRequest } from '@kodi/shared/hmac'
import {
  EventEnvelopeSchema,
  type EventEnvelope,
} from '@kodi/shared/events'
import { dispatchEvent, UnknownEventKindError } from '../lib/openclaw-events/dispatcher'

/**
 * Inbound event ingestion from kodi-bridge plugins.
 *
 * Two layers of auth on every request:
 *   1. `Authorization: Bearer <gateway_token>` resolves to an `instances` row.
 *   2. `x-kb-signature` + `x-kb-timestamp` + `x-kb-nonce` HMAC-verify the
 *      raw body using that instance's plugin_hmac_secret.
 *
 * Body shape: the canonical envelope from `@kodi/shared/events` (KOD-371).
 * The route persists every event to `plugin_event_log` first — that's the
 * audit row of record — then runs the per-kind dispatcher (KOD-377). On
 * dispatcher failure we return 500 so the plugin retries; the persisted
 * row stays put and dedupe via `(instance_id, idempotency_key)` keeps
 * the retry idempotent.
 */

function readBearerToken(headerValue: string | null): string | null {
  if (!headerValue) return null
  const match = /^Bearer\s+(.+)$/i.exec(headerValue.trim())
  return match?.[1] ?? null
}

async function resolveInstanceByToken(bearer: string): Promise<Instance | null> {
  const candidates = await db.select().from(instances).where(eq(instances.status, 'running'))
  for (const instance of candidates) {
    if (!instance.gatewayToken) continue
    try {
      if (decrypt(instance.gatewayToken) === bearer) return instance
    } catch {
      // skip rows whose ciphertext can't be decrypted
    }
  }
  return null
}

function isUniqueViolation(err: unknown): boolean {
  return (err as { code?: string })?.code === '23505'
}

export function registerOpenClawEventsRoutes(app: Hono): void {
  app.post('/api/openclaw/events', async (c) => {
    // 1. Bearer auth → instance
    const bearer = readBearerToken(c.req.header('authorization') ?? null)
    if (!bearer) return c.json({ error: 'Unauthorized' }, 401)

    const instance = await resolveInstanceByToken(bearer)
    if (!instance) return c.json({ error: 'Unauthorized' }, 401)

    // 2. HMAC signature over raw body using the instance's plugin secret
    if (!instance.pluginHmacSecretEncrypted) {
      return c.json({ error: 'Instance has no plugin HMAC secret configured' }, 401)
    }

    let pluginSecret: string
    try {
      pluginSecret = decrypt(instance.pluginHmacSecretEncrypted)
    } catch {
      return c.json({ error: 'Failed to resolve instance plugin secret' }, 500)
    }

    const sigHeader = c.req.header('x-kb-signature') ?? ''
    const tsHeader = c.req.header('x-kb-timestamp') ?? ''
    const nonceHeader = c.req.header('x-kb-nonce') ?? ''

    const ts = Number.parseInt(tsHeader, 10)
    if (!sigHeader || !nonceHeader || !Number.isFinite(ts)) {
      return c.json({ error: 'Unauthorized' }, 401)
    }

    const rawBody = await c.req.text()
    const verify = verifyRequest({
      body: rawBody,
      secret: pluginSecret,
      timestamp: ts,
      nonce: nonceHeader,
      signature: sigHeader,
    })
    if (!verify.ok) {
      // Don't leak SKEW vs SIGNATURE distinction at the boundary
      return c.json({ error: 'Unauthorized' }, 401)
    }

    // 3. Body shape — canonical envelope from KOD-371
    let parsedJson: unknown
    try {
      parsedJson = JSON.parse(rawBody)
    } catch {
      return c.json({ error: 'Body is not valid JSON' }, 400)
    }
    const parsed = EventEnvelopeSchema.safeParse(parsedJson)
    if (!parsed.success) {
      return c.json({ error: 'Invalid envelope', details: parsed.error.flatten() }, 400)
    }
    const envelope: EventEnvelope = parsed.data

    // 4. Persist (idempotent on (instance_id, idempotency_key))
    try {
      await db.insert(pluginEventLog).values({
        instanceId: instance.id,
        agentId: envelope.agent?.agent_id ?? null,
        eventKind: envelope.event.kind,
        protocolVersion: envelope.protocol,
        payloadJson: (envelope.event.payload as object | null | undefined) ?? null,
        idempotencyKey: envelope.event.idempotency_key,
      })
    } catch (err) {
      if (isUniqueViolation(err)) {
        // Replay: row already in plugin_event_log, dispatcher already ran.
        return c.json({ ok: true, deduped: true }, 200)
      }
      throw err
    }

    // 5. Dispatch per-kind side effect
    try {
      await dispatchEvent({ envelope, instance })
    } catch (err) {
      if (err instanceof UnknownEventKindError) {
        // The row is already in plugin_event_log so the audit trail keeps
        // it; we still surface 400 so the plugin (and observability) sees
        // an explicit signal that this kind is not recognised.
        return c.json(
          { error: 'Unknown event kind', code: 'UNKNOWN_KIND', kind: err.receivedKind },
          400,
        )
      }
      console.error(
        JSON.stringify({
          msg: 'openclaw event dispatch failed',
          instance_id: instance.id,
          kind: envelope.event.kind,
          idempotency_key: envelope.event.idempotency_key,
          error: err instanceof Error ? err.message : String(err),
        }),
      )
      return c.json({ error: 'Dispatch failed', code: 'DISPATCH_FAILED' }, 500)
    }

    console.log(
      JSON.stringify({
        msg: 'openclaw event handled',
        instance_id: instance.id,
        kind: envelope.event.kind,
        agent_id: envelope.agent?.agent_id ?? null,
        idempotency_key: envelope.event.idempotency_key,
      }),
    )

    return c.json({ ok: true }, 202)
  })
}
