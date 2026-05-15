/**
 * Composio action dispatcher.
 *
 * The plugin's per-agent registered tools call `dispatcher.execute(...)`
 * inside their `execute` callback. The dispatcher is the seam where the
 * plugin actually talks to Composio's backend.
 *
 * KOD-382 ships a default that returns a structured "not configured"
 * error result — the wiring of the real Composio API key + base URL
 * lives in KOD-388 (M4-T9, env vars for Composio). Once those are
 * available, the env-backed dispatcher swaps in.
 *
 * The interface here is deliberately narrow: the only thing register-tools
 * cares about is `execute`. Future additions (rate limit, telemetry,
 * caching) can layer over the same shape.
 */

export type DispatchExecuteParams = {
  /** OpenClaw agent id; used for telemetry/error context. */
  openclaw_agent_id: string
  /** Kodi user id; used to scope the Composio call to the right user. */
  user_id: string
  /** Composio session id (Kodi's `composio_session_id`). */
  composio_session_id: string
  /** Toolkit slug (e.g. `"gmail"`). */
  toolkit: string
  /** Action slug within the toolkit (e.g. `"send_email"`). */
  action: string
  /** Action parameters as supplied by the calling agent. */
  params: Record<string, unknown>
}

export type DispatchOutcome =
  | { status: 'ok'; payload: unknown }
  | { status: 'failed'; reason: 'not_configured' | 'composio_error'; message: string }

export type ComposioDispatcher = {
  execute: (params: DispatchExecuteParams) => Promise<DispatchOutcome>
}

/**
 * Default dispatcher. Returns "not configured" until KOD-388 plugs the
 * real Composio backend in. By isolating this here we let agent
 * provisioning work end-to-end on dev instances that don't yet have
 * Composio credentials — tools are registered, calling them returns an
 * actionable error, the rest of the plugin keeps working.
 */
export function createDefaultComposioDispatcher(): ComposioDispatcher {
  return {
    execute: async () => ({
      status: 'failed',
      reason: 'not_configured',
      message:
        'Composio backend is not configured on this instance. Set COMPOSIO_API_KEY (KOD-388) to enable tool execution.',
    }),
  }
}
