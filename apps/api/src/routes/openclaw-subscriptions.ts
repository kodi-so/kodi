import type { Hono } from 'hono'
import { z } from 'zod'
import { db, decrypt, eq, instances, pluginEventSubscriptions, type Instance } from '@kodi/db'
import { KODI_BRIDGE_PROTOCOL } from '@kodi/shared/events'
import { env } from '../env'
import {
  buildDefaultSubscriptions,
  SubscriptionsSchema,
  type Subscriptions,
} from '../lib/openclaw-events/subscriptions'
import { pushAdminReload } from '../lib/openclaw/plugin-client'

/**
 * Subscription read/write surface for the kodi-bridge plugin.
 *
 *   - GET  /api/openclaw/subscriptions?instance_id=<id>
 *       Plugin-side caller. Auth: `Authorization: Bearer <gateway_token>`.
 *       Resolves the instance from the bearer; the `instance_id` query
 *       parameter must match (defense in depth so a leaked token can't
 *       read other instances' configs). Returns the persisted row or the
 *       § 4.2 default if none.
 *
 *   - PUT  /api/openclaw/subscriptions
 *       Admin caller (UI / internal tooling). Auth: `x-admin-token` ==
 *       `PLUGIN_PUBLISH_ADMIN_TOKEN` (placeholder; the real admin UI will
 *       come through tRPC + org-role auth in a follow-up).
 *       Body: `{ instance_id, subscriptions }`. Upserts the row.
 *       Returns the new row. KOD-379 extends this handler to push
 *       `/admin/reload` to the plugin so the change applies in seconds.
 */

const putBodySchema = z.object({
  instance_id: z.string().min(1),
  subscriptions: SubscriptionsSchema,
})

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
      /* skip rows whose ciphertext can't be decrypted */
    }
  }
  return null
}

function isAdminAuthorized(headerValue: string | null): boolean {
  const token = env.PLUGIN_PUBLISH_ADMIN_TOKEN
  if (!token) return false
  return headerValue === token
}

async function readSubscriptionsRow(
  instanceId: string,
): Promise<{ subscriptions: Subscriptions; persisted: boolean }> {
  const [row] = await db
    .select()
    .from(pluginEventSubscriptions)
    .where(eq(pluginEventSubscriptions.instanceId, instanceId))
    .limit(1)
  if (!row) {
    return { subscriptions: buildDefaultSubscriptions(), persisted: false }
  }
  // The jsonb is unconstrained at DB level; validate before returning.
  const parsed = SubscriptionsSchema.safeParse(row.subscriptions)
  if (!parsed.success) {
    return { subscriptions: buildDefaultSubscriptions(), persisted: false }
  }
  return { subscriptions: parsed.data, persisted: true }
}

export function registerOpenClawSubscriptionsRoutes(app: Hono): void {
  app.get('/api/openclaw/subscriptions', async (c) => {
    const bearer = readBearerToken(c.req.header('authorization') ?? null)
    if (!bearer) return c.json({ error: 'Unauthorized' }, 401)

    const instance = await resolveInstanceByToken(bearer)
    if (!instance) return c.json({ error: 'Unauthorized' }, 401)

    const queryInstanceId = c.req.query('instance_id')
    if (queryInstanceId && queryInstanceId !== instance.id) {
      return c.json({ error: 'instance_id query does not match bearer' }, 403)
    }

    const { subscriptions, persisted } = await readSubscriptionsRow(instance.id)
    return c.json({
      protocol_version: KODI_BRIDGE_PROTOCOL,
      instance_id: instance.id,
      subscriptions,
      persisted,
    })
  })

  app.put('/api/openclaw/subscriptions', async (c) => {
    if (!isAdminAuthorized(c.req.header('x-admin-token') ?? null)) {
      return c.json({ error: 'Unauthorized' }, 401)
    }

    const rawBody = await c.req.json().catch(() => null)
    const parsed = putBodySchema.safeParse(rawBody)
    if (!parsed.success) {
      return c.json({ error: 'Invalid body', details: parsed.error.flatten() }, 400)
    }
    const { instance_id, subscriptions } = parsed.data

    const [target] = await db
      .select()
      .from(instances)
      .where(eq(instances.id, instance_id))
      .limit(1)
    if (!target) {
      return c.json({ error: `Instance not found: ${instance_id}` }, 404)
    }

    const [row] = await db
      .insert(pluginEventSubscriptions)
      .values({
        instanceId: instance_id,
        protocolVersion: KODI_BRIDGE_PROTOCOL,
        subscriptions,
        updatedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: pluginEventSubscriptions.instanceId,
        set: {
          protocolVersion: KODI_BRIDGE_PROTOCOL,
          subscriptions,
          updatedAt: new Date(),
        },
      })
      .returning()

    if (!row) {
      return c.json({ error: 'Upsert returned no row' }, 500)
    }

    // Push /admin/reload so the plugin picks the change up within seconds.
    // Per ticket: failure during push must NOT block the PUT — the plugin's
    // 10-minute refetch is the worst-case fallback. We log every failure
    // mode so a Kodi-side dashboard can surface the misconfiguration.
    const reload =
      target.status === 'running'
        ? await pushAdminReload(target)
        : ({ ok: false, reason: 'instance-not-running' } as const)

    if (!reload.ok) {
      const level = reload.reason === 'unauthorized' ? 'error' : 'warn'
      console[level === 'error' ? 'error' : 'warn'](
        JSON.stringify({
          msg: 'subscriptions push reload failed',
          instance_id: instance_id,
          reason: reload.reason,
          status: 'status' in reload ? reload.status : undefined,
          error: 'error' in reload ? reload.error : undefined,
        }),
      )
    }

    return c.json(
      {
        protocol_version: row.protocolVersion,
        instance_id: row.instanceId,
        subscriptions: row.subscriptions,
        updated_at: row.updatedAt,
        reload_pushed: reload.ok,
        reload_reason: reload.ok ? null : reload.reason,
      },
      200,
    )
  })
}
