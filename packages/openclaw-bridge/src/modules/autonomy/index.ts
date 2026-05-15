import * as path from 'node:path'
import type { OpenClawPluginApi } from 'openclaw/plugin-sdk'
import type { KodiBridgeContext, KodiBridgeModule } from '../../types/module'
import type { BridgeCore } from '../bridge-core'
import type { EventBus } from '../event-bus'
import type { AgentManager } from '../agent-manager'
import {
  createPolicyLoader,
  parsePolicyResponse,
  type AutonomyPolicy,
  type PolicyLoader,
} from './policy'
import {
  createApprovalQueue,
  type ApprovalQueue,
  type PendingApproval,
} from './approval-queue'
import { createResume, type ResumeApi } from './resume'
import { createInterceptor, type Interceptor } from './interceptor'
import { createAuditAfterToolCall } from './audit'

/**
 * `autonomy` — per-agent policy enforcement on tool invocations.
 *
 * Pieces shipped so far:
 *   - KOD-389 / M5-T1: policy loader (cached, fetches from Kodi)
 *   - KOD-394 / M5-T6: shared action-class classifier in `@kodi/shared`
 *   - KOD-415 / M5-T8: durable approval queue (JSONL-backed, survives
 *     plugin restart, periodic sweep timer for expiries)
 *   - KOD-416 / M5-T9: resume primitive — injects a follow-up message
 *     into the agent session once the user decides
 *   - KOD-390 / M5-T2: the `before_tool_call` interceptor — wires the
 *     four pieces above to enforce policy on every tool call. Allow,
 *     deny, or enqueue-for-approval (deferred pattern, no in-memory
 *     waiting).
 */

export type AutonomyModuleApi = {
  loader: PolicyLoader
  /** Durable approval queue. KOD-390's interceptor enqueues pending
   * approvals; KOD-391's resolve handler calls `markResolved`. */
  queue: ApprovalQueue
  /** Resume an agent session after approval (KOD-416). Wired by
   * KOD-391's resolve handler once the user's decision lands. */
  resume: ResumeApi
  /** before_tool_call interceptor (KOD-390). Surfaced for tests; the
   * runtime registration happens inside `register()` below. */
  interceptor: Interceptor
}

export const autonomyModule: KodiBridgeModule = {
  id: 'autonomy',
  register: async (api: OpenClawPluginApi, ctx: KodiBridgeContext) => {
    const bridgeCore = ctx.bridgeCore as BridgeCore | undefined
    if (!bridgeCore) {
      throw new Error('autonomy requires bridge-core to register first')
    }
    const eventBus = ctx.eventBus as EventBus | undefined
    if (!eventBus) {
      throw new Error('autonomy requires event-bus to register first')
    }
    const agentManager = ctx.agentManager as AgentManager | undefined
    if (!agentManager) {
      throw new Error('autonomy requires agent-manager to register first')
    }

    const loader = createPolicyLoader({
      kodiClient: bridgeCore.kodiClient,
    })

    // Durable approval queue, rooted in the plugin's state dir. The
    // create call replays the on-disk log into memory; if the file is
    // unreadable it rotates aside + starts fresh and we surface that
    // through `plugin.degraded`.
    const stateDir = path.join(api.runtime.state.resolveStateDir(), 'kodi-bridge')
    const queue = await createApprovalQueue({ stateDir })
    if ((queue as { recovered: boolean }).recovered) {
      void eventBus.emitter.emit('plugin.degraded', {
        reason: 'approval-queue-rotated-corrupt',
        since: new Date().toISOString(),
      })
    }

    // 60s sweep timer; emits `tool.approval_timeout` per newly-expired
    // entry so Kodi can update its UI.
    queue.start((entry: PendingApproval) => {
      return eventBus.emitter.emit('tool.approval_timeout', {
        request_id: entry.request_id,
      })
    })

    // KOD-416: resume primitive. Injects user-side messages into an
    // existing agent session via runtime.subagent.run after the user's
    // approve/deny decision lands.
    const resume = createResume({
      queue,
      inject: ({ sessionKey, message }) =>
        api.runtime.subagent.run({
          sessionKey,
          message,
          deliver: true,
        }),
      onOrphan: (entry) =>
        eventBus.emitter.emit('tool.approval_resolved', {
          request_id: entry.request_id,
          approved: false,
          reason: entry.resolution_reason ?? 'orphaned',
        }),
    })

    // KOD-390: pre-tool-invoke interceptor. Registered against the
    // typed `before_tool_call` hook so we can return `{ block, blockReason }`
    // — not the SDK's `requireApproval` (that one waits in-memory and
    // doesn't survive plugin restarts; our deferred pattern needs the
    // durable queue + resume primitive instead).
    const interceptor = createInterceptor({
      loader,
      queue,
      registry: agentManager.registry,
      emit: (kind, payload, opts) => eventBus.emitter.emit(kind, payload, opts),
    })
    api.on('before_tool_call', async (event, hookCtx) => {
      const result = await interceptor.handleBeforeToolCall(
        {
          toolName: event.toolName,
          params: event.params,
          toolCallId: event.toolCallId,
          runId: event.runId,
        },
        {
          agentId: hookCtx.agentId,
          sessionKey: hookCtx.sessionKey,
          toolName: hookCtx.toolName,
          toolCallId: hookCtx.toolCallId,
        },
      )
      return result
    })

    // KOD-393: audit every allowed tool execution. The SDK's
    // `after_tool_call` hook fires once execution finishes (with or
    // without an error). The deferred-execute path (resolve handler in
    // inbound-api) doesn't go through the SDK's dispatch so it emits
    // `tool.invoke.after` directly.
    const auditAfterToolCall = createAuditAfterToolCall({
      registry: agentManager.registry,
      emit: (kind, payload, opts) => eventBus.emitter.emit(kind, payload, opts),
    })
    api.on('after_tool_call', async (event, hookCtx) => {
      await auditAfterToolCall(
        {
          toolName: event.toolName,
          params: event.params,
          toolCallId: event.toolCallId,
          runId: event.runId,
          result: event.result,
          error: event.error,
          durationMs: event.durationMs,
        },
        {
          agentId: hookCtx.agentId,
          sessionKey: hookCtx.sessionKey,
          toolName: hookCtx.toolName,
          toolCallId: hookCtx.toolCallId,
        },
      )
    })

    const moduleApi: AutonomyModuleApi = { loader, queue, resume, interceptor }
    ctx.autonomy = moduleApi
  },
}

export {
  createPolicyLoader,
  parsePolicyResponse,
  defaultPolicyFor,
  DEFAULT_AUTONOMY_POLICY,
  DEFAULT_POLICY_TTL_MS,
  type AutonomyPolicy,
  type AutonomyLevel,
  type AutonomyOverrideAction,
  type AutonomyOverrides,
  type PolicyLoader,
  type PolicyLoaderDeps,
} from './policy'
export {
  createApprovalQueue,
  type ApprovalQueue,
  type ApprovalStatus,
  type CreateApprovalQueueDeps,
  type PendingApproval,
  type ResolvedStatus,
} from './approval-queue'
export {
  createResume,
  composeApprovalMessage,
  type CreateResumeOptions,
  type EmitOrphanFn,
  type ResumeApi,
  type ResumeInput,
  type ResumeOutcome,
  type SessionInjectFn,
} from './resume'
export {
  createInterceptor,
  evaluatePolicy,
  resolveOverride,
  type CreateInterceptorOptions,
  type Decision,
  type Interceptor,
  type InterceptorAgentLookup,
  type InterceptorEmitFn,
} from './interceptor'
export {
  createAuditAfterToolCall,
  type AfterToolCallContext,
  type AfterToolCallEvent,
  type AuditAgentLookup,
  type AuditEmitFn,
  type CreateAuditAfterToolCallDeps,
} from './audit'
