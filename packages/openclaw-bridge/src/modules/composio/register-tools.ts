import type { ComposioAction } from './index'
import type { ComposioDispatcher } from './dispatcher'
import type { ComposioSessionCache } from './session'
import { buildComposioToolName } from './tool-naming'

/**
 * Per-agent Composio tool registration with diff-aware semantics.
 *
 * Behavior on each call:
 *   1. compute the desired tool-name set from `actions[]`
 *   2. compare against the agent's currently-allowed set in the session cache
 *   3. for every NEW name → call `api.registerTool(...)`, but only if we have
 *      not registered that exact name with the plugin runtime before
 *      (`everRegistered` guard). The OpenClaw SDK has no `unregisterTool`,
 *      so re-registering the same name would be a duplicate — gated.
 *   4. update the agent's allowed set to match the desired set
 *
 * Removed names are NOT actually unregistered (impossible). Instead, each
 * tool's `execute` callback gates on `entry.allowedToolNames.has(name)` so
 * dropping a name from the set makes the tool inert for that agent.
 *
 * Re-provision with the same actions is a fast path: the desired set
 * matches the allowed set, no `api.registerTool` calls happen.
 */

/**
 * Narrow surface of `OpenClawPluginApi.registerTool` we depend on.
 * Typed loosely to keep tests independent of the full SDK type — the
 * runtime cares only that the callable accepts a tool descriptor object.
 */
export type RegisterToolFn = (tool: PluginToolDescriptor) => void

/**
 * Loose tool descriptor shape — matches `AnyAgentTool`'s structural
 * requirements (`name`, `description`, `parameters`, `execute`) without
 * pulling in `pi-agent-core`'s deep type chain. The runtime accepts
 * anything matching this shape.
 */
export type PluginToolDescriptor = {
  name: string
  description: string
  parameters: unknown
  execute: (
    toolCallId: string,
    params: unknown,
    signal?: AbortSignal,
  ) => Promise<PluginToolResult>
}

export type PluginToolResult = {
  content: Array<{ type: 'text'; text: string }>
  details?: Record<string, unknown>
}

export type RegisterComposioToolsDeps = {
  registerTool: RegisterToolFn
  sessionCache: ComposioSessionCache
  dispatcher: ComposioDispatcher
  /**
   * Names this plugin process has ever called `registerTool` for. Shared
   * across agents because the plugin runtime is global. Mutated by this
   * function. Caller (composio module init) supplies the initial empty
   * set so it can be inspected for diagnostics.
   */
  everRegistered: Set<string>
  logger?: Pick<Console, 'log' | 'warn'>
}

export type RegisterComposioToolsInput = {
  user_id: string
  openclaw_agent_id: string
  composio_session_id: string
  actions: readonly ComposioAction[]
}

export type RegisterComposioToolsResult = {
  registered_tool_count: number
  added_names: string[]
  removed_names: string[]
  /** Names skipped because already registered globally (re-provision). */
  reused_names: string[]
}

export function registerComposioToolsForAgent(
  deps: RegisterComposioToolsDeps,
  input: RegisterComposioToolsInput,
): RegisterComposioToolsResult {
  const { registerTool, sessionCache, dispatcher, everRegistered } = deps

  // Ensure session entry exists / refresh session id while preserving
  // any existing allowed set.
  const entry = sessionCache.setSession({
    openclaw_agent_id: input.openclaw_agent_id,
    composio_session_id: input.composio_session_id,
  })

  // Build desired name → action mapping.
  const desired = new Map<string, ComposioAction>()
  for (const action of input.actions) {
    const name = buildComposioToolName({
      openclaw_agent_id: input.openclaw_agent_id,
      toolkit: action.toolkit,
      action: action.action,
    })
    desired.set(name, action)
  }

  const added: string[] = []
  const removed: string[] = []
  const reused: string[] = []

  // Compute add/remove diffs against the agent's currently-allowed set.
  for (const name of desired.keys()) {
    if (!entry.allowedToolNames.has(name)) added.push(name)
  }
  for (const name of entry.allowedToolNames) {
    if (!desired.has(name)) removed.push(name)
  }

  // Apply registration for new names. Skip api.registerTool if the name
  // is already known to the plugin runtime — that's a re-provision after
  // an earlier deprovision (or duplicate provision); the existing tool's
  // execute callback already gates on the allowed set.
  for (const name of added) {
    if (everRegistered.has(name)) {
      reused.push(name)
      continue
    }
    const action = desired.get(name)
    if (!action) continue
    registerTool(
      buildToolDescriptor({
        name,
        action,
        openclaw_agent_id: input.openclaw_agent_id,
        user_id: input.user_id,
        sessionCache,
        dispatcher,
      }),
    )
    everRegistered.add(name)
  }

  // Replace the allowed set with the desired set.
  entry.allowedToolNames.clear()
  for (const name of desired.keys()) entry.allowedToolNames.add(name)

  return {
    registered_tool_count: desired.size,
    added_names: added,
    removed_names: removed,
    reused_names: reused,
  }
}

function buildToolDescriptor(args: {
  name: string
  action: ComposioAction
  openclaw_agent_id: string
  user_id: string
  sessionCache: ComposioSessionCache
  dispatcher: ComposioDispatcher
}): PluginToolDescriptor {
  const {
    name,
    action,
    openclaw_agent_id,
    user_id,
    sessionCache,
    dispatcher,
  } = args

  return {
    name,
    description: action.description,
    parameters: action.parameters,
    execute: async (_toolCallId, rawParams) => {
      // Gate at execute-time: if this agent's allowed set no longer
      // contains the tool, return a structured "revoked" failure rather
      // than calling Composio. This is how we approximate
      // `api.unregisterTool` (which the SDK does not provide).
      const entry = sessionCache.getSession(openclaw_agent_id)
      if (!entry || !entry.allowedToolNames.has(name)) {
        return failedResult(
          `Tool ${action.toolkit}.${action.action} is no longer available for this agent.`,
          { status: 'revoked' },
        )
      }

      const params: Record<string, unknown> =
        rawParams && typeof rawParams === 'object' && !Array.isArray(rawParams)
          ? (rawParams as Record<string, unknown>)
          : {}

      const outcome = await dispatcher.execute({
        openclaw_agent_id,
        user_id,
        composio_session_id: entry.composio_session_id,
        toolkit: action.toolkit,
        action: action.action,
        params,
      })

      if (outcome.status === 'ok') {
        return {
          content: [
            { type: 'text', text: stringifyPayload(outcome.payload) },
          ],
        }
      }

      return failedResult(outcome.message, { status: 'failed', reason: outcome.reason })
    },
  }
}

function failedResult(
  text: string,
  details: Record<string, unknown>,
): PluginToolResult {
  return {
    content: [{ type: 'text', text }],
    details,
  }
}

function stringifyPayload(payload: unknown): string {
  if (typeof payload === 'string') return payload
  try {
    return JSON.stringify(payload)
  } catch {
    return String(payload)
  }
}
