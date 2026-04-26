import type { KodiBridgeModule } from '../../types/module'

/**
 * `inbound-api` — HTTP routes Kodi calls into, all wrapped in HMAC verify
 * middleware. Real impl: M3-T6 (KOD-376) + M4-T2 (KOD-381) + M5-T3 (KOD-391).
 */
export const inboundApiModule: KodiBridgeModule = {
  id: 'inbound-api',
  register: () => {
    // KOD-376 wires verify middleware + 501 stubs; KOD-381 fills agents/provision.
  },
}
