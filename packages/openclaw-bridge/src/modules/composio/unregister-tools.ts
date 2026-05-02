import type { ComposioSessionCache } from './session'

/**
 * Per-agent Composio tool teardown.
 *
 * The OpenClaw plugin SDK does not expose `api.unregisterTool`. Tools
 * registered earlier remain in the plugin runtime for the lifetime of
 * the process. Per-agent revocation is implemented entirely at execute
 * time by gating each tool's `execute` callback on
 * `entry.allowedToolNames.has(name)` (see register-tools.ts).
 *
 * So "unregistering" means: drop the agent's session entry, which clears
 * its allowed-name set. Every previously-registered tool for that agent
 * is now inert (returns a "revoked" failure on call). The next time a
 * different agent provisions, their tools live alongside the inert ones
 * — no collision because tool names embed `openclaw_agent_id`.
 */

export type UnregisterComposioToolsDeps = {
  sessionCache: ComposioSessionCache
  logger?: Pick<Console, 'log' | 'warn'>
}

export type UnregisterComposioToolsInput = {
  openclaw_agent_id: string
}

export type UnregisterComposioToolsResult = {
  /** Number of tool names that were in the agent's allowed set before drop. */
  cleared_tool_count: number
  /** True if a session entry existed and was removed. */
  removed: boolean
}

export function unregisterComposioToolsForAgent(
  deps: UnregisterComposioToolsDeps,
  input: UnregisterComposioToolsInput,
): UnregisterComposioToolsResult {
  const dropped = deps.sessionCache.dropSession(input.openclaw_agent_id)
  if (!dropped) return { cleared_tool_count: 0, removed: false }
  return {
    cleared_tool_count: dropped.allowedToolNames.size,
    removed: true,
  }
}
