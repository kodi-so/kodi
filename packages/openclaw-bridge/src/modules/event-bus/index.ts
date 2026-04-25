import type { KodiBridgeModule } from '../../types/module'

/**
 * `event-bus` — outbound typed events to Kodi (signed POSTs to
 * `/api/openclaw/events`), subscription-based verbosity, disk-backed
 * retry outbox. Real impl: M3 (KOD-373, KOD-374, KOD-378).
 */
export const eventBusModule: KodiBridgeModule = {
  id: 'event-bus',
  register: () => {
    // KOD-373 wires hook-bindings + emitter; KOD-374 adds outbox; KOD-378 heartbeat.
  },
}
