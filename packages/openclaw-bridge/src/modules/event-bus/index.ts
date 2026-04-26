import * as path from 'node:path'
import type { KodiBridgeContext, KodiBridgeModule } from '../../types/module'
import type { BridgeCore } from '../bridge-core'
import {
  createEmitter,
  DEFAULT_SUBSCRIPTIONS,
  type Emitter,
  type Subscriptions,
} from './emitter'
import { registerHookBindings } from './hook-bindings'
import { createDiskOutbox, type DiskOutbox } from './outbox'
import { createHeartbeat, type Heartbeat } from './heartbeat'

/**
 * `event-bus` — outbound typed events to Kodi (signed POSTs to
 * `/api/openclaw/events`), subscription-based verbosity, OpenClaw hook
 * bindings, and a disk-backed retry outbox (KOD-374).
 *
 * This module owns the canonical envelope (per KOD-371) and replaces the
 * inline `plugin.started` emission from KOD-367 — bridge-core no longer
 * emits directly; instead the event-bus fires `plugin.started` once it
 * has wired the emitter and hooks.
 *
 * Subscription config defaults to `DEFAULT_SUBSCRIPTIONS` (every kind
 * `enabled: true, verbosity: 'summary'`) until the M3-T5 (KOD-375) loader
 * supplies the real config; that loader will mutate the holder so changes
 * apply atomically without re-registering hooks.
 *
 * Outbox: failed emits land in `<outbox_path>/pending.jsonl`; the outbox
 * flushes on startup and every 30s thereafter. Disk-full → emit
 * `plugin.degraded` over the network path so Kodi sees the signal even
 * when local persistence is broken.
 */

const DEFAULT_OUTBOX_PATH = '/var/lib/kodi-bridge/outbox'

export type EventBus = {
  emitter: Emitter
  outbox: DiskOutbox
  heartbeat: Heartbeat
  /** Mutable holder so KOD-375 can swap subscriptions in place. */
  setSubscriptions: (next: Subscriptions) => void
  /** Currently-active subscription map, for diagnostics. */
  getSubscriptions: () => Subscriptions
  /** Cancel the outbox + heartbeat timers on shutdown. */
  shutdown: () => void
}

export const eventBusModule: KodiBridgeModule = {
  id: 'event-bus',
  register: (api, ctx: KodiBridgeContext) => {
    const bridgeCore = ctx.bridgeCore as BridgeCore | undefined
    if (!bridgeCore) {
      throw new Error('event-bus requires bridge-core to register first')
    }

    let subscriptions: Subscriptions = DEFAULT_SUBSCRIPTIONS
    const outboxPath = path.resolve(ctx.config.outbox_path ?? DEFAULT_OUTBOX_PATH)

    const outbox = createDiskOutbox({
      outboxPath,
      kodiClient: bridgeCore.kodiClient,
      onDegraded: (reason) => {
        // Cross over to the network path — even if disk is dead, Kodi
        // should see `plugin.degraded` so ops can react.
        void emitter.emit('plugin.degraded', {
          reason,
          since: new Date().toISOString(),
        })
      },
    })

    const emitter = createEmitter({
      kodiClient: bridgeCore.kodiClient,
      identity: bridgeCore.identity,
      subscriptions: () => subscriptions,
      outbox: { push: (env) => void outbox.push(env) },
    })

    registerHookBindings(api, emitter)

    // Kick off the periodic flush + initial drain. Errors are logged
    // inside `outbox.start()`; we don't block plugin load on them.
    void outbox.start()

    // Heartbeat: starts immediately so Kodi sees liveness within the first
    // tick. Subscription gating happens inside emitter.emit, so toggling
    // `heartbeat` in subscriptions silences output on the next tick.
    const heartbeat = createHeartbeat({
      emitter,
      intervalSeconds: ctx.config.heartbeat_interval_seconds,
      // M4 wires this to ctx.agentManager.count(); for now we report 0.
      getAgentCount: () => 0,
    })
    heartbeat.start()

    const eventBus: EventBus = {
      emitter,
      outbox,
      heartbeat,
      setSubscriptions: (next) => {
        subscriptions = next
      },
      getSubscriptions: () => subscriptions,
      shutdown: () => {
        heartbeat.stop()
        outbox.stop()
      },
    }
    ctx.eventBus = eventBus

    // Fire the startup beacon through the canonical envelope. Fire-and-forget;
    // a Kodi outage at boot must never break the plugin load. The emitter
    // already swallows errors and logs / falls back to the outbox.
    void emitter.emit('plugin.started', {
      pid: typeof process !== 'undefined' ? process.pid : 0,
      started_at: new Date().toISOString(),
    })
  },
}

export {
  createEmitter,
  DEFAULT_SUBSCRIPTIONS,
  resolveSubscription,
  EVENTS_INGEST_PATH,
  type Emitter,
  type EmitOptions,
  type EmitterDeps,
  type Subscriptions,
  type SubscriptionEntry,
} from './emitter'
export {
  registerHookBindings,
  buildHookBindings,
  HOOK_NAMES,
  type HookBindings,
  type HookName,
} from './hook-bindings'
export {
  createDiskOutbox,
  DEFAULT_FLUSH_INTERVAL_MS,
  DEFAULT_MAX_FILE_BYTES,
  type DiskOutbox,
  type DiskOutboxDeps,
  type FlushResult,
} from './outbox'
export { createHeartbeat, type Heartbeat, type HeartbeatDeps } from './heartbeat'
