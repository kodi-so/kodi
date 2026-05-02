import type { Emitter } from '../event-bus/emitter'
import type { ComposioModuleApi } from '../composio'
import type { AgentRegistry } from './registry'
import type { ConfigWithAgents, AgentEntryShape } from './provision'

/**
 * `deprovisionAgent` — tears down one OpenClaw agent for one Kodi user.
 *
 * Inverse of `provisionAgent`:
 *   1. unregister Composio tools (won't throw — see ComposioModuleApi)
 *   2. remove the entry from `OpenClawConfig.agents.list`
 *   3. remove the workspace dir
 *   4. remove the agent-scoped dir (`~/.openclaw/agents/<id>/`)
 *   5. remove from the in-memory registry
 *   6. emit `agent.deprovisioned`
 *
 * Edge cases:
 *   - Unknown user: no-op success — `{ ok: true, removed: false }`. Per
 *     the ticket, this lets the inbound deprovision route stay idempotent
 *     across retries without distinguishing "didn't exist" from "already
 *     deprovisioned".
 *   - Workspace already gone (e.g. operator wiped state): the rm call uses
 *     `force: true` to swallow ENOENT.
 */

export type DeprovisionDeps = {
  registry: AgentRegistry
  emitter: Emitter
  composio: ComposioModuleApi

  // ── SDK surface ─────────────────────────────────────────────────────────
  loadConfig: () => ConfigWithAgents
  writeConfigFile: (cfg: ConfigWithAgents) => Promise<void>
  /** `fs.rm(path, { recursive, force })`. */
  rm: (
    p: string,
    opts: { recursive: boolean; force: boolean },
  ) => Promise<void>
  /**
   * Resolve the agent-scoped dir (e.g. `~/.openclaw/agents/<id>/`) so we
   * can purge it. Optional — when absent we only clean the workspace.
   */
  resolveAgentDir?: (params: {
    cfg: ConfigWithAgents
    agentId: string
  }) => string

  logger?: Pick<Console, 'log' | 'warn'>
}

export type DeprovisionInput = {
  user_id: string
}

export type DeprovisionResult = {
  ok: true
  /** False when no agent was registered for this user. */
  removed: boolean
  openclaw_agent_id?: string
}

export async function deprovisionAgent(
  deps: DeprovisionDeps,
  input: DeprovisionInput,
): Promise<DeprovisionResult> {
  const {
    registry,
    emitter,
    composio,
    loadConfig,
    writeConfigFile,
    rm,
    resolveAgentDir,
    logger = console,
  } = deps

  const entry = registry.getByUser(input.user_id)
  if (!entry) return { ok: true, removed: false }

  const { openclaw_agent_id, workspace_dir } = entry

  // 1. Composio teardown. Contract says this never throws.
  try {
    await composio.unregisterToolsForAgent({ openclaw_agent_id })
  } catch (err) {
    // Defensive: even though the contract forbids throwing, don't let a
    // misbehaving impl leave us with a half-deprovisioned agent.
    logger.warn(
      JSON.stringify({
        msg: 'composio unregisterToolsForAgent threw — continuing teardown',
        openclaw_agent_id,
        error: err instanceof Error ? err.message : String(err),
      }),
    )
  }

  // 2. Remove from agents.list. Filter rather than splice so we don't
  // mutate a snapshot the SDK may have returned by reference.
  const cfg = loadConfig()
  const list: AgentEntryShape[] = Array.isArray(cfg.agents?.list)
    ? (cfg.agents!.list as AgentEntryShape[])
    : []
  const filtered = list.filter((e) => e.id !== openclaw_agent_id)
  if (filtered.length !== list.length) {
    await writeConfigFile({
      ...cfg,
      agents: { ...(cfg.agents ?? {}), list: filtered },
    })
  }

  // 3 & 4. Filesystem cleanup. `force: true` makes ENOENT a no-op.
  await rm(workspace_dir, { recursive: true, force: true })
  if (resolveAgentDir) {
    try {
      const agentDir = resolveAgentDir({ cfg, agentId: openclaw_agent_id })
      await rm(agentDir, { recursive: true, force: true })
    } catch (err) {
      logger.warn(
        JSON.stringify({
          msg: 'resolveAgentDir/rm failed — workspace cleared, agent dir may persist',
          openclaw_agent_id,
          error: err instanceof Error ? err.message : String(err),
        }),
      )
    }
  }

  // 5. Registry.
  registry.remove(openclaw_agent_id)

  // 6. Event.
  await emitter.emit('agent.deprovisioned', {
    user_id: input.user_id,
    openclaw_agent_id,
  })

  return { ok: true, removed: true, openclaw_agent_id }
}
