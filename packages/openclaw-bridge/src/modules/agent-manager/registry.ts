import type { ComposioStatus } from '../composio'

/**
 * Per-agent runtime state held inside the kodi-bridge plugin. One entry exists
 * for every OpenClaw agent the plugin currently manages on this instance.
 *
 * Keyed by both `user_id` (the Kodi user owning the agent) and
 * `openclaw_agent_id` (the agent's runtime ID inside OpenClaw, of the form
 * `agent_<short>`). The plugin uses `getByUser` for inbound provision/
 * deprovision routes (KOD-381) and `getByAgentId` for hook bindings that
 * fire with an OpenClaw agent ID (KOD-373).
 */
export type AgentRegistryEntry = {
  user_id: string
  openclaw_agent_id: string
  workspace_dir: string
  /**
   * The Kodi DB UUID of the corresponding `openclaw_agents` row. May be
   * absent until KOD-381 wires the inbound provision route — Kodi will pass
   * it in the request body once the row is created server-side. Until then,
   * agent-context-bearing events from this agent omit the `agent.agent_id`
   * field rather than fabricate a UUID.
   */
  kodi_agent_id?: string
  composio_status: ComposioStatus
  created_at: string
}

export type AgentRegistry = {
  add: (entry: AgentRegistryEntry) => void
  /**
   * Remove an entry by its OpenClaw runtime ID. No-op when absent.
   * Returns the removed entry, or `undefined` if nothing was removed.
   */
  remove: (openclaw_agent_id: string) => AgentRegistryEntry | undefined
  getByUser: (user_id: string) => AgentRegistryEntry | undefined
  getByAgentId: (openclaw_agent_id: string) => AgentRegistryEntry | undefined
  list: () => AgentRegistryEntry[]
  count: () => number
  /** Clear every entry. Used by startup reconciliation in KOD-387. */
  clear: () => void
}

export function createAgentRegistry(): AgentRegistry {
  const byUser = new Map<string, AgentRegistryEntry>()
  const byAgentId = new Map<string, AgentRegistryEntry>()

  function add(entry: AgentRegistryEntry): void {
    byUser.set(entry.user_id, entry)
    byAgentId.set(entry.openclaw_agent_id, entry)
  }

  function remove(openclaw_agent_id: string): AgentRegistryEntry | undefined {
    const existing = byAgentId.get(openclaw_agent_id)
    if (!existing) return undefined
    byAgentId.delete(openclaw_agent_id)
    byUser.delete(existing.user_id)
    return existing
  }

  return {
    add,
    remove,
    getByUser: (user_id) => byUser.get(user_id),
    getByAgentId: (openclaw_agent_id) => byAgentId.get(openclaw_agent_id),
    list: () => Array.from(byAgentId.values()),
    count: () => byAgentId.size,
    clear: () => {
      byUser.clear()
      byAgentId.clear()
    },
  }
}
