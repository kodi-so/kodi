import * as fs from 'node:fs/promises'
import type { OpenClawPluginApi } from 'openclaw/plugin-sdk'
import type { KodiBridgeContext, KodiBridgeModule } from '../../types/module'
import type { BridgeCore } from '../bridge-core'
import type { EventBus } from '../event-bus'
import type { ComposioModuleApi } from '../composio'
import { createAgentRegistry, type AgentRegistry } from './registry'
import {
  provisionAgent,
  type ProvisionInput,
  type ProvisionResult,
  type ConfigWithAgents,
} from './provision'
import {
  deprovisionAgent,
  type DeprovisionInput,
  type DeprovisionResult,
} from './deprovision'

/**
 * `agent-manager` — plugin-side authority for the OpenClaw agents inside this
 * instance. KOD-380 (M4-T1) ships:
 *
 *   - `registry`          — in-memory map (this module's source of truth)
 *   - `provisionAgent`    — create one agent for one user
 *   - `deprovisionAgent`  — tear it down
 *
 * Routes that call these (KOD-381 / M4-T2) and startup reconciliation
 * (KOD-387 / M4-T8) ship in subsequent tickets.
 */

export type AgentManager = {
  registry: AgentRegistry
  provision: (input: ProvisionInput) => Promise<ProvisionResult>
  deprovision: (input: DeprovisionInput) => Promise<DeprovisionResult>
}

export const agentManagerModule: KodiBridgeModule = {
  id: 'agent-manager',
  register: (api, ctx: KodiBridgeContext) => {
    const bridgeCore = ctx.bridgeCore as BridgeCore | undefined
    if (!bridgeCore) {
      throw new Error('agent-manager requires bridge-core to register first')
    }
    const eventBus = ctx.eventBus as EventBus | undefined
    if (!eventBus) {
      throw new Error('agent-manager requires event-bus to register first')
    }
    const composio = ctx.composio as ComposioModuleApi | undefined
    if (!composio) {
      throw new Error('agent-manager requires composio to register first')
    }

    const registry = createAgentRegistry()

    // Bridge SDK calls behind a narrow surface so the unit-tested provision/
    // deprovision functions remain side-effect-free in their fakes.
    const runtime = api.runtime
    const loadConfig = (): ConfigWithAgents =>
      runtime.config.loadConfig() as unknown as ConfigWithAgents
    const writeConfigFile = (cfg: ConfigWithAgents) =>
      // Cast back at the boundary — the SDK's OpenClawConfig type is broader
      // than `ConfigWithAgents`. We only mutate `agents.list`, so passing
      // through preserves every other field untouched.
      runtime.config.writeConfigFile(
        cfg as unknown as Parameters<typeof runtime.config.writeConfigFile>[0],
      )

    const provision = (input: ProvisionInput) =>
      provisionAgent(
        {
          registry,
          identity: { org_id: bridgeCore.identity.org_id },
          emitter: eventBus.emitter,
          composio,
          ensureAgentWorkspace: runtime.agent.ensureAgentWorkspace,
          loadConfig,
          writeConfigFile,
          writeFile: (p, c) => fs.writeFile(p, c, 'utf8'),
          resolveStateDir: runtime.state.resolveStateDir,
        },
        input,
      )

    const deprovision = (input: DeprovisionInput) =>
      deprovisionAgent(
        {
          registry,
          emitter: eventBus.emitter,
          composio,
          loadConfig,
          writeConfigFile,
          rm: fs.rm,
          // The SDK's resolveAgentDir signature is positional
          // `(cfg, agentId, env?)`; bridge it to the deprovision adapter
          // shape, which uses an object for clarity at call sites.
          resolveAgentDir: ({ cfg, agentId }) =>
            runtime.agent.resolveAgentDir(
              cfg as unknown as Parameters<typeof runtime.agent.resolveAgentDir>[0],
              agentId,
            ),
        },
        input,
      )

    const agentManager: AgentManager = { registry, provision, deprovision }
    ctx.agentManager = agentManager

    // Wire the heartbeat's agent count through to the live registry.
    eventBus.heartbeat.setAgentCountSource(() => registry.count())
  },
}

export {
  createAgentRegistry,
  type AgentRegistry,
  type AgentRegistryEntry,
} from './registry'
export {
  provisionAgent,
  type ProvisionInput,
  type ProvisionResult,
  type ConfigWithAgents,
  type AgentEntryShape,
} from './provision'
export {
  deprovisionAgent,
  type DeprovisionInput,
  type DeprovisionResult,
} from './deprovision'
export { buildIdentityMarkdown, type IdentityFrontmatter } from './identity'
