/**
 * Per-agent Composio session + tool-name cache.
 *
 * One entry per `openclaw_agent_id`. Each entry holds:
 *   - the opaque `composio_session_id` Kodi sent us at provision time
 *   - the set of tool names this agent is currently *allowed* to invoke
 *
 * The OpenClaw plugin SDK does NOT expose `api.unregisterTool`, so once a
 * tool is registered via `api.registerTool` it lives on the plugin runtime
 * for the lifetime of the process. To make per-agent revocation work we
 * gate at execute-time: each registered tool's `execute` callback checks
 * `allowedToolNames.has(name)` for its agent and returns a structured
 * "revoked" error otherwise. Removing a tool from the allowed set is
 * therefore equivalent to unregistering for that agent.
 */
export type ComposioSessionEntry = {
  composio_session_id: string
  /**
   * Tool names this agent is currently allowed to invoke. Mutated in place
   * by register-tools.ts on every re-provision (add new, drop missing).
   */
  allowedToolNames: Set<string>
}

export type ComposioSessionCache = {
  setSession: (params: {
    openclaw_agent_id: string
    composio_session_id: string
  }) => ComposioSessionEntry
  getSession: (openclaw_agent_id: string) => ComposioSessionEntry | undefined
  /**
   * Replace just the session id; preserves the allowed set. Used by
   * KOD-386 (M4-T7, session rotation): rotation swaps the session handle
   * without touching tool registrations.
   */
  rotateSession: (params: {
    openclaw_agent_id: string
    composio_session_id: string
  }) => ComposioSessionEntry | undefined
  dropSession: (openclaw_agent_id: string) => ComposioSessionEntry | undefined
  list: () => Array<{
    openclaw_agent_id: string
    entry: ComposioSessionEntry
  }>
  clear: () => void
}

export function createComposioSessionCache(): ComposioSessionCache {
  const byAgent = new Map<string, ComposioSessionEntry>()

  return {
    setSession: ({ openclaw_agent_id, composio_session_id }) => {
      const existing = byAgent.get(openclaw_agent_id)
      if (existing) {
        // Re-provision: keep the allowed set, just refresh the session id.
        existing.composio_session_id = composio_session_id
        return existing
      }
      const entry: ComposioSessionEntry = {
        composio_session_id,
        allowedToolNames: new Set<string>(),
      }
      byAgent.set(openclaw_agent_id, entry)
      return entry
    },
    getSession: (openclaw_agent_id) => byAgent.get(openclaw_agent_id),
    rotateSession: ({ openclaw_agent_id, composio_session_id }) => {
      const existing = byAgent.get(openclaw_agent_id)
      if (!existing) return undefined
      existing.composio_session_id = composio_session_id
      return existing
    },
    dropSession: (openclaw_agent_id) => {
      const existing = byAgent.get(openclaw_agent_id)
      if (!existing) return undefined
      byAgent.delete(openclaw_agent_id)
      return existing
    },
    list: () =>
      Array.from(byAgent.entries()).map(([openclaw_agent_id, entry]) => ({
        openclaw_agent_id,
        entry,
      })),
    clear: () => byAgent.clear(),
  }
}
