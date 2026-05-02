import type { KodiBridgeContext, KodiBridgeModule } from '../../types/module'

/**
 * Composio integration: per-agent persistent Composio session + per-action
 * `api.registerTool` registrations. Real impl lands in M4 (KOD-382, KOD-386).
 *
 * The agent-manager calls into this module via `ctx.composio` for every
 * provision and deprovision. The contract below is the stable surface
 * KOD-382 must implement; this file ships a no-op that reports
 * `{ status: 'pending', registered_tool_count: actions.length }` so
 * agent-manager + inbound-api routes can land before the real Composio
 * wiring exists.
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

/**
 * One toolkit action exposed to the agent. Shape matches Kodi's outbound
 * provision payload (KOD-381 spec § "Body").
 */
export type ComposioAction = {
  /** Unique within this agent (e.g. `"gmail__send_email"`). */
  name: string
  description: string
  /** JSON Schema or TypeBox describing the tool's parameters. */
  parameters: unknown
  /** Composio toolkit slug (e.g. `"gmail"`). */
  toolkit: string
  /** Action slug within the toolkit (e.g. `"send_email"`). */
  action: string
}

export type ComposioModuleApi = {
  /**
   * Wire the per-agent persistent Composio session and synchronize the
   * registered tool list against `actions`. Idempotent: a second call with
   * the same `actions` list is a fast path (the real impl in KOD-382
   * diffs add/remove against currently-registered tools).
   *
   * Implementations MUST NOT throw — they should return a status reflecting
   * the outcome so the caller (agent-manager) can persist the agent
   * regardless of Composio reachability.
   */
  registerToolsForAgent: (params: {
    user_id: string
    openclaw_agent_id: string
    composio_session_id?: string | null
    actions: readonly ComposioAction[]
  }) => Promise<{ status: ComposioStatus; registered_tool_count: number }>

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
    registerToolsForAgent: async ({ actions }) => ({
      status: 'pending',
      registered_tool_count: actions.length,
    }),
    unregisterToolsForAgent: async () => {},
  }
}

export const composioModule: KodiBridgeModule = {
  id: 'composio',
  register: (_api, ctx: KodiBridgeContext) => {
    ctx.composio = createComposioStub()
  },
}
