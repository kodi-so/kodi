import * as path from 'node:path'
import { randomUUID } from 'node:crypto'
import type { Emitter } from '../event-bus/emitter'
import type { ComposioModuleApi, ComposioStatus } from '../composio'
import type { AgentRegistry } from './registry'
import { buildIdentityMarkdown } from './identity'

/**
 * `provisionAgent` — creates one OpenClaw agent for one Kodi user inside this
 * instance.
 *
 * Per the M0-T3 spike, an OpenClaw agent is three things:
 *   1. an entry in `OpenClawConfig.agents.list`
 *   2. a workspace directory with bootstrap files
 *   3. an `IDENTITY.md` file inside that workspace
 *
 * This function does all three programmatically (no CLI subprocess) and
 * follows up with Composio tool registration + an `agent.provisioned` event.
 *
 * Idempotency: if an agent already exists for the same `user_id` in the
 * registry, return that entry without touching disk, config, Composio, or
 * the event bus. Same applies if the OpenClaw config already lists an agent
 * with the generated id (defense-in-depth against startup-reconcile races).
 */

export type AgentEntryShape = {
  id: string
  name: string
  workspace: string
  agentDir?: string
}

/**
 * Loose shape — we only touch `agents.list`. OpenClawConfig has dozens of
 * fields the plugin doesn't care about. Keeping the type loose avoids
 * coupling the plugin's bundled types to the host SDK's internal config
 * shape; the plugin SDK passes whatever shape `loadConfig()` returns.
 */
export type ConfigWithAgents = {
  agents?: { list?: AgentEntryShape[] | null } | null
  // Other fields are preserved untouched on write-back.
  [key: string]: unknown
}

export type ProvisionDeps = {
  registry: AgentRegistry
  /**
   * The plugin's own identity, populated by bridge-core. We need `org_id`
   * for the IDENTITY.md frontmatter; `instance_id` is implied by the fact
   * that the plugin only manages agents inside its own instance.
   */
  identity: { org_id: string }
  emitter: Emitter
  composio: ComposioModuleApi

  // ── SDK surface (injected for testability) ──────────────────────────────
  ensureAgentWorkspace: (params: {
    dir: string
    ensureBootstrapFiles?: boolean
  }) => Promise<{ dir: string; identityPath?: string }>
  loadConfig: () => ConfigWithAgents
  writeConfigFile: (cfg: ConfigWithAgents) => Promise<void>
  writeFile: (filePath: string, content: string) => Promise<void>
  resolveStateDir: () => string

  // ── Test overrides ──────────────────────────────────────────────────────
  agentIdFactory?: () => string
  now?: () => Date
  logger?: Pick<Console, 'log' | 'warn'>
}

export type ProvisionInput = {
  user_id: string
  composio_session?: unknown
  /**
   * Kodi DB UUID, when known. KOD-381's inbound provision route will pass
   * it; until then, the plugin operates without it and the registry holds
   * `kodi_agent_id: undefined`. Subsequent agent-context-bearing events
   * for this agent omit the `agent.agent_id` field rather than fabricate.
   */
  kodi_agent_id?: string
}

export type ProvisionResult = {
  openclaw_agent_id: string
  workspace_dir: string
  composio_status: ComposioStatus
  /** False if we returned an existing agent; true if a new one was created. */
  created: boolean
}

const KODI_WORKSPACE_DIR = 'kodi-workspaces'
const IDENTITY_FILENAME = 'IDENTITY.md'

/** Generate the OpenClaw runtime ID. Format: `agent_<8-char-hex>`. */
function defaultAgentIdFactory(): string {
  // randomUUID is hex with dashes — strip and slice to 8 chars
  return `agent_${randomUUID().replace(/-/g, '').slice(0, 8)}`
}

export async function provisionAgent(
  deps: ProvisionDeps,
  input: ProvisionInput,
): Promise<ProvisionResult> {
  const {
    registry,
    identity,
    emitter,
    composio,
    ensureAgentWorkspace,
    loadConfig,
    writeConfigFile,
    writeFile,
    resolveStateDir,
    agentIdFactory = defaultAgentIdFactory,
    now = () => new Date(),
    logger = console,
  } = deps

  // Idempotency on user — the registry is the source of truth in-process.
  const existingByUser = registry.getByUser(input.user_id)
  if (existingByUser) {
    return {
      openclaw_agent_id: existingByUser.openclaw_agent_id,
      workspace_dir: existingByUser.workspace_dir,
      composio_status: existingByUser.composio_status,
      created: false,
    }
  }

  const openclaw_agent_id = agentIdFactory()
  const workspace_dir = path.join(
    resolveStateDir(),
    KODI_WORKSPACE_DIR,
    openclaw_agent_id,
  )
  const created_at = now().toISOString()

  await ensureAgentWorkspace({
    dir: workspace_dir,
    ensureBootstrapFiles: true,
  })

  const identityPath = path.join(workspace_dir, IDENTITY_FILENAME)
  await writeFile(
    identityPath,
    buildIdentityMarkdown({
      user_id: input.user_id,
      org_id: identity.org_id,
      created_at,
    }),
  )

  // Add to OpenClaw's `agents.list` so the gateway can route turns to it.
  // We use a load-mutate-write cycle; the spike confirms the gateway picks
  // this up on the next turn-prep without restart.
  const cfg = loadConfig()
  const list: AgentEntryShape[] = Array.isArray(cfg.agents?.list)
    ? [...(cfg.agents!.list as AgentEntryShape[])]
    : []
  if (!list.some((e) => e.id === openclaw_agent_id)) {
    list.push({
      id: openclaw_agent_id,
      name: openclaw_agent_id,
      workspace: workspace_dir,
    })
    await writeConfigFile({
      ...cfg,
      agents: { ...(cfg.agents ?? {}), list },
    })
  }

  // Composio tool registration. The contract guarantees this never throws
  // — failures surface as `status: 'failed'`. We persist the agent in the
  // registry either way so the row can be reconciled / retried later.
  let composio_status: ComposioStatus = 'pending'
  try {
    const result = await composio.registerToolsForAgent({
      user_id: input.user_id,
      openclaw_agent_id,
      composio_session: input.composio_session,
    })
    composio_status = result.status
  } catch (err) {
    logger.warn(
      JSON.stringify({
        msg: 'composio registerToolsForAgent threw — treating as failed',
        openclaw_agent_id,
        error: err instanceof Error ? err.message : String(err),
      }),
    )
    composio_status = 'failed'
  }

  registry.add({
    user_id: input.user_id,
    openclaw_agent_id,
    workspace_dir,
    kodi_agent_id: input.kodi_agent_id,
    composio_status,
    created_at,
  })

  await emitter.emit('agent.provisioned', {
    user_id: input.user_id,
    openclaw_agent_id,
    composio_status,
  })

  return {
    openclaw_agent_id,
    workspace_dir,
    composio_status,
    created: true,
  }
}
