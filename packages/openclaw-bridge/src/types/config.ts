import { Type, type Static } from '@sinclair/typebox'

/**
 * Single source of truth for the kodi-bridge plugin's runtime config.
 *
 * Mirrors the JSON Schema in `openclaw.plugin.json`. Validated at
 * `register(api)` time via `validateConfig` — invalid configs throw
 * loudly so a misconfigured deploy fails fast.
 */
export const KodiBridgeConfigSchema = Type.Object(
  {
    instance_id: Type.String({ minLength: 1 }),
    org_id: Type.String({ minLength: 1 }),
    kodi_api_base_url: Type.String({ format: 'uri' }),
    hmac_secret: Type.String({ minLength: 32 }),
    heartbeat_interval_seconds: Type.Integer({ minimum: 5, default: 60 }),
    bundle_check_interval_seconds: Type.Integer({ minimum: 60, default: 3600 }),
    outbox_path: Type.Optional(Type.String()),
  },
  { additionalProperties: false },
)

export type KodiBridgeConfig = Static<typeof KodiBridgeConfigSchema>

/**
 * Thrown by `validateConfig` when the runtime config does not match the
 * schema. Keeps a user-facing message + the raw issues so logs and the
 * `plugin.degraded` event can carry both.
 */
export class KodiBridgeConfigError extends Error {
  readonly issues: ReadonlyArray<{ path: string; message: string }>

  constructor(issues: ReadonlyArray<{ path: string; message: string }>) {
    const summary = issues.map((i) => `${i.path}: ${i.message}`).join('; ')
    super(`kodi-bridge config invalid: ${summary}`)
    this.name = 'KodiBridgeConfigError'
    this.issues = issues
  }
}

/**
 * Lightweight runtime validator. We don't pull in `ajv` for one schema —
 * a hand-rolled walk is enough for the small surface here and avoids
 * bloating the bundled plugin output.
 */
export function validateConfig(raw: unknown): KodiBridgeConfig {
  const issues: Array<{ path: string; message: string }> = []
  const v = raw as Record<string, unknown> | null

  if (!v || typeof v !== 'object') {
    throw new KodiBridgeConfigError([{ path: '', message: 'config must be an object' }])
  }

  const reqString = (key: string, minLength: number) => {
    const val = v[key]
    if (typeof val !== 'string' || val.length < minLength) {
      issues.push({ path: key, message: `must be a string of at least ${minLength} chars` })
    }
  }
  reqString('instance_id', 1)
  reqString('org_id', 1)
  reqString('hmac_secret', 32)

  if (typeof v.kodi_api_base_url !== 'string') {
    issues.push({ path: 'kodi_api_base_url', message: 'must be a string URL' })
  } else {
    try {
      new URL(v.kodi_api_base_url)
    } catch {
      issues.push({ path: 'kodi_api_base_url', message: 'must be a valid URL' })
    }
  }

  const optInt = (key: string, min: number) => {
    if (v[key] === undefined) return
    const val = v[key]
    if (typeof val !== 'number' || !Number.isInteger(val) || val < min) {
      issues.push({ path: key, message: `must be an integer ≥ ${min}` })
    }
  }
  optInt('heartbeat_interval_seconds', 5)
  optInt('bundle_check_interval_seconds', 60)

  if (v.outbox_path !== undefined && typeof v.outbox_path !== 'string') {
    issues.push({ path: 'outbox_path', message: 'must be a string when present' })
  }

  if (issues.length > 0) throw new KodiBridgeConfigError(issues)

  return {
    instance_id: v.instance_id as string,
    org_id: v.org_id as string,
    kodi_api_base_url: v.kodi_api_base_url as string,
    hmac_secret: v.hmac_secret as string,
    heartbeat_interval_seconds: (v.heartbeat_interval_seconds as number | undefined) ?? 60,
    bundle_check_interval_seconds: (v.bundle_check_interval_seconds as number | undefined) ?? 3600,
    outbox_path: v.outbox_path as string | undefined,
  }
}
