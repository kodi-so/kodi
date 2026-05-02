import * as path from 'node:path'
import { randomUUID } from 'node:crypto'
import type { Emitter } from '../event-bus/emitter'
import type {
  ComposioAction,
  ComposioModuleApi,
  ComposioStatus,
} from '../composio'
import type { AgentRegistry } from './registry'
import { buildIdentityMarkdown } from './identity'

/**
 * `provisionAgent` — creates or refreshes one OpenClaw agent for one Kodi
 * user inside this instance.
 *
 * Per the M0-T3 spike, an OpenClaw agent is three things:
 *   1. an entry in `OpenClawConfig.agents.list`
 *   2. a workspace directory with bootstrap files
 *   3. an `IDENTITY.md` file inside that workspace
 *
 * Two paths:
 *
 *   - **First-time**: do all three above + register Composio tools + emit
 *     `agent.provisioned`.
 *   - **Re-provision** (KOD-381 idempotent path): the agent already exists
 *     for this user, so skip workspace / identity / config writes; just
 *     re-call `composio.registerToolsForAgent` so the tool surface stays
 *     in sync with the user's current toolkit allowlist (the composio
 *     module diffs add/remove internally), refresh the cached
 *     `composio_status` on the registry entry, and return the same
 *     `openclaw_agent_id`. No `agent.provisioned` re-emit — Kodi already
 *     knows about this agent and would dedupe; emitting again would be
 *     misleading semantics.
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
  /**
   * Opaque Composio session id from Kodi. `null`/absent when the user has
   * not connected a Composio session — agent still provisions, just with
   * `composio_status: 'skipped'` (set by the composio module).
   */
  composio_session_id?: string | null
  /**
   * Full current action list for this user. Empty array means the user has
   * revoked everything; the agent stays alive but no tools are registered.
   */
  actions?: readonly ComposioAction[]
  /**
   * Kodi DB UUID, when known. KOD-381's inbound provision route passes it.
   * Subsequent agent-context-bearing events for this agent omit the
   * `agent.agent_id` field when this is absent rather than fabricate.
   */
  kodi_agent_id?: string
}

export type ProvisionResult = {
  openclaw_agent_id: string
  workspace_dir: string
  composio_status: ComposioStatus
  registered_tool_count: number
  /** False if the agent already existed; true if a new one was created. */
  created: boolean
}

const KODI_WORKSPACE_DIR = 'kodi-workspaces'
const IDENTITY_FILENAME = 'IDENTITY.md'

/** Generate the OpenClaw runtime ID. Format: `agent_<8-char-hex>`. */
function defaultAgentIdFactory(): string {
  return `agent_${randomUUID().replace(/-/g, '').slice(0, 8)}`
}

/**
 * Call composio.registerToolsForAgent with safe error handling. The contract
 * forbids throwing, but any misbehavior is treated as a `failed` outcome so
 * the agent is still persisted on the agent-manager side.
 */
async function syncComposio(
  composio: ComposioModuleApi,
  params: {
    user_id: string
    openclaw_agent_id: string
    composio_session_id?: string | null
    actions: readonly ComposioAction[]
  },
  logger: Pick<Console, 'log' | 'warn'>,
): Promise<{ status: ComposioStatus; registered_tool_count: number }> {
  try {
    return await composio.registerToolsForAgent(params)
  } catch (err) {
    logger.warn(
      JSON.stringify({
        msg: 'composio registerToolsForAgent threw — treating as failed',
        openclaw_agent_id: params.openclaw_agent_id,
        error: err instanceof Error ? err.message : String(err),
      }),
    )
    return { status: 'failed', registered_tool_count: 0 }
  }
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

  const actions = input.actions ?? []

  // Re-provision path: agent already exists for this user. Sync tool surface
  // and Composio session ref, then return — no workspace/IDENTITY/config
  // writes, no event emit.
  const existingByUser = registry.getByUser(input.user_id)
  if (existingByUser) {
    const sync = await syncComposio(
      composio,
      {
        user_id: input.user_id,
        openclaw_agent_id: existingByUser.openclaw_agent_id,
        composio_session_id: input.composio_session_id ?? null,
        actions,
      },
      logger,
    )
    // Update the cached status; everything else on the registry entry is
    // unchanged (workspace_dir, created_at, kodi_agent_id all stable).
    registry.add({ ...existingByUser, composio_status: sync.status })
    return {
      openclaw_agent_id: existingByUser.openclaw_agent_id,
      workspace_dir: existingByUser.workspace_dir,
      composio_status: sync.status,
      registered_tool_count: sync.registered_tool_count,
      created: false,
    }
  }

  // First-time path.
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
  // Spike confirms the gateway picks this up on the next turn-prep without
  // a restart.
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

  const sync = await syncComposio(
    composio,
    {
      user_id: input.user_id,
      openclaw_agent_id,
      composio_session_id: input.composio_session_id ?? null,
      actions,
    },
    logger,
  )

  registry.add({
    user_id: input.user_id,
    openclaw_agent_id,
    workspace_dir,
    kodi_agent_id: input.kodi_agent_id,
    composio_status: sync.status,
    created_at,
  })

  await emitter.emit('agent.provisioned', {
    user_id: input.user_id,
    openclaw_agent_id,
    composio_status: sync.status,
  })

  return {
    openclaw_agent_id,
    workspace_dir,
    composio_status: sync.status,
    registered_tool_count: sync.registered_tool_count,
    created: true,
  }
}
