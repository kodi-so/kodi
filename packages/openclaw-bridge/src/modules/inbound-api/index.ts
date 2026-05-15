import type { KodiBridgeContext, KodiBridgeModule } from '../../types/module'
import type { BridgeCore } from '../bridge-core'
import type { EventBus } from '../event-bus'
import type { AgentManager } from '../agent-manager'
import type { AutonomyModuleApi } from '../autonomy'
import type { ComposioModuleApi } from '../composio'
import { parseSubscriptionsBody } from '../event-bus/subscription-loader'
import { createNonceDedupe, type NonceDedupe } from './dedupe'
import {
  createInboundRouter,
  PLUGIN_PREFIX,
  type InboundRouter,
  type ReloadCallback,
} from './router'
import {
  createProvisionHandler,
  createDeprovisionHandler,
} from './agent-handlers'
import { createUpdatePolicyHandler } from './policy-handler'
import { createApprovalsResolveHandler } from './approvals-resolve'

/**
 * `inbound-api` — exposes the HTTP surface Kodi calls into.
 *
 * The module registers a single OpenClaw HTTP route at the
 * `/plugins/kodi-bridge/` prefix and runs in-house dispatch + HMAC
 * verification.
 *
 *   - `/config/subscriptions` is real (KOD-375): wired to
 *     ctx.eventBus.setSubscriptions, validation lives in the
 *     subscription-loader module.
 *   - `/admin/reload` is real (KOD-376): runs every callback registered
 *     via ctx.inboundApi.onReload(fn).
 *   - Everything else returns 501 until the follow-up tickets in M3,
 *     M4, and M5 land their handlers.
 */

export type InboundApi = {
  /** Register a callback to run on POST /admin/reload. */
  onReload: (cb: ReloadCallback) => void
  /** Currently registered reload callbacks (for diagnostics / tests). */
  readonly reloadCallbacks: readonly ReloadCallback[]
  /** The router instance (handler can be re-registered if OpenClaw allows). */
  router: InboundRouter
  /** The nonce deduper, exposed so other modules can probe state. */
  dedupe: NonceDedupe
}

export const inboundApiModule: KodiBridgeModule = {
  id: 'inbound-api',
  register: (api, ctx: KodiBridgeContext) => {
    const bridgeCore = ctx.bridgeCore as BridgeCore | undefined
    if (!bridgeCore) {
      throw new Error('inbound-api requires bridge-core to register first')
    }
    const eventBus = ctx.eventBus as EventBus | undefined
    const agentManager = ctx.agentManager as AgentManager | undefined
    const autonomy = ctx.autonomy as AutonomyModuleApi | undefined
    const composio = ctx.composio as ComposioModuleApi | undefined

    const dedupe = createNonceDedupe()
    const reloadCallbacks: ReloadCallback[] = []

    const approvalsResolveHandler =
      autonomy && composio && agentManager && eventBus
        ? createApprovalsResolveHandler({
            queue: autonomy.queue,
            resume: autonomy.resume,
            composio,
            registry: agentManager.registry,
            emit: (kind, payload, opts) =>
              eventBus.emitter.emit(kind, payload, opts),
          })
        : undefined

    const router = createInboundRouter({
      getSecret: () => ctx.config.hmac_secret,
      dedupe,
      reloadCallbacks: () => reloadCallbacks,
      subscriptionsHandler: eventBus
        ? async (rawBody) => {
            const subs = parseSubscriptionsBody(rawBody)
            eventBus.setSubscriptions(subs)
          }
        : undefined,
      provisionHandler: agentManager
        ? createProvisionHandler(agentManager.provision)
        : undefined,
      deprovisionHandler: agentManager
        ? createDeprovisionHandler(agentManager.deprovision)
        : undefined,
      updatePolicyHandler: autonomy
        ? createUpdatePolicyHandler(autonomy.loader)
        : undefined,
      approvalsResolveHandler,
    })

    api.registerHttpRoute({
      path: PLUGIN_PREFIX,
      match: 'prefix',
      auth: 'plugin',
      handler: (req, res) => router.handle(req, res),
    })

    const inboundApi: InboundApi = {
      onReload: (cb) => {
        reloadCallbacks.push(cb)
      },
      get reloadCallbacks() {
        return reloadCallbacks.slice()
      },
      router,
      dedupe,
    }
    ctx.inboundApi = inboundApi
  },
}

export {
  createInboundRouter,
  PLUGIN_PREFIX,
  isInboundRoute,
  type InboundRouter,
  type ReloadCallback,
  type SubscriptionsHandler,
  type ProvisionHandler,
  type ProvisionHandlerResult,
  type DeprovisionHandler,
  type DeprovisionHandlerResult,
} from './router'
export { createNonceDedupe, type NonceDedupe } from './dedupe'
export { verifyInbound, type VerifyInboundInput, type VerifyInboundResult } from './verify'
export {
  createProvisionHandler,
  createDeprovisionHandler,
  parseProvisionBody,
  parseDeprovisionBody,
  type ParsedProvisionBody,
  type ParsedDeprovisionBody,
} from './agent-handlers'
export { createUpdatePolicyHandler } from './policy-handler'
export type {
  UpdatePolicyHandler,
  UpdatePolicyHandlerResult,
  ApprovalsResolveRouterHandler,
  ApprovalsResolveRouterResult,
} from './router'
export {
  createApprovalsResolveHandler,
  parseApprovalsResolveBody,
  type ApprovalsResolveBody,
  type ApprovalsResolveHandler,
  type ApprovalsResolveResult,
  type ApprovalsEmitFn,
  type CreateApprovalsResolveHandlerDeps,
} from './approvals-resolve'
