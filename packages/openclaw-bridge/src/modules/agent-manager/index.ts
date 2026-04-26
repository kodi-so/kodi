import type { KodiBridgeModule } from '../../types/module'

/**
 * `agent-manager` — provisions and deprovisions OpenClaw agents per (org, user)
 * pair. Reconciles against Kodi at startup. Real impl: M4 (KOD-380, 381, 387).
 */
export const agentManagerModule: KodiBridgeModule = {
  id: 'agent-manager',
  register: () => {
    // KOD-380 fills registry/provision/deprovision; KOD-387 adds reconciliation.
  },
}
