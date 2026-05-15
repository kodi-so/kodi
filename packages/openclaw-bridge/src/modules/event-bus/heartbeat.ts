import type { Emitter } from './emitter'

/**
 * Periodic `heartbeat` emitter. Kodi reads the absence of heartbeats as
 * "this instance is dead"; absence is the signal, presence is the
 * acknowledgement. `instances.last_plugin_heartbeat_at` is updated by
 * the Kodi-side dispatcher on every receipt (see KOD-377).
 *
 * Subscription gating happens automatically inside `emitter.emit` —
 * if the active subscription map disables `heartbeat`, this tick's
 * emit returns without doing any work, so toggling the subscription
 * silences the heartbeat within one tick.
 *
 * Failure modes (ticket: "Heartbeat fails to emit: outbox catches it;
 * next tick still fires"):
 *   - 5xx → emitter pushes to outbox, returns without throwing
 *   - 401 → emitter logs auth_failed, returns without throwing
 * Either way, the next tick fires regardless.
 */

export type HeartbeatDeps = {
  emitter: Emitter
  /** Interval between ticks. */
  intervalSeconds: number
  /** Returns the current number of provisioned agents. M4 supplies this; for now defaults to 0. */
  getAgentCount?: () => number
  /** Override `Date.now()` for tests. Used to compute `uptime_s`. */
  now?: () => number
  setIntervalImpl?: typeof setInterval
  clearIntervalImpl?: typeof clearInterval
}

export type Heartbeat = {
  start: () => void
  stop: () => void
  /** Manually fire a tick — used in tests to avoid waiting on real timers. */
  tick: () => Promise<void>
  /**
   * Replace the function used to read `agent_count` for each tick. The
   * `agent-manager` module wires this to its registry after both modules
   * have registered (event-bus runs before agent-manager in the
   * registration order).
   */
  setAgentCountSource: (source: () => number) => void
}

export function createHeartbeat(deps: HeartbeatDeps): Heartbeat {
  const {
    emitter,
    intervalSeconds,
    getAgentCount,
    now = Date.now,
    setIntervalImpl = setInterval,
    clearIntervalImpl = clearInterval,
  } = deps

  const startedAt = now()
  let timer: ReturnType<typeof setInterval> | null = null
  let agentCountSource: () => number = getAgentCount ?? (() => 0)

  async function tick(): Promise<void> {
    const uptime_s = Math.max(0, Math.floor((now() - startedAt) / 1000))
    await emitter.emit('heartbeat', { uptime_s, agent_count: agentCountSource() })
  }

  function start(): void {
    if (timer) return
    timer = setIntervalImpl(() => {
      void tick()
    }, intervalSeconds * 1000)
    const t = timer as { unref?: () => void }
    t.unref?.()
  }

  function stop(): void {
    if (timer) {
      clearIntervalImpl(timer)
      timer = null
    }
  }

  return {
    start,
    stop,
    tick,
    setAgentCountSource: (source) => {
      agentCountSource = source
    },
  }
}
