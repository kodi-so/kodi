import type { KodiBridgeContext, KodiBridgeModule } from '../../types/module'

/**
 * Composio integration: per-agent persistent Composio session + per-action
 * `api.registerTool` registrations. Real impl lands in M4 (KOD-382, KOD-386).
 *
 * KOD-380 (agent-manager) calls into this module via `ctx.composio` whenever
 * an agent is provisioned or deprovisioned. The contract below is the stable
 * surface KOD-382 must implement; this file ships a no-op that returns
 * `{ status: 'pending' }` so M4-T1 can land before M4-T3.
 *
 * NOTE: this module does NOT use `openclaw mcp set` — see
 * `docs/openclaw-bridge/spike/m0-mcp.md` for the corrected mechanism.
 */

export type ComposioStatus =
  | 'pending'
  | 'active'
  | 'failed'
  | 'disconnected'
  | 'skipped'

export type ComposioModuleApi = {
  /**
   * Wire the per-agent persistent Composio session and register every action
   * that user has authorized as a plugin tool scoped to this agent.
   *
   * Implementations MUST NOT throw — they should return a status reflecting
   * the outcome so the caller (agent-manager) can persist the agent regardless
   * of Composio reachability.
   */
  registerToolsForAgent: (params: {
    user_id: string
    openclaw_agent_id: string
    composio_session?: unknown
  }) => Promise<{ status: ComposioStatus }>

  /**
   * Tear down the per-agent Composio session and unregister all tools that
   * were registered for this agent. Should not throw.
   */
  unregisterToolsForAgent: (params: {
    openclaw_agent_id: string
  }) => Promise<void>
}

/** No-op implementation used until KOD-382 lands. */
export function createComposioStub(): ComposioModuleApi {
  return {
    registerToolsForAgent: async () => ({ status: 'pending' }),
    unregisterToolsForAgent: async () => {},
  }
}

export const composioModule: KodiBridgeModule = {
  id: 'composio',
  register: (_api, ctx: KodiBridgeContext) => {
    ctx.composio = createComposioStub()
  },
}
