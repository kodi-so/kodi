import type { ComposioSessionCache } from './session'
import type { ComposioDispatcher, DispatchOutcome } from './dispatcher'
import { parseComposioToolName } from './tool-naming'

/**
 * Re-run a Composio action by tool name. Used by KOD-391's approval-
 * resolve handler when a deferred approval lands and we need to execute
 * the tool the user just authorized.
 *
 * The original request was blocked at the `before_tool_call` hook
 * (KOD-390 interceptor) — the agent's `execute()` callback never ran.
 * The persisted approval row carries everything we need to reconstruct
 * the call:
 *
 *   - tool_name: `composio__<agent_id>__<toolkit>__<action>` — encodes
 *     toolkit + action + the OpenClaw runtime agent id
 *   - args_json: serialized params
 *   - agent_id: Kodi DB UUID (needed for audit but not for the call
 *     itself — Composio is keyed by the per-agent session)
 *
 * The revocation check (`allowedToolNames.has(name)`) mirrors what
 * `register-tools.ts` does at execute time: if the agent's tool surface
 * was rotated between the enqueue and the resolve and this tool was
 * dropped, we don't run it.
 */

export type RunActionInput = {
  /** Tool name as stored in the approval queue. */
  tool_name: string
  /** Tool args as a parsed object. The handler is responsible for
   * JSON.parse'ing args_json before passing here. */
  params: Record<string, unknown>
  /** Kodi user id; the dispatcher needs it for telemetry / Composio
   * scoping. Resolved by the caller via the agent registry from the
   * openclaw_agent_id encoded in tool_name. */
  user_id: string
}

export type RunActionResult =
  | { kind: 'ok'; payload: unknown }
  | { kind: 'failed'; reason: 'unparseable_tool_name'; message: string }
  | { kind: 'failed'; reason: 'no_session'; message: string }
  | { kind: 'failed'; reason: 'revoked'; message: string }
  | { kind: 'failed'; reason: 'dispatch_failed'; message: string }

export type RunActionDeps = {
  sessionCache: ComposioSessionCache
  dispatcher: ComposioDispatcher
}

export async function runActionForAgent(
  deps: RunActionDeps,
  input: RunActionInput,
): Promise<RunActionResult> {
  const parsed = parseComposioToolName(input.tool_name)
  if (!parsed) {
    return {
      kind: 'failed',
      reason: 'unparseable_tool_name',
      message: `tool_name does not match the composio__ format: ${input.tool_name}`,
    }
  }

  const session = deps.sessionCache.getSession(parsed.openclaw_agent_id)
  if (!session) {
    return {
      kind: 'failed',
      reason: 'no_session',
      message: `No active Composio session for agent ${parsed.openclaw_agent_id}; the agent may have been deprovisioned between the approval and the resolve.`,
    }
  }

  if (!session.allowedToolNames.has(input.tool_name)) {
    return {
      kind: 'failed',
      reason: 'revoked',
      message: `Tool ${parsed.toolkit}.${parsed.action} is no longer in the agent's allowed set; the loadout was rotated between the approval and the resolve.`,
    }
  }

  const outcome: DispatchOutcome = await deps.dispatcher.execute({
    openclaw_agent_id: parsed.openclaw_agent_id,
    user_id: input.user_id,
    composio_session_id: session.composio_session_id,
    toolkit: parsed.toolkit,
    action: parsed.action,
    params: input.params,
  })

  if (outcome.status === 'ok') {
    return { kind: 'ok', payload: outcome.payload }
  }
  return {
    kind: 'failed',
    reason: 'dispatch_failed',
    message: outcome.message,
  }
}
