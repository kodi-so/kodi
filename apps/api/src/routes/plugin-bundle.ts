import type { Hono } from 'hono'
import { GetObjectCommand } from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'
import { db, decrypt, eq, instances, pluginVersions, desc, type Instance } from '@kodi/db'
import {
  PluginBundleConfigError,
  getPluginBundleS3Client,
  requirePluginBundleConfig,
} from '../lib/plugin-bundles'

/**
 * Find the running instance whose decrypted gateway token equals the
 * caller-provided bearer token. Linear scan over running instances —
 * acceptable at our scale (one instance per org, decrypt is AES-GCM).
 *
 * Returns:
 *   - { found: instance } on match
 *   - { error: 'unauthorized' } if no instance matches
 *   - { error: 'not-running', instance } if it matches but isn't running
 */
async function resolveInstanceByGatewayToken(
  bearer: string,
): Promise<
  | { found: Instance }
  | { error: 'unauthorized' }
  | { error: 'not-running'; instance: Instance }
> {
  const candidates = await db.select().from(instances).where(eq(instances.status, 'running'))

  for (const instance of candidates) {
    if (!instance.gatewayToken) continue
    try {
      if (decrypt(instance.gatewayToken) === bearer) {
        return { found: instance }
      }
    } catch {
      // Token failed to decrypt — bad ciphertext on this row; skip it.
    }
  }

  // Token didn't match any running instance. Check non-running statuses so
  // we can return 403 (instance exists but is suspended/etc.) instead of 401.
  const otherStatuses = ['pending', 'installing', 'error', 'suspended'] as const
  for (const status of otherStatuses) {
    const rows = await db.select().from(instances).where(eq(instances.status, status))
    for (const instance of rows) {
      if (!instance.gatewayToken) continue
      try {
        if (decrypt(instance.gatewayToken) === bearer) {
          return { error: 'not-running', instance }
        }
      } catch {
        // skip rows whose ciphertext can't be decrypted
      }
    }
  }

  return { error: 'unauthorized' }
}

function readBearerToken(headerValue: string | null): string | null {
  if (!headerValue) return null
  const match = /^Bearer\s+(.+)$/i.exec(headerValue.trim())
  return match?.[1] ?? null
}

type SignedBundle = {
  version: string
  bundle_url: string
  sha256: string
  released_at: string
}

async function buildSignedBundle(row: {
  version: string
  bundleS3Key: string
  sha256: string
  releasedAt: Date
}): Promise<SignedBundle> {
  const { bucket, urlTtlSeconds } = requirePluginBundleConfig()
  const client = getPluginBundleS3Client()
  const url = await getSignedUrl(
    client,
    new GetObjectCommand({ Bucket: bucket, Key: row.bundleS3Key }),
    { expiresIn: urlTtlSeconds },
  )
  return {
    version: row.version,
    bundle_url: url,
    sha256: row.sha256,
    released_at: row.releasedAt.toISOString(),
  }
}

/**
 * Registers:
 *   - GET /api/plugin-bundle/latest?current_version=<v>
 *   - GET /api/plugin-bundle/:version
 *
 * Both endpoints authenticate via `Authorization: Bearer <gateway_token>`
 * against the instances table. The plugin's self-update module (M6) hits
 * these to discover and download new bundles.
 */
export function registerPluginBundleRoutes(app: Hono): void {
  app.get('/api/plugin-bundle/latest', async (c) => {
    const bearer = readBearerToken(c.req.header('authorization') ?? null)
    if (!bearer) return c.json({ error: 'Unauthorized' }, 401)

    const auth = await resolveInstanceByGatewayToken(bearer)
    if ('error' in auth && auth.error === 'unauthorized') {
      return c.json({ error: 'Unauthorized' }, 401)
    }
    if ('error' in auth && auth.error === 'not-running') {
      return c.json({ error: `Instance is not running (status=${auth.instance.status})` }, 403)
    }
    const instance = auth.found

    // Pinned target overrides "latest" entirely (canary).
    let target
    if (instance.bundleVersionTarget) {
      const pinnedRows = await db
        .select()
        .from(pluginVersions)
        .where(eq(pluginVersions.version, instance.bundleVersionTarget))
        .limit(1)
      target = pinnedRows[0]
      if (!target) {
        return c.json(
          { error: `Pinned target version not found: ${instance.bundleVersionTarget}` },
          404,
        )
      }
    } else {
      const latestRows = await db
        .select()
        .from(pluginVersions)
        .orderBy(desc(pluginVersions.releasedAt))
        .limit(1)
      target = latestRows[0]
      if (!target) {
        return c.json({ error: 'No plugin versions published yet' }, 404)
      }
    }

    const currentVersion = c.req.query('current_version')
    if (currentVersion && currentVersion === target.version) {
      // Up to date — body must be empty per HTTP/1.1 304 semantics.
      return c.body(null, 304)
    }

    try {
      const signed = await buildSignedBundle(target)
      return c.json(signed, 200)
    } catch (err) {
      if (err instanceof PluginBundleConfigError) return c.json({ error: err.message }, 503)
      return c.json({ error: 'Failed to sign bundle URL' }, 502)
    }
  })

  app.get('/api/plugin-bundle/:version', async (c) => {
    const bearer = readBearerToken(c.req.header('authorization') ?? null)
    if (!bearer) return c.json({ error: 'Unauthorized' }, 401)

    const auth = await resolveInstanceByGatewayToken(bearer)
    if ('error' in auth && auth.error === 'unauthorized') {
      return c.json({ error: 'Unauthorized' }, 401)
    }
    if ('error' in auth && auth.error === 'not-running') {
      return c.json({ error: `Instance is not running (status=${auth.instance.status})` }, 403)
    }

    const version = c.req.param('version')
    const rows = await db
      .select()
      .from(pluginVersions)
      .where(eq(pluginVersions.version, version))
      .limit(1)

    const row = rows[0]
    if (!row) return c.json({ error: `Version not found: ${version}` }, 404)

    try {
      const signed = await buildSignedBundle(row)
      return c.json(signed, 200)
    } catch (err) {
      if (err instanceof PluginBundleConfigError) return c.json({ error: err.message }, 503)
      return c.json({ error: 'Failed to sign bundle URL' }, 502)
    }
  })
}
