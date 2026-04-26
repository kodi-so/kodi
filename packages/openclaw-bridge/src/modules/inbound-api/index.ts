import type { KodiBridgeContext, KodiBridgeModule } from '../../types/module'
import type { BridgeCore } from '../bridge-core'
import { createNonceDedupe, type NonceDedupe } from './dedupe'
import {
  createInboundRouter,
  PLUGIN_PREFIX,
  type InboundRouter,
  type ReloadCallback,
} from './router'

/**
 * `inbound-api` — exposes the HTTP surface Kodi calls into.
 *
 * The module registers a single OpenClaw HTTP route at the
 * `/plugins/kodi-bridge/` prefix and runs in-house dispatch + HMAC
 * verification. Sibling modules add reload callbacks via
 * `ctx.inboundApi.onReload(fn)` from their own `register()`; KOD-375's
 * subscription loader is the first real consumer.
 *
 * Stub routes return 501 with `{ code: 'NOT_IMPLEMENTED' }` until the
 * follow-up tickets in M3, M4, and M5 land their handlers.
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

    const dedupe = createNonceDedupe()
    const reloadCallbacks: ReloadCallback[] = []

    const router = createInboundRouter({
      getSecret: () => ctx.config.hmac_secret,
      dedupe,
      reloadCallbacks: () => reloadCallbacks,
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
} from './router'
export { createNonceDedupe, type NonceDedupe } from './dedupe'
export { verifyInbound, type VerifyInboundInput, type VerifyInboundResult } from './verify'
