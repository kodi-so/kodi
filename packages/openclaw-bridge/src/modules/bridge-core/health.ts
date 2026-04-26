import type { OpenClawPluginApi } from 'openclaw/plugin-sdk'
import type { Identity } from './identity'

/**
 * Tracks plugin uptime + the bridge-core's last-known degraded state.
 * Other modules write to it (e.g., event-bus reports outbox depth, updater
 * marks `degraded` while a swap is in flight). The /health route reads it.
 */
export type HealthState = {
  startedAt: number
  /** Mutable counters/markers updated by other modules. */
  agentCount: number
  lastHeartbeatSentAt: number | null
  status: 'ok' | 'degraded'
}

export function createHealthState(): HealthState {
  return {
    startedAt: Date.now(),
    agentCount: 0,
    lastHeartbeatSentAt: null,
    status: 'ok',
  }
}

export type HealthBody = {
  status: HealthState['status']
  plugin_version: string
  uptime_s: number
  agent_count: number
  last_heartbeat_sent_at: number | null
}

export function buildHealthBody(state: HealthState, identity: Identity): HealthBody {
  return {
    status: state.status,
    plugin_version: identity.plugin_version,
    uptime_s: Math.floor((Date.now() - state.startedAt) / 1000),
    agent_count: state.agentCount,
    last_heartbeat_sent_at: state.lastHeartbeatSentAt,
  }
}

/**
 * Sliding-window rate limiter — 60 req/min by default. Used because the
 * OpenClaw plugin SDK does not expose a built-in rate-limit option on
 * registerHttpRoute. Per-IP keys; falls back to a single global bucket
 * when the source IP can't be determined.
 */
export type RateLimiter = {
  consume: (key: string) => boolean
}

export function createRateLimiter(limit = 60, windowMs = 60_000): RateLimiter {
  const buckets = new Map<string, number[]>()
  return {
    consume(key: string) {
      const now = Date.now()
      const cutoff = now - windowMs
      const hits = buckets.get(key) ?? []
      // drop stale hits (cheaper than re-allocating)
      let i = 0
      while (i < hits.length && hits[i]! <= cutoff) i += 1
      const live = i === 0 ? hits : hits.slice(i)
      if (live.length >= limit) {
        buckets.set(key, live)
        return false
      }
      live.push(now)
      buckets.set(key, live)
      return true
    },
  }
}

/**
 * Registers `GET /plugins/kodi-bridge/health`.
 *
 * No auth on this route — health is meant to be probed by any local
 * orchestrator (cloud-init, the updater's pre-swap probe, ops scripts).
 * `auth: 'plugin'` is the SDK enum value that lets us own the gating;
 * we accept everything and let the rate limiter handle abuse.
 */
export function registerHealthRoute(
  api: OpenClawPluginApi,
  state: HealthState,
  identity: Identity,
  limiter: RateLimiter = createRateLimiter(),
): void {
  api.registerHttpRoute({
    path: '/plugins/kodi-bridge/health',
    auth: 'plugin',
    handler: (req, res) => {
      // Method check — registerHttpRoute is path-based; restrict to GET.
      if (req.method && req.method !== 'GET') {
        res.statusCode = 405
        res.setHeader('Allow', 'GET')
        res.end()
        return true
      }

      // Rate-limit per source IP. Express-ish reverse-proxies inject
      // x-forwarded-for; fall back to the socket's remoteAddress.
      const forwarded = (req.headers['x-forwarded-for'] as string | undefined) ?? ''
      const sourceIp =
        forwarded.split(',')[0]?.trim() ||
        req.socket.remoteAddress ||
        'unknown'
      if (!limiter.consume(sourceIp)) {
        res.statusCode = 429
        res.setHeader('Content-Type', 'application/json')
        res.end(JSON.stringify({ error: 'rate_limited' }))
        return true
      }

      res.statusCode = 200
      res.setHeader('Content-Type', 'application/json')
      res.end(JSON.stringify(buildHealthBody(state, identity)))
      return true
    },
  })
}
