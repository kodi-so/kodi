import type { KodiBridgeContext, KodiBridgeModule } from '../../types/module'
import type { BridgeCore } from '../bridge-core'
import {
  createPolicyLoader,
  parsePolicyResponse,
  type AutonomyPolicy,
  type PolicyLoader,
} from './policy'

/**
 * `autonomy` — per-agent policy enforcement on tool invocations.
 *
 * KOD-389 (this ticket): the policy *loader*. Caches per-agent policies
 * fetched from Kodi's `GET /api/openclaw/agents/:id/autonomy`, with a
 * 15-minute TTL and an explicit invalidate hook for the inbound
 * `agents/update-policy` push.
 *
 * KOD-390 (M5-T2): the pre-tool-invoke interceptor that consumes
 * `autonomy.getPolicy(agentId)` and gates / requests-approval / denies
 * tool calls before they execute.
 */

export type AutonomyModuleApi = {
  loader: PolicyLoader
}

export const autonomyModule: KodiBridgeModule = {
  id: 'autonomy',
  register: (_api, ctx: KodiBridgeContext) => {
    const bridgeCore = ctx.bridgeCore as BridgeCore | undefined
    if (!bridgeCore) {
      throw new Error('autonomy requires bridge-core to register first')
    }

    const loader = createPolicyLoader({
      kodiClient: bridgeCore.kodiClient,
    })

    const moduleApi: AutonomyModuleApi = { loader }
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
