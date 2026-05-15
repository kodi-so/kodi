import type { KodiBridgeContext, KodiBridgeModule } from '../../types/module'
import type { EventBus } from '../event-bus'
import {
  createComposioSessionCache,
  type ComposioSessionCache,
} from './session'
import {
  createDefaultComposioDispatcher,
  type ComposioDispatcher,
} from './dispatcher'
import {
  registerComposioToolsForAgent,
  type RegisterToolFn,
} from './register-tools'
import { unregisterComposioToolsForAgent } from './unregister-tools'
import {
  runActionForAgent as runActionForAgentImpl,
  type RunActionInput,
  type RunActionResult,
} from './run-action'

/**
 * Composio integration: per-agent persistent session + per-action
 * `api.registerTool` registrations. Replaces the no-op stub from KOD-381.
 *
 * Wiring (KOD-382):
 *   - session cache (`session.ts`) — per-agent state
 *   - dispatcher (`dispatcher.ts`) — pluggable Composio backend; the default
 *     reports "not configured" until KOD-388 plugs the real env in
 *   - register-tools / unregister-tools — diff-aware per-agent flow
 *
 * Constraint: the OpenClaw plugin SDK exposes `api.registerTool` but
 * NOT `api.unregisterTool`. Per-agent revocation happens entirely at
 * execute time via the session cache's `allowedToolNames` set; see the
 * comment in `register-tools.ts` for the full rationale.
 *
 * Failure path (Composio unreachable, registration throws, etc.):
 * `composio.session_failed` is emitted with the failing user's id; the
 * agent itself stays provisioned with `composio_status: 'failed'` so
 * Kodi can surface a retry UI.
 */

export type ComposioStatus =
  | 'pending'
  | 'active'
  | 'failed'
  | 'disconnected'
  | 'skipped'

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
  registerToolsForAgent: (params: {
    user_id: string
    openclaw_agent_id: string
    composio_session_id?: string | null
    actions: readonly ComposioAction[]
  }) => Promise<{ status: ComposioStatus; registered_tool_count: number }>

  unregisterToolsForAgent: (params: {
    openclaw_agent_id: string
  }) => Promise<void>

  /**
   * Re-run a Composio action by tool name. Used by KOD-391's approval-
   * resolve handler — the original `before_tool_call` blocked the
   * registered tool's `execute()` from running, so when the user
   * approves later we replay the call here with the persisted args.
   */
  runActionForAgent: (input: RunActionInput) => Promise<RunActionResult>
}

/**
 * Internal options: lets tests inject fake dispatcher / session cache /
 * registerTool seam without touching the OpenClaw runtime.
 */
export type ComposioEmitKind = 'composio.session_failed' | 'composio.session_rotated'

export type ComposioEmitPayload = {
  'composio.session_failed': { user_id: string; error: string }
  'composio.session_rotated': { user_id: string }
}

export type ComposioModuleOptions = {
  registerTool?: RegisterToolFn
  dispatcher?: ComposioDispatcher
  sessionCache?: ComposioSessionCache
  emit?: <K extends ComposioEmitKind>(
    kind: K,
    payload: ComposioEmitPayload[K],
  ) => Promise<void>
  logger?: Pick<Console, 'log' | 'warn'>
}

/**
 * Build the ComposioModuleApi. Exposed so tests can construct it without
 * the full plugin lifecycle. Production wiring happens in `register()`.
 */
export function createComposioModuleApi(
  options: ComposioModuleOptions,
): ComposioModuleApi {
  const sessionCache = options.sessionCache ?? createComposioSessionCache()
  const dispatcher = options.dispatcher ?? createDefaultComposioDispatcher()
  const everRegistered = new Set<string>()
  const logger = options.logger ?? console

  // No registerTool seam → degrade gracefully. This happens when the
  // composio module is constructed before bridge-core / api is wired
  // (defensive; in practice register() always supplies it).
  const registerTool: RegisterToolFn =
    options.registerTool ??
    ((tool) => {
      logger.warn(
        JSON.stringify({
          msg: 'composio.registerTool seam missing — tool not registered',
          name: tool.name,
        }),
      )
    })

  const emit = options.emit ?? (async () => {})

  return {
    registerToolsForAgent: async ({
      user_id,
      openclaw_agent_id,
      composio_session_id,
      actions,
    }) => {
      // Null / absent session id ⇒ nothing to register. Per the spec, the
      // status reported back is `'skipped'` — agent stays alive, no tools.
      if (!composio_session_id) {
        const removed = sessionCache.dropSession(openclaw_agent_id)
        return {
          status: 'skipped',
          registered_tool_count: 0,
          ...(removed ? {} : {}),
        }
      }

      // Detect rotation vs initial provision before mutating the cache.
      // Re-provision is the case where the agent already has a session
      // entry; KOD-386 requires emitting `composio.session_rotated` so
      // Kodi can observe the rotation propagated to the plugin.
      const wasPresentBeforeCall = sessionCache.getSession(openclaw_agent_id) !== undefined

      try {
        const result = registerComposioToolsForAgent(
          { registerTool, sessionCache, dispatcher, everRegistered, logger },
          { user_id, openclaw_agent_id, composio_session_id, actions },
        )
        if (wasPresentBeforeCall) {
          await emit('composio.session_rotated', { user_id })
        }
        return {
          status: 'active',
          registered_tool_count: result.registered_tool_count,
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err)
        logger.warn(
          JSON.stringify({
            msg: 'composio.registerToolsForAgent failed',
            openclaw_agent_id,
            error: message,
          }),
        )
        await emit('composio.session_failed', { user_id, error: message })
        return { status: 'failed', registered_tool_count: 0 }
      }
    },

    unregisterToolsForAgent: async ({ openclaw_agent_id }) => {
      unregisterComposioToolsForAgent(
        { sessionCache, logger },
        { openclaw_agent_id },
      )
    },

    runActionForAgent: async (input) =>
      runActionForAgentImpl({ sessionCache, dispatcher }, input),
  }
}

export const composioModule: KodiBridgeModule = {
  id: 'composio',
  register: (api, ctx: KodiBridgeContext) => {
    const eventBus = ctx.eventBus as EventBus | undefined
    if (!eventBus) {
      throw new Error('composio requires event-bus to register first')
    }

    const moduleApi = createComposioModuleApi({
      registerTool: (tool) => {
        // Cast to `Parameters<typeof api.registerTool>[0]` — the SDK accepts
        // a broader `AnyAgentTool` shape than our minimal descriptor; the
        // runtime structurally accepts what we pass.
        api.registerTool(
          tool as unknown as Parameters<typeof api.registerTool>[0],
        )
      },
      emit: async (kind, payload) => {
        await eventBus.emitter.emit(kind, payload)
      },
    })

    ctx.composio = moduleApi
  },
}

export {
  createComposioSessionCache,
  type ComposioSessionCache,
  type ComposioSessionEntry,
} from './session'
export {
  createDefaultComposioDispatcher,
  type ComposioDispatcher,
  type DispatchExecuteParams,
  type DispatchOutcome,
} from './dispatcher'
export {
  buildComposioToolName,
  parseComposioToolName,
  type ComposioActionRef,
  type ParsedComposioToolName,
} from './tool-naming'
export {
  registerComposioToolsForAgent,
  type RegisterComposioToolsDeps,
  type RegisterComposioToolsInput,
  type RegisterComposioToolsResult,
  type RegisterToolFn,
  type PluginToolDescriptor,
  type PluginToolResult,
} from './register-tools'
export {
  unregisterComposioToolsForAgent,
  type UnregisterComposioToolsDeps,
  type UnregisterComposioToolsInput,
  type UnregisterComposioToolsResult,
} from './unregister-tools'
export {
  runActionForAgent,
  type RunActionDeps,
  type RunActionInput,
  type RunActionResult,
} from './run-action'
