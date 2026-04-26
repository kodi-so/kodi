import type { Hono } from 'hono'
import { z } from 'zod'
import { db, pluginVersions } from '@kodi/db'
import { env } from '../env'
import {
  PluginBundleConfigError,
  headPluginBundleObject,
} from '../lib/plugin-bundles'

const VERSION_REGEX = /^\d{4}-\d{2}-\d{2}-[a-f0-9]{7,40}$/
const BUNDLE_KEY_REGEX = /^bundles\/\d{4}-\d{2}-\d{2}-[a-f0-9]{7,40}\/kodi-bridge\.tgz$/
const SHA256_REGEX = /^[a-f0-9]{64}$/

const publishBodySchema = z
  .object({
    version: z.string().regex(VERSION_REGEX, 'version must be YYYY-MM-DD-<sha7-40>'),
    bundle_s3_key: z
      .string()
      .regex(BUNDLE_KEY_REGEX, 'bundle_s3_key must be bundles/<version>/kodi-bridge.tgz'),
    sha256: z.string().regex(SHA256_REGEX, 'sha256 must be 64 hex chars'),
    notes: z.string().max(2000).optional(),
  })
  .refine((b) => b.bundle_s3_key === `bundles/${b.version}/kodi-bridge.tgz`, {
    message: 'bundle_s3_key version segment must match top-level version',
    path: ['bundle_s3_key'],
  })

function isPublishAuthorized(headerValue: string | null): boolean {
  const token = env.PLUGIN_PUBLISH_ADMIN_TOKEN
  if (!token) return false
  return headerValue === token
}

function isUniqueViolation(err: unknown): boolean {
  // Postgres unique_violation = 23505. drizzle/postgres-js surfaces it on the
  // error object as `.code`.
  const e = err as { code?: string }
  return e?.code === '23505'
}

/**
 * Registers `POST /internal/plugin-versions/publish`.
 *
 * Called by CI after a kodi-bridge bundle has been uploaded to S3.
 * Verifies the S3 object exists, then inserts a row into `plugin_versions`
 * so instances can discover and install the new version.
 */
export function registerPluginVersionsRoutes(app: Hono): void {
  app.post('/internal/plugin-versions/publish', async (c) => {
    if (!isPublishAuthorized(c.req.header('x-admin-token') ?? null)) {
      return c.json({ error: 'Unauthorized' }, 401)
    }

    const rawBody = await c.req.json().catch(() => null)
    const parsed = publishBodySchema.safeParse(rawBody)
    if (!parsed.success) {
      return c.json({ error: 'Invalid body', details: parsed.error.flatten() }, 400)
    }
    const { version, bundle_s3_key, sha256, notes } = parsed.data

    let head
    try {
      head = await headPluginBundleObject(bundle_s3_key)
    } catch (err) {
      if (err instanceof PluginBundleConfigError) {
        return c.json({ error: err.message }, 503)
      }
      throw err
    }
    if (!head.ok && head.code === 'not_found') {
      return c.json({ error: `S3 object not found: ${bundle_s3_key}` }, 404)
    }
    if (!head.ok) {
      return c.json({ error: 'S3 lookup failed' }, 502)
    }

    try {
      const [row] = await db
        .insert(pluginVersions)
        .values({ version, bundleS3Key: bundle_s3_key, sha256, notes: notes ?? null })
        .returning()

      if (!row) {
        return c.json({ error: 'Insert returned no row' }, 500)
      }

      return c.json(
        {
          version: row.version,
          bundle_s3_key: row.bundleS3Key,
          sha256: row.sha256,
          released_at: row.releasedAt,
        },
        201,
      )
    } catch (err) {
      if (isUniqueViolation(err)) {
        return c.json({ error: `Version already published: ${version}` }, 409)
      }
      throw err
    }
  })
}
