import type { Hono } from 'hono'
import { z } from 'zod'
import { db, decrypt, eq, instances, pluginEventLog, type Instance } from '@kodi/db'
import { verifyRequest } from '@kodi/shared/hmac'

/**
 * Inbound event ingestion from kodi-bridge plugins.
 *
 * Two layers of auth on every request:
 *   1. `Authorization: Bearer <gateway_token>` resolves to an `instances` row.
 *   2. `x-kb-signature` + `x-kb-timestamp` + `x-kb-nonce` HMAC-verify the
 *      raw body using that instance's plugin_hmac_secret.
 *
 * Events dedupe via `(instance_id, idempotency_key)` on `plugin_event_log`;
 * replays are 200 OK with `{ deduped: true }`.
 *
 * In M2 the handler logs and persists; full event-kind dispatch lands in M3
 * (KOD-377).
 */

const eventEnvelopeSchema = z.object({
  protocol_version: z.string().min(1),
  kind: z.string().min(1),
  payload: z.unknown().optional(),
  idempotency_key: z.string().min(1),
  emitted_at: z.string().datetime().optional(),
  agent_id: z.string().min(1).optional(),
})

type EventEnvelope = z.infer<typeof eventEnvelopeSchema>

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

    // We need the raw body bytes to verify the signature. Hono's c.req.text()
    // gives us the verbatim body; we then JSON.parse from the same string the
    // signer used.
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

    // 3. Body shape
    let parsedJson: unknown
    try {
      parsedJson = JSON.parse(rawBody)
    } catch {
      return c.json({ error: 'Body is not valid JSON' }, 400)
    }
    const parsed = eventEnvelopeSchema.safeParse(parsedJson)
    if (!parsed.success) {
      return c.json({ error: 'Invalid envelope', details: parsed.error.flatten() }, 400)
    }
    const envelope: EventEnvelope = parsed.data

    // 4. Persist (idempotent on (instance_id, idempotency_key))
    try {
      await db.insert(pluginEventLog).values({
        instanceId: instance.id,
        agentId: envelope.agent_id ?? null,
        eventKind: envelope.kind,
        protocolVersion: envelope.protocol_version,
        payloadJson: (envelope.payload as object | null | undefined) ?? null,
        idempotencyKey: envelope.idempotency_key,
      })
    } catch (err) {
      if (isUniqueViolation(err)) {
        // M3 will dispatch handlers; for now, replays are a no-op success
        return c.json({ ok: true, deduped: true }, 200)
      }
      throw err
    }

    // 5. Stub dispatcher — real per-kind handlers land in M3-T7 (KOD-377)
    console.log(
      JSON.stringify({
        msg: 'openclaw event received',
        instance_id: instance.id,
        kind: envelope.kind,
        agent_id: envelope.agent_id ?? null,
        idempotency_key: envelope.idempotency_key,
      }),
    )

    return c.json({ ok: true }, 202)
  })
}
