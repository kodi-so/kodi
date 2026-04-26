import type { KodiBridgeModule } from '../../types/module'

/**
 * `composio` — per-user Composio SDK session cache + per-action `api.registerTool`
 * registrations. Real impl: M4 (KOD-382, KOD-386).
 *
 * NOTE: this module does NOT use `openclaw mcp set` — see
 * `docs/openclaw-bridge/spike/m0-mcp.md` for the corrected mechanism.
 */
export const composioModule: KodiBridgeModule = {
  id: 'composio',
  register: () => {
    // KOD-382 fills register-tools / unregister-tools / session cache.
  },
}
