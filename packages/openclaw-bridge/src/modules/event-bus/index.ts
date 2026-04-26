import type { KodiBridgeContext, KodiBridgeModule } from '../../types/module'
import type { BridgeCore } from '../bridge-core'
import {
  createEmitter,
  DEFAULT_SUBSCRIPTIONS,
  type Emitter,
  type Subscriptions,
} from './emitter'
import { registerHookBindings } from './hook-bindings'

/**
 * `event-bus` — outbound typed events to Kodi (signed POSTs to
 * `/api/openclaw/events`), subscription-based verbosity, OpenClaw hook
 * bindings.
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
 * Outbox: M3-T4 (KOD-374) plugs in the disk-backed retry queue. Until
 * then, failed emits log a warning and drop.
 */

export type EventBus = {
  emitter: Emitter
  /** Mutable holder so KOD-375 can swap subscriptions in place. */
  setSubscriptions: (next: Subscriptions) => void
  /** Currently-active subscription map, for diagnostics. */
  getSubscriptions: () => Subscriptions
}

export const eventBusModule: KodiBridgeModule = {
  id: 'event-bus',
  register: (api, ctx: KodiBridgeContext) => {
    const bridgeCore = ctx.bridgeCore as BridgeCore | undefined
    if (!bridgeCore) {
      throw new Error('event-bus requires bridge-core to register first')
    }

    let subscriptions: Subscriptions = DEFAULT_SUBSCRIPTIONS
    const emitter = createEmitter({
      kodiClient: bridgeCore.kodiClient,
      identity: bridgeCore.identity,
      subscriptions: () => subscriptions,
    })

    registerHookBindings(api, emitter)

    const eventBus: EventBus = {
      emitter,
      setSubscriptions: (next) => {
        subscriptions = next
      },
      getSubscriptions: () => subscriptions,
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
