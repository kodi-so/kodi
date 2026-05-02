import type { OpenClawPluginApi } from 'openclaw/plugin-sdk'
import type { KodiBridgeConfig } from './config'

/**
 * Shared shape every kodi-bridge submodule implements. Each module ships an
 * `index.ts` exporting a single `register(api, ctx)` function. The plugin
 * entry (`src/index.ts`) calls them in a deterministic order during the
 * plugin's `register(api)` lifecycle.
 *
 * Modules MUST NOT import each other directly — cross-module dependencies
 * flow through `ctx`, populated by the `bridge-core` module (which runs first).
 *
 * In M2 the modules are stubs; their real behavior lands in M3+ tickets.
 */
export type KodiBridgeContext = {
  config: KodiBridgeConfig
  /**
   * Set by `bridge-core` once it has resolved identity, HMAC client, etc.
   * Typed loosely here to avoid premature coupling; tightened in KOD-365.
   */
  bridgeCore?: unknown
  /** Set by the `agent-manager` module (KOD-380). */
  agentManager?: unknown
  /** Set by the `composio` module — interface contract lives in `modules/composio`. */
  composio?: unknown
  eventBus?: unknown
  inboundApi?: unknown
  autonomy?: unknown
  updater?: unknown
  memory?: unknown
}

export type KodiBridgeModule = {
  /** Stable id used for logs and ordering. Matches the directory name. */
  readonly id: string
  /**
   * Called once during plugin `register(api)`. Modules return synchronously
   * or via Promise; the plugin entry awaits each one in declared order.
   */
  register: (api: OpenClawPluginApi, ctx: KodiBridgeContext) => void | Promise<void>
}
