/**
 * KOD-393 audit hooks: discipline around `tool.invoke.after`.
 *
 * The autonomy interceptor (KOD-390) emits `tool.invoke.before` /
 * `tool.denied` / `tool.approval_requested` for the three branches of
 * the policy decision. The SDK's `after_tool_call` hook fires once
 * execution completes for the allowed branch — we translate that into
 * a `tool.invoke.after` event so every successful tool run lands in
 * `plugin_event_log` with duration + outcome.
 *
 * The deferred-execute path (re-run from the approvals/resolve handler)
 * doesn't go through the SDK's tool dispatch, so the resolve handler
 * emits `tool.invoke.after` directly. See
 * `inbound-api/approvals-resolve.ts` for that emission site.
 */

export type AuditEmitFn = (
  kind: 'tool.invoke.after',
  payload: Record<string, unknown>,
  opts?: {
    agent?: { agent_id: string; openclaw_agent_id: string; user_id: string }
  },
) => Promise<void> | void

export type AfterToolCallEvent = {
  toolName: string
  params: Record<string, unknown>
  toolCallId?: string
  runId?: string
  result?: unknown
  error?: string
  durationMs?: number
}

export type AfterToolCallContext = {
  agentId?: string
  sessionKey?: string
  toolName: string
  toolCallId?: string
}

/**
 * Minimal subset of the agent registry needed to build the agent
 * envelope for an audit emit. Defined here so tests don't need to
 * construct a full AgentRegistryEntry just to pass the lookup.
 */
export type AuditAgentLookup = {
  getByAgentId: (
    openclawAgentId: string,
  ) => { user_id: string; kodi_agent_id?: string } | undefined
}

export type CreateAuditAfterToolCallDeps = {
  registry: AuditAgentLookup
  emit: AuditEmitFn
  logger?: Pick<Console, 'log' | 'warn' | 'error'>
}

/**
 * Build an `after_tool_call` handler for `api.on('after_tool_call', ...)`.
 *
 * The SDK gives us toolName, durationMs, and an optional error. If
 * `error` is set the outcome is `'error'`, otherwise `'ok'`.
 *
 * Failure mode: if the registry lookup fails (agent deprovisioned
 * mid-turn — extremely rare), we still emit the audit row, just
 * without the agent envelope. The plugin_event_log row's `agentId`
 * column ends up null but the kind + payload still records the call.
 */
export function createAuditAfterToolCall(
  deps: CreateAuditAfterToolCallDeps,
): (event: AfterToolCallEvent, ctx: AfterToolCallContext) => Promise<void> {
  const { registry, emit, logger = console } = deps

  return async (event, ctx) => {
    try {
      const openclawAgentId = ctx.agentId
      const entry = openclawAgentId
        ? registry.getByAgentId(openclawAgentId)
        : undefined

      const agentEnvelope =
        entry?.kodi_agent_id && openclawAgentId
          ? {
              agent_id: entry.kodi_agent_id,
              openclaw_agent_id: openclawAgentId,
              user_id: entry.user_id,
            }
          : undefined

      const outcome: 'ok' | 'error' = event.error ? 'error' : 'ok'

      await emit(
        'tool.invoke.after',
        {
          tool_name: event.toolName,
          duration_ms: event.durationMs ?? 0,
          outcome,
          ...(event.error ? { error: event.error } : {}),
        },
        agentEnvelope ? { agent: agentEnvelope } : undefined,
      )
    } catch (err) {
      // Swallowing the throw is intentional — a logging hook MUST NOT
      // disrupt tool execution. The runtime treats the post-hook as
      // best-effort.
      logger.error(
        JSON.stringify({
          msg: 'autonomy.audit.after_tool_call_failed',
          tool_name: event.toolName,
          error: err instanceof Error ? err.message : String(err),
        }),
      )
    }
  }
}
