/**
 * Composio plugin tool naming.
 *
 * Format: `composio__<agentId>__<toolkit>__<action>` — double-underscores
 * to match OpenClaw's bundle-mcp naming style. Includes the OpenClaw
 * `agentId` because:
 *
 *   1. The plugin SDK exposes `api.registerTool` (global to the plugin)
 *      but no `api.unregisterTool` — once registered, a tool lives until
 *      the plugin process restarts. Including the agent id makes every
 *      tool name unique to one agent, so a deprovisioned agent's tools
 *      don't accidentally activate when a different agent provisions.
 *   2. KOD-381 implies multiple agents per instance. Naming by toolkit/
 *      action alone would collide.
 *
 * Per-agent revocation happens at execute-time via the session cache's
 * `allowedToolNames` set. See session.ts.
 */

const PREFIX = 'composio'
const SEP = '__'

export type ComposioActionRef = {
  toolkit: string
  action: string
}

export function buildComposioToolName(params: {
  openclaw_agent_id: string
  toolkit: string
  action: string
}): string {
  return [PREFIX, params.openclaw_agent_id, params.toolkit, params.action].join(
    SEP,
  )
}

export type ParsedComposioToolName = {
  openclaw_agent_id: string
  toolkit: string
  action: string
}

/**
 * Inverse of `buildComposioToolName`. Returns null on inputs that don't
 * match the convention so callers can fall through to non-Composio tool
 * handlers without try/catch.
 *
 * Note: toolkit and action slugs are assumed to NOT contain `__`. Real
 * Composio toolkits use snake_case so this holds; if a future toolkit
 * does, switch to a delimiter that's reserved.
 */
export function parseComposioToolName(name: string): ParsedComposioToolName | null {
  if (!name.startsWith(`${PREFIX}${SEP}`)) return null
  const rest = name.slice(PREFIX.length + SEP.length)
  const parts = rest.split(SEP)
  if (parts.length !== 3) return null
  const [openclaw_agent_id, toolkit, action] = parts
  if (!openclaw_agent_id || !toolkit || !action) return null
  return { openclaw_agent_id, toolkit, action }
}
