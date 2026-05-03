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
import { reconcileAgents, type ReconcileResult } from './reconcile'

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
  /**
   * Run a single reconcile pass against Kodi's canonical agent list.
   * Exposed so KOD-387's startup wiring (and future ops endpoints) can
   * trigger reconcile without re-routing through the registry directly.
   */
  reconcile: () => Promise<ReconcileResult>
}

/** One hour — the cadence on which we retry reconcile if Kodi was
 * unreachable at startup, per KOD-387's spec. */
export const RECONCILE_RETRY_INTERVAL_MS = 60 * 60 * 1000

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

    const reconcile = () =>
      reconcileAgents({
        kodiClient: bridgeCore.kodiClient,
        registry,
        provision,
        deprovision,
      })

    const agentManager: AgentManager = {
      registry,
      provision,
      deprovision,
      reconcile,
    }
    ctx.agentManager = agentManager

    // Wire the heartbeat's agent count through to the live registry.
    eventBus.heartbeat.setAgentCountSource(() => registry.count())

    // KOD-387: kick off the startup reconcile in the background. If Kodi
    // is unreachable at boot we don't want to block plugin register;
    // an hourly retry timer takes over until reconcile succeeds.
    void runStartupReconcile(reconcile)
  },
}

/**
 * Fire the first reconcile and, on failure, schedule retries on the
 * hourly cadence per KOD-387 spec ("Kodi unreachable at startup: log,
 * proceed with stale local state; retry reconciliation on an hourly
 * cadence"). Once reconcile succeeds we stop retrying — subsequent
 * drift is handled by Kodi-initiated triggers (KOD-384, KOD-386).
 */
async function runStartupReconcile(
  reconcile: () => Promise<ReconcileResult>,
): Promise<void> {
  const first = await safeReconcile(reconcile)
  if (first.ok) return

  const timer = setInterval(async () => {
    const result = await safeReconcile(reconcile)
    if (result.ok) clearInterval(timer)
  }, RECONCILE_RETRY_INTERVAL_MS)
  // Don't keep the process alive purely for this retry timer.
  ;(timer as { unref?: () => void }).unref?.()
}

async function safeReconcile(
  reconcile: () => Promise<ReconcileResult>,
): Promise<ReconcileResult> {
  try {
    return await reconcile()
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : String(err),
      results: [],
    }
  }
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
export {
  reconcileAgents,
  RECONCILE_AGENTS_PATH,
  type ReconcileAgentEntry,
  type ReconcileDeps,
  type ReconcileResult,
  type ReconcileEntryResult,
} from './reconcile'
