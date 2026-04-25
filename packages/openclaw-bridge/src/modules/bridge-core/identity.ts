import type { KodiBridgeConfig } from '../../types/config'

/**
 * The plugin's stable identity, consumed by the event-bus, inbound-api,
 * autonomy, and memory modules. `plugin_version` is baked in at build time
 * via esbuild's `define` (CI sets `process.env.PLUGIN_VERSION` from the
 * release tag — e.g. `2026-04-21-abc1234`). Falls back to `'dev'` for
 * local builds where the var is not injected.
 */
export type Identity = {
  instance_id: string
  org_id: string
  plugin_version: string
}

const PLUGIN_VERSION: string =
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (typeof process !== 'undefined' && (process as any)?.env?.PLUGIN_VERSION) || 'dev'

export function buildIdentity(config: KodiBridgeConfig): Identity {
  return {
    instance_id: config.instance_id,
    org_id: config.org_id,
    plugin_version: PLUGIN_VERSION,
  }
}
