import type { KodiBridgeModule } from '../../types/module'

/**
 * `bridge-core` — shared foundation: identity, config, HMAC, KodiClient,
 * health endpoint. Runs first; populates `ctx.bridgeCore` so other modules
 * can pull the resolved identity and the Kodi HTTP client without
 * importing each other.
 *
 * Real implementation lands in KOD-365 (M2-T4).
 */
export const bridgeCoreModule: KodiBridgeModule = {
  id: 'bridge-core',
  register: () => {
    // KOD-365 fills this in: build KodiClient, register /health route, etc.
  },
}
