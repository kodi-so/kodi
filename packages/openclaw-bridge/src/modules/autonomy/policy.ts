import type { KodiClient } from '../bridge-core/kodi-client'

/**
 * Autonomy policy loader (KOD-389 / M5-T1).
 *
 * The plugin needs each agent's current autonomy policy to enforce
 * tool-invocation gates (KOD-390 / M5-T2). Policies live in Kodi's
 * `agent_autonomy_policies` table; the plugin caches them in-memory
 * and refreshes:
 *   - on cache miss
 *   - on cache TTL expiry (15 min default)
 *   - on inbound `POST /plugins/kodi-bridge/agents/update-policy` push
 *     (KOD-389 invalidation hook)
 *
 * Failure modes:
 *   - Kodi unreachable → return cached entry if any (even if stale),
 *     else return the default policy. Never throw to the caller; the
 *     enforcement path must always have *some* policy to evaluate.
 *   - 404 from Kodi → return default + cache it briefly so we don't
 *     hammer the route on every tool call.
 *
 * Cache is per-plugin-process; nothing persisted to disk.
 */

export type AutonomyLevel = 'strict' | 'normal' | 'lenient' | 'yolo'
export type AutonomyOverrideAction = 'allow' | 'ask' | 'deny'
export type AutonomyOverrides = Record<string, AutonomyOverrideAction>

export type AutonomyPolicy = {
  agent_id: string
  autonomy_level: AutonomyLevel
  overrides: AutonomyOverrides | null
}

export const DEFAULT_AUTONOMY_POLICY: Omit<AutonomyPolicy, 'agent_id'> = {
  autonomy_level: 'normal',
  overrides: null,
}

export function defaultPolicyFor(agent_id: string): AutonomyPolicy {
  return { agent_id, ...DEFAULT_AUTONOMY_POLICY }
}

/** Default cache TTL — 15 minutes per spec. */
export const DEFAULT_POLICY_TTL_MS = 15 * 60 * 1000

export type PolicyLoaderDeps = {
  kodiClient: KodiClient
  /** TTL override for tests. */
  ttlMs?: number
  /** Time source override for tests. */
  now?: () => number
  logger?: Pick<Console, 'log' | 'warn'>
}

export type PolicyLoader = {
  /** Fetch (or return cached) policy. Never throws. */
  getPolicy: (agentId: string) => Promise<AutonomyPolicy>
  /** Push a fresh policy into the cache (called from the inbound update route). */
  setPolicy: (policy: AutonomyPolicy) => void
  /** Drop the cache entry for an agent (forces re-fetch on next get). */
  invalidate: (agentId: string) => void
  /** Drop everything — used by reconciliation paths. */
  invalidateAll: () => void
  /** Diagnostic: snapshot the cache for tests / ops endpoints. */
  list: () => Array<{ agent_id: string; policy: AutonomyPolicy; expires_at: number }>
}

type CacheEntry = { policy: AutonomyPolicy; expiresAt: number }

const POLICY_PATH = (agentId: string) =>
  `/api/openclaw/agents/${encodeURIComponent(agentId)}/autonomy`

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}

const VALID_LEVELS: ReadonlySet<string> = new Set([
  'strict',
  'normal',
  'lenient',
  'yolo',
])

const VALID_OVERRIDE_ACTIONS: ReadonlySet<string> = new Set([
  'allow',
  'ask',
  'deny',
])

/**
 * Validate the wire shape from Kodi. Hand-rolled (no zod in bridge bundle).
 * Returns `null` on any structural mismatch — the caller treats `null` as
 * "use default" rather than fabricating partial data.
 */
export function parsePolicyResponse(v: unknown): AutonomyPolicy | null {
  if (!isPlainObject(v)) return null
  const { agent_id, autonomy_level, overrides } = v
  if (typeof agent_id !== 'string' || agent_id.length === 0) return null
  if (typeof autonomy_level !== 'string' || !VALID_LEVELS.has(autonomy_level)) {
    return null
  }

  let parsedOverrides: AutonomyOverrides | null = null
  if (overrides !== null && overrides !== undefined) {
    if (!isPlainObject(overrides)) return null
    const cleaned: AutonomyOverrides = {}
    for (const [key, action] of Object.entries(overrides)) {
      if (typeof action !== 'string' || !VALID_OVERRIDE_ACTIONS.has(action)) {
        return null
      }
      cleaned[key] = action as AutonomyOverrideAction
    }
    parsedOverrides = cleaned
  }

  return {
    agent_id,
    autonomy_level: autonomy_level as AutonomyLevel,
    overrides: parsedOverrides,
  }
}

export function createPolicyLoader(deps: PolicyLoaderDeps): PolicyLoader {
  const ttlMs = deps.ttlMs ?? DEFAULT_POLICY_TTL_MS
  const now = deps.now ?? Date.now
  const logger = deps.logger ?? console

  const cache = new Map<string, CacheEntry>()

  function setPolicy(policy: AutonomyPolicy): void {
    cache.set(policy.agent_id, {
      policy,
      expiresAt: now() + ttlMs,
    })
  }

  async function fetchFromKodi(agentId: string): Promise<AutonomyPolicy | null> {
    let response: Response
    try {
      response = await deps.kodiClient.signedFetch(POLICY_PATH(agentId), {
        method: 'GET',
      })
    } catch (err) {
      logger.warn(
        JSON.stringify({
          msg: 'autonomy.policy.fetch_failed',
          agent_id: agentId,
          error: err instanceof Error ? err.message : String(err),
        }),
      )
      return null
    }

    if (response.status === 404) return defaultPolicyFor(agentId)
    if (!response.ok) {
      logger.warn(
        JSON.stringify({
          msg: 'autonomy.policy.fetch_non_ok',
          agent_id: agentId,
          status: response.status,
        }),
      )
      return null
    }

    let json: unknown
    try {
      json = await response.json()
    } catch {
      logger.warn(
        JSON.stringify({
          msg: 'autonomy.policy.parse_failed',
          agent_id: agentId,
        }),
      )
      return null
    }

    return parsePolicyResponse(json)
  }

  async function getPolicy(agentId: string): Promise<AutonomyPolicy> {
    const cached = cache.get(agentId)
    if (cached && cached.expiresAt > now()) return cached.policy

    const fetched = await fetchFromKodi(agentId)
    if (fetched) {
      setPolicy(fetched)
      return fetched
    }

    // Fetch failed; fall back to stale cached entry if any, otherwise
    // the default. Either way the enforcement path can proceed —
    // KOD-389 says "use cached or default".
    if (cached) return cached.policy
    return defaultPolicyFor(agentId)
  }

  return {
    getPolicy,
    setPolicy,
    invalidate: (agentId) => {
      cache.delete(agentId)
    },
    invalidateAll: () => cache.clear(),
    list: () =>
      Array.from(cache.entries()).map(([agent_id, entry]) => ({
        agent_id,
        policy: entry.policy,
        expires_at: entry.expiresAt,
      })),
  }
}
