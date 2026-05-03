import * as path from 'node:path'
import type { OpenClawPluginApi } from 'openclaw/plugin-sdk'
import type { KodiBridgeContext, KodiBridgeModule } from '../../types/module'
import type { BridgeCore } from '../bridge-core'
import type { EventBus } from '../event-bus'
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

/**
 * `autonomy` — per-agent policy enforcement on tool invocations.
 *
 * Pieces shipped so far:
 *   - KOD-389 / M5-T1: policy loader (cached, fetches from Kodi)
 *   - KOD-415 / M5-T8: durable approval queue (this PR — JSONL-backed,
 *     survives plugin restart, periodic sweep timer for expiries)
 *
 * KOD-390 (M5-T2): the pre-tool-invoke interceptor that consumes
 * `autonomy.getPolicy(agentId)` and either allows / denies / enqueues
 * for approval. This module exposes both the loader and the queue so
 * the interceptor can be wired up cleanly when M5-T2 lands.
 */

export type AutonomyModuleApi = {
  loader: PolicyLoader
  /** Durable approval queue. KOD-390's interceptor enqueues pending
   * approvals; KOD-391's resolve handler calls `markResolved`. */
  queue: ApprovalQueue
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

    const moduleApi: AutonomyModuleApi = { loader, queue }
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
