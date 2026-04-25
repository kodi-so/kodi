import { validateConfig, type KodiBridgeConfig } from '../../types/config'

/**
 * Resolves a single SecretRef-style placeholder. The OpenClaw plugin
 * runtime traditionally accepts `{ "$secret": "ENV_VAR_NAME" }` or a raw
 * string in config fields where secrets are expected. We accept either
 * shape here to remain tolerant of how cloud-init writes the config.
 *
 * The runtime resolver is injected to keep this module test-friendly:
 * tests pass a deterministic resolver instead of `process.env`.
 */
export type SecretResolver = (envVarName: string) => string | undefined

export type SecretRefLike = string | { $secret: string }

export function defaultSecretResolver(envVarName: string): string | undefined {
  if (typeof process === 'undefined') return undefined
  return process.env[envVarName]
}

function resolveSecretField(
  fieldName: string,
  raw: unknown,
  resolver: SecretResolver,
): string {
  if (typeof raw === 'string') return raw
  if (raw && typeof raw === 'object' && '$secret' in raw) {
    const env = (raw as { $secret: string }).$secret
    const value = resolver(env)
    if (!value) {
      throw new Error(
        `kodi-bridge config: ${fieldName} references secret "${env}" but the env var is unset`,
      )
    }
    return value
  }
  throw new Error(
    `kodi-bridge config: ${fieldName} must be a string or { "$secret": "<ENV_NAME>" }`,
  )
}

/**
 * Top-level config loader. Resolves SecretRef placeholders, then validates
 * the result against the JSON Schema mirrored in `validateConfig`.
 *
 * Throws clear, caller-facing errors on missing secrets or schema violations
 * so a misconfigured deploy fails loudly at `register(api)` time.
 */
export function loadConfig(
  rawConfig: unknown,
  resolver: SecretResolver = defaultSecretResolver,
): KodiBridgeConfig {
  if (!rawConfig || typeof rawConfig !== 'object') {
    throw new Error('kodi-bridge config: config must be an object')
  }
  const raw = rawConfig as Record<string, unknown>

  // Only fields that may carry SecretRefs need resolution; everything else is
  // passed through to the validator unchanged.
  const resolved: Record<string, unknown> = { ...raw }
  if ('hmac_secret' in raw) {
    resolved.hmac_secret = resolveSecretField(
      'hmac_secret',
      raw.hmac_secret as SecretRefLike,
      resolver,
    )
  }

  return validateConfig(resolved)
}
