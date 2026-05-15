import type { KodiBridgeModule } from '../../types/module'

/**
 * `updater` — pull-based self-update loop. Polls Kodi's bundle endpoint,
 * verifies sha256, atomic symlink swap, rollback on health-check failure.
 * Real impl: M6 (KOD-396 through KOD-403).
 */
export const updaterModule: KodiBridgeModule = {
  id: 'updater',
  register: () => {
    // KOD-396 check loop; KOD-397 download + verify; KOD-399 swap; KOD-400 rollback.
  },
}
