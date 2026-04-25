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

/**
 * Registers `GET /plugins/kodi-bridge/health`. Real route registration
 * with OpenClaw lands in M2-T5 (KOD-366); this helper is the body-builder
 * that route reuses.
 */
export function buildHealthBody(state: HealthState, identity: Identity): {
  status: HealthState['status']
  plugin_version: string
  uptime_s: number
  agent_count: number
  last_heartbeat_sent_at: number | null
} {
  return {
    status: state.status,
    plugin_version: identity.plugin_version,
    uptime_s: Math.floor((Date.now() - state.startedAt) / 1000),
    agent_count: state.agentCount,
    last_heartbeat_sent_at: state.lastHeartbeatSentAt,
  }
}

/**
 * Marker function — KOD-366 fills in the actual `api.registerHttpRoute`
 * call. Kept here so the bridge-core public surface stays cohesive.
 */
export function registerHealthRoute(
  api: OpenClawPluginApi,
  state: HealthState,
  identity: Identity,
): void {
  // KOD-366: api.registerHttpRoute('GET', '/plugins/kodi-bridge/health', () => buildHealthBody(state, identity))
  void api
  void state
  void identity
}
