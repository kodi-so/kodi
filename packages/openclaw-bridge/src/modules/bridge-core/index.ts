import type { KodiBridgeContext, KodiBridgeModule } from '../../types/module'
import { loadConfig } from './config'
import { buildIdentity, type Identity } from './identity'
import { createKodiClient, type KodiClient } from './kodi-client'
import { createHealthState, registerHealthRoute, type HealthState } from './health'

export type BridgeCore = {
  identity: Identity
  kodiClient: KodiClient
  health: HealthState
}

/**
 * `bridge-core` — runs first. Resolves the config (including any SecretRef
 * placeholders), builds the KodiClient, stamps the identity, and exposes the
 * resulting `BridgeCore` on `ctx.bridgeCore` so every other module reads
 * from one shared instance.
 *
 * The plugin entry validated the raw config already; calling `loadConfig`
 * here additionally resolves `{ "$secret": "ENV_NAME" }` placeholders.
 * Re-validation is a fast no-op on the already-clean shape.
 *
 * NOTE: gateway token resolution lands in M2-T7 (KOD-368) when cloud-init
 * starts injecting `OPENCLAW_GATEWAY_TOKEN` into the plugin's env. Until
 * then we use a placeholder; the KodiClient won't successfully reach Kodi
 * but every other module that depends on `ctx.bridgeCore` compiles.
 */
export const bridgeCoreModule: KodiBridgeModule = {
  id: 'bridge-core',
  register: (api, ctx: KodiBridgeContext) => {
    const config = loadConfig(ctx.config)
    ctx.config = config

    const identity = buildIdentity(config)
    const kodiClient = createKodiClient({
      baseUrl: config.kodi_api_base_url,
      gatewayToken:
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (typeof process !== 'undefined' && (process as any)?.env?.OPENCLAW_GATEWAY_TOKEN) ||
        '__GATEWAY_TOKEN_NOT_SET__',
      hmacSecret: config.hmac_secret,
    })
    const health = createHealthState()

    registerHealthRoute(api, health, identity)

    const bridgeCore: BridgeCore = { identity, kodiClient, health }
    ctx.bridgeCore = bridgeCore
  },
}

export type { Identity, KodiClient, HealthState }
export { loadConfig, createKodiClient, buildIdentity, createHealthState, registerHealthRoute }
