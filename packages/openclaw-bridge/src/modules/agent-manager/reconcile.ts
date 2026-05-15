import type { KodiClient } from '../bridge-core/kodi-client'
import type { ComposioAction } from '../composio'
import type { AgentRegistry } from './registry'
import type {
  ProvisionInput,
  ProvisionResult,
} from './provision'
import type {
  DeprovisionInput,
  DeprovisionResult,
} from './deprovision'

/**
 * Plugin-side startup reconciliation (KOD-387).
 *
 * On every plugin register (cold start, restart, self-update), the
 * plugin's local `agent-manager` registry might disagree with Kodi's
 * canonical agent list. This module fetches Kodi's view via
 * `GET /api/openclaw/agents` and converges:
 *
 *   - agent in Kodi but missing locally  → call `provision({...})`
 *     using Kodi's `openclaw_agent_id` (so runtime IDs match the DB)
 *   - agent in registry but missing in Kodi → call `deprovision({user_id})`
 *   - agent in both                      → call `provision({...})` again,
 *     idempotent re-sync of the Composio session and tool diff
 *
 * Kodi unreachable (network error, 5xx after retries): log, leave the
 * registry untouched, return a result the caller can use to schedule
 * a retry on the spec'd hourly cadence.
 *
 * Per-agent provision failure does not abort the whole loop — each
 * outcome surfaces in `results[]` with `ok: false`.
 */

export const RECONCILE_AGENTS_PATH = '/api/openclaw/agents'

/**
 * Wire shape returned by Kodi's `GET /api/openclaw/agents`. Kept in sync
 * with `apps/api/src/routes/openclaw-agents.ts`. Validated at the
 * boundary because Kodi is a separate process and could be on a
 * different version (rolling deploy). Hand-rolled rather than zod —
 * `openclaw-bridge` is bundled with esbuild and pulls in only what it
 * needs.
 */
export type ReconcileAgentEntry = {
  kodi_agent_id: string
  openclaw_agent_id: string
  agent_type: 'org' | 'member'
  user_id: string
  composio_session_id: string | null
  actions: ComposioAction[]
}

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}

function parseAction(v: unknown): ComposioAction | null {
  if (!isPlainObject(v)) return null
  if (typeof v.name !== 'string' || v.name.length === 0) return null
  if (typeof v.description !== 'string') return null
  if (typeof v.toolkit !== 'string' || v.toolkit.length === 0) return null
  if (typeof v.action !== 'string' || v.action.length === 0) return null
  return {
    name: v.name,
    description: v.description,
    parameters: v.parameters ?? null,
    toolkit: v.toolkit,
    action: v.action,
  }
}

function parseEntry(v: unknown): ReconcileAgentEntry | null {
  if (!isPlainObject(v)) return null
  const {
    kodi_agent_id,
    openclaw_agent_id,
    agent_type,
    user_id,
    composio_session_id,
    actions,
  } = v
  if (typeof kodi_agent_id !== 'string' || kodi_agent_id.length === 0) return null
  if (typeof openclaw_agent_id !== 'string' || openclaw_agent_id.length === 0) return null
  if (agent_type !== 'org' && agent_type !== 'member') return null
  if (typeof user_id !== 'string' || user_id.length === 0) return null
  if (composio_session_id !== null && typeof composio_session_id !== 'string') return null
  if (!Array.isArray(actions)) return null

  const parsedActions: ComposioAction[] = []
  for (const a of actions) {
    const parsed = parseAction(a)
    if (!parsed) return null
    parsedActions.push(parsed)
  }
  return {
    kodi_agent_id,
    openclaw_agent_id,
    agent_type,
    user_id,
    composio_session_id,
    actions: parsedActions,
  }
}

function parseReconcileResponse(v: unknown): ReconcileAgentEntry[] | null {
  if (!isPlainObject(v)) return null
  if (!Array.isArray(v.agents)) return null
  const entries: ReconcileAgentEntry[] = []
  for (const e of v.agents) {
    const parsed = parseEntry(e)
    if (!parsed) return null
    entries.push(parsed)
  }
  return entries
}

export type ReconcileDeps = {
  kodiClient: KodiClient
  registry: AgentRegistry
  provision: (input: ProvisionInput) => Promise<ProvisionResult>
  deprovision: (input: DeprovisionInput) => Promise<DeprovisionResult>
  logger?: Pick<Console, 'log' | 'warn' | 'error'>
}

export type ReconcileResult = {
  /** True when Kodi responded; false when the fetch failed or returned
   * a non-OK status. Caller uses this to decide whether to schedule a
   * retry. On `false`, the local registry is untouched. */
  ok: boolean
  /** Error message when `ok=false`. */
  error?: string
  /** Per-agent outcomes from this run. Empty when `ok=false`. */
  results: ReconcileEntryResult[]
}

export type ReconcileEntryResult =
  | {
      ok: true
      action: 'created' | 'reused' | 'deprovisioned'
      openclaw_agent_id: string
      user_id?: string
    }
  | {
      ok: false
      action: 'create_failed' | 'deprovision_failed'
      openclaw_agent_id?: string
      user_id: string
      error: string
    }

async function fetchAgentList(
  kodiClient: KodiClient,
  logger: Pick<Console, 'log' | 'warn' | 'error'>,
): Promise<{ ok: true; entries: ReconcileAgentEntry[] } | { ok: false; error: string }> {
  let response: Response
  try {
    response = await kodiClient.signedFetch(RECONCILE_AGENTS_PATH, { method: 'GET' })
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err)
    return { ok: false, error }
  }

  if (!response.ok) {
    const text = await response.text().catch(() => '')
    return {
      ok: false,
      error: `Kodi returned ${response.status}: ${text.slice(0, 200)}`,
    }
  }

  let json: unknown
  try {
    json = await response.json()
  } catch (err) {
    return {
      ok: false,
      error: `failed to parse JSON: ${err instanceof Error ? err.message : String(err)}`,
    }
  }

  const entries = parseReconcileResponse(json)
  if (!entries) {
    logger.warn(JSON.stringify({ msg: 'agent.reconcile.parse_failed' }))
    return { ok: false, error: 'invalid response shape' }
  }

  return { ok: true, entries }
}

export async function reconcileAgents(deps: ReconcileDeps): Promise<ReconcileResult> {
  const logger = deps.logger ?? console
  const fetched = await fetchAgentList(deps.kodiClient, logger)
  if (!fetched.ok) {
    logger.warn(
      JSON.stringify({
        msg: 'agent.reconcile.fetch_failed',
        error: fetched.error,
      }),
    )
    return { ok: false, error: fetched.error, results: [] }
  }

  const entries = fetched.entries
  const expectedUserIds = new Set(entries.map((e) => e.user_id))
  const results: ReconcileEntryResult[] = []

  // Phase 1: drop orphans (in registry, not in Kodi).
  const localEntries = deps.registry.list()
  for (const local of localEntries) {
    if (expectedUserIds.has(local.user_id)) continue
    try {
      await deps.deprovision({ user_id: local.user_id })
      results.push({
        ok: true,
        action: 'deprovisioned',
        openclaw_agent_id: local.openclaw_agent_id,
        user_id: local.user_id,
      })
    } catch (err) {
      results.push({
        ok: false,
        action: 'deprovision_failed',
        openclaw_agent_id: local.openclaw_agent_id,
        user_id: local.user_id,
        error: err instanceof Error ? err.message : String(err),
      })
    }
  }

  // Phase 2: provision missing (and idempotently re-sync present).
  for (const entry of entries) {
    try {
      const wasPresent = deps.registry.getByUser(entry.user_id) !== undefined
      await deps.provision({
        user_id: entry.user_id,
        composio_session_id: entry.composio_session_id,
        actions: entry.actions,
        kodi_agent_id: entry.kodi_agent_id,
        openclaw_agent_id: entry.openclaw_agent_id,
      })
      results.push({
        ok: true,
        action: wasPresent ? 'reused' : 'created',
        openclaw_agent_id: entry.openclaw_agent_id,
        user_id: entry.user_id,
      })
    } catch (err) {
      results.push({
        ok: false,
        action: 'create_failed',
        openclaw_agent_id: entry.openclaw_agent_id,
        user_id: entry.user_id,
        error: err instanceof Error ? err.message : String(err),
      })
    }
  }

  const summary = {
    msg: 'agent.reconcile.complete',
    expected: entries.length,
    deprovisioned: results.filter((r) => r.ok && r.action === 'deprovisioned').length,
    created: results.filter((r) => r.ok && r.action === 'created').length,
    reused: results.filter((r) => r.ok && r.action === 'reused').length,
    failed: results.filter((r) => !r.ok).length,
  }
  logger.log(JSON.stringify(summary))

  return { ok: true, results }
}
