import { S3Client, HeadObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'
import { db, desc, pluginVersions, type PluginVersion } from '@kodi/db'
import { env } from '../env'

/**
 * Helpers for the kodi-bridge plugin bundle distribution system.
 *
 * - Bundles are stored in a private S3 bucket (`PLUGIN_BUNDLE_S3_BUCKET`).
 * - Object key convention: `bundles/<version>/kodi-bridge.tgz`.
 * - Version format: `YYYY-MM-DD-<sha7+>` (matches the publish-endpoint regex).
 *
 * S3 bucket provisioning is owned by the infra ticket (KOD-357); these helpers
 * only consume the bucket. They throw a structured error at call time if env
 * vars are missing rather than failing at module load — so local dev without
 * AWS still boots.
 */

export class PluginBundleConfigError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'PluginBundleConfigError'
  }
}

export type PluginBundleConfig = {
  bucket: string
  region: string
  urlTtlSeconds: number
}

/**
 * Resolve and validate the plugin bundle env config. Throws a clear,
 * caller-facing error if any required value is missing.
 */
export function requirePluginBundleConfig(): PluginBundleConfig {
  const { PLUGIN_BUNDLE_S3_BUCKET, PLUGIN_BUNDLE_S3_REGION, PLUGIN_BUNDLE_URL_TTL_SECONDS } = env
  if (!PLUGIN_BUNDLE_S3_BUCKET || !PLUGIN_BUNDLE_S3_REGION) {
    throw new PluginBundleConfigError(
      'Plugin bundle S3 is not configured. Set PLUGIN_BUNDLE_S3_BUCKET and PLUGIN_BUNDLE_S3_REGION.',
    )
  }
  return {
    bucket: PLUGIN_BUNDLE_S3_BUCKET,
    region: PLUGIN_BUNDLE_S3_REGION,
    urlTtlSeconds: PLUGIN_BUNDLE_URL_TTL_SECONDS,
  }
}

let cachedClient: S3Client | undefined

/**
 * Singleton S3 client for plugin bundle operations. Lazy so dev environments
 * that don't have S3 configured still load the module. Reuses the standard
 * AWS credential chain (env vars > shared config > IAM role).
 */
export function getPluginBundleS3Client(): S3Client {
  if (cachedClient) return cachedClient
  const { region } = requirePluginBundleConfig()
  cachedClient = new S3Client({ region })
  return cachedClient
}

/**
 * Verify a bundle object exists in S3. Returns:
 *   - { ok: true }            — object found
 *   - { ok: false, code: 'not_found' } — 404 / NoSuchKey
 *   - { ok: false, code: 'error', error } — other S3 error (network, auth, …)
 */
export async function headPluginBundleObject(
  key: string,
): Promise<{ ok: true } | { ok: false; code: 'not_found' | 'error'; error?: unknown }> {
  const { bucket } = requirePluginBundleConfig()
  const client = getPluginBundleS3Client()

  try {
    await client.send(new HeadObjectCommand({ Bucket: bucket, Key: key }))
    return { ok: true }
  } catch (err) {
    const e = err as { name?: string; $metadata?: { httpStatusCode?: number } }
    if (e.name === 'NotFound' || e.$metadata?.httpStatusCode === 404) {
      return { ok: false, code: 'not_found' }
    }
    return { ok: false, code: 'error', error: err }
  }
}

/**
 * Returns the most recently released `plugin_versions` row, or null if no
 * versions have been published yet (fresh installs hit this case).
 */
export async function getLatestPluginVersion(): Promise<PluginVersion | null> {
  const rows = await db
    .select()
    .from(pluginVersions)
    .orderBy(desc(pluginVersions.releasedAt))
    .limit(1)
  return rows[0] ?? null
}

/**
 * Mints a presigned GetObject URL for an arbitrary bundle key. Used by the
 * cloud-init builder (KOD-368) to embed a one-shot download link in the
 * per-instance user-data — the plugin isn't running yet so it can't
 * authenticate via the gateway-token bundle endpoint, hence the direct
 * signed URL.
 *
 * `ttlSeconds` defaults to {@link requirePluginBundleConfig}'s configured
 * value; cloud-init callers usually pass a longer window (e.g. 30 min)
 * because the EC2 instance may take several minutes to boot.
 */
export async function signBundleDownloadUrl(
  key: string,
  ttlSeconds?: number,
): Promise<string> {
  const cfg = requirePluginBundleConfig()
  const client = getPluginBundleS3Client()
  return getSignedUrl(
    client,
    new GetObjectCommand({ Bucket: cfg.bucket, Key: key }),
    { expiresIn: ttlSeconds ?? cfg.urlTtlSeconds },
  )
}
