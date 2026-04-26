import { definePluginEntry } from 'openclaw/plugin-sdk/core'
import type { OpenClawPluginApi, OpenClawPluginConfigSchema } from 'openclaw/plugin-sdk'

import { validateConfig } from './types/config'
import type { KodiBridgeContext } from './types/module'

import { bridgeCoreModule } from './modules/bridge-core'
import { agentManagerModule } from './modules/agent-manager'
import { composioModule } from './modules/composio'
import { eventBusModule } from './modules/event-bus'
import { inboundApiModule } from './modules/inbound-api'
import { autonomyModule } from './modules/autonomy'
import { updaterModule } from './modules/updater'
import { memoryModule } from './modules/memory'

/**
 * Module registration order is intentional:
 *   1. bridge-core    — populates ctx with KodiClient, identity, HMAC
 *   2. event-bus      — needed early so other modules can emit events
 *   3. agent-manager  — sets up the per-agent registry that composio + autonomy read
 *   4. composio       — relies on agent-manager + event-bus
 *   5. autonomy       — relies on agent-manager (for agent resolution at hook time)
 *   6. inbound-api    — registers HTTP routes that fan out to the modules above
 *   7. updater        — independent; runs a timer
 *   8. memory         — independent; only depends on bridge-core for KodiClient
 */
const REGISTRATION_ORDER = [
  bridgeCoreModule,
  eventBusModule,
  agentManagerModule,
  composioModule,
  autonomyModule,
  inboundApiModule,
  updaterModule,
  memoryModule,
] as const

export default definePluginEntry({
  id: 'kodi-bridge',
  name: 'Kodi Bridge',
  description:
    'Always-on Composio access, dual communication with Kodi, autonomy enforcement, plugin self-update, and the Org Memory module — all in one plugin.',
  configSchema: (): OpenClawPluginConfigSchema =>
    ({
      type: 'object',
      additionalProperties: false,
      required: ['instance_id', 'org_id', 'kodi_api_base_url', 'hmac_secret'],
      properties: {
        instance_id: { type: 'string', minLength: 1 },
        org_id: { type: 'string', minLength: 1 },
        kodi_api_base_url: { type: 'string', format: 'uri' },
        hmac_secret: { type: 'string', minLength: 32 },
        heartbeat_interval_seconds: { type: 'integer', minimum: 5, default: 60 },
        bundle_check_interval_seconds: { type: 'integer', minimum: 60, default: 3600 },
        outbox_path: { type: 'string' },
      },
    }) as OpenClawPluginConfigSchema,
  register: async (api: OpenClawPluginApi) => {
    // OpenClaw passes the validated raw config through `api.config` (or similar).
    // The exact accessor is finalized in KOD-365 once bridge-core stands up the
    // KodiClient — for now we read whatever the plugin runtime hands us and
    // re-validate to fail loud and early if config drifts from schema.
    const rawConfig: unknown =
      (api as unknown as { config?: unknown }).config ?? {}
    const config = validateConfig(rawConfig)

    const ctx: KodiBridgeContext = { config }

    for (const mod of REGISTRATION_ORDER) {
      await mod.register(api, ctx)
    }
  },
})
