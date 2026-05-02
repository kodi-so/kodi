import {
  and,
  db as defaultDb,
  ensureMemberOpenClawAgent,
  ensureOrgOpenClawAgent,
  eq,
  encrypt,
  openClawAgents,
  type Instance,
} from '@kodi/db'
import {
  getComposioClient,
  listPersistedConnections,
  listToolkitPolicies,
} from './composio'
import {
  pushAgentDeprovision,
  pushAgentProvision,
  type PushResult,
} from './openclaw/plugin-client'

/**
 * Kodi-side Composio session creation + agent provisioning orchestration.
 *
 * Owns the round-trip:
 *   1. Build the user's effective toolkit allowlist (intersection of
 *      connected toolkits and org policy).
 *   2. Fetch each action's name/description/parameters from Composio.
 *   3. Persist the openclaw_agents row (creating if missing).
 *   4. Stash any Composio session metadata into `composio_session_enc`.
 *   5. Call the plugin's `POST /plugins/kodi-bridge/agents/provision` and
 *      record the resulting `composio_status`.
 *
 * Idempotent: every trigger source (initial provision, toolkit
 * connect/disconnect, Composio webhook, admin policy edit) funnels through
 * `provisionAgentForUser` with the same shape.
 *
 * Failure handling:
 *   - Composio API throws → `composio_status='failed'`, plugin call still
 *     fires with `actions: []` so the agent itself stays alive.
 *   - Plugin call fails → `composio_status='failed'`, error logged. The
 *     plugin retries when Kodi calls again.
 *   - Empty allowlist → `composio_status='skipped'`, no plugin call.
 */

// ── Types ─────────────────────────────────────────────────────────────────

/**
 * One action exposed to the agent — matches the plugin's
 * `/agents/provision` body schema (KOD-381).
 */
export type ComposioAction = {
  name: string
  description: string
  parameters: unknown
  toolkit: string
  action: string
}

export type ComposioStatus =
  | 'pending'
  | 'active'
  | 'failed'
  | 'disconnected'
  | 'skipped'

export type ProvisionAgentForUserInput = {
  org_id: string
  user_id: string
  /** Identifier of the org_member row tying user_id to org_id. */
  org_member_id: string
  /**
   * Display name to seed onto a freshly-created openclaw_agents row.
   * Existing rows keep their displayName; only used on first creation.
   */
  display_name?: string | null
  /** Override the database connection for tests. */
  dbInstance?: typeof defaultDb
  /** Replace the loadout fetcher (lets tests bypass the real Composio SDK). */
  loadoutBuilder?: typeof buildAgentToolLoadout
  /** Replace the plugin push call (lets tests bypass the real fetch). */
  pluginPush?: typeof pushAgentProvision
}

export type ProvisionAgentForUserResult = {
  openclaw_agents_row_id: string
  openclaw_agent_id: string
  composio_status: ComposioStatus
  /**
   * The number of tools Kodi handed to the plugin. May differ from what
   * the plugin reports back if the plugin filters or fails part-way.
   */
  attempted_tool_count: number
  /** What the plugin reported back. Null if the plugin call failed. */
  registered_tool_count: number | null
  /**
   * Stable id used to scope per-user calls on the plugin side. Currently
   * the Kodi user_id; KOD-388 may swap this for a real Composio session
   * id once the plugin has direct Composio API access.
   */
  composio_session_id: string | null
  pluginResult: PushResult | { ok: false; reason: 'no-instance' } | null
}

export type DeprovisionAgentForUserInput = {
  org_id: string
  user_id: string
  org_member_id: string
  dbInstance?: typeof defaultDb
  pluginPush?: typeof pushAgentDeprovision
}

export type DeprovisionAgentForUserResult = {
  removed: boolean
  pluginResult: PushResult | { ok: false; reason: 'no-instance' | 'no-agent' } | null
}

// ── Loadout builder ───────────────────────────────────────────────────────

export type BuildAgentToolLoadoutInput = {
  user_id: string
  toolkit_allowlist: readonly string[]
  /**
   * Replace the underlying `composio.tools.getRawComposioTools(...)` call.
   * Default uses the shared composio client. Tests pass a fake.
   */
  composioToolFetcher?: ComposioToolFetcher
}

/**
 * Loose Composio tool shape — `getRawComposioTools` returns tools with
 * many extra fields we don't care about; everything below is what we
 * actually consume.
 */
export type RawComposioTool = {
  slug: string
  name?: string | null
  description?: string | null
  toolkitSlug?: string | null
  toolkit?: { slug?: string | null } | null
  inputParameters?: unknown
}

export type ComposioToolFetcher = (params: {
  user_id: string
  toolkits: readonly string[]
}) => Promise<readonly RawComposioTool[]>

const COMPOSIO_TOOL_LIST_LIMIT = 200

const defaultComposioToolFetcher: ComposioToolFetcher = async ({
  user_id,
  toolkits,
}) => {
  const composio = getComposioClient()
  const result = await composio.tools.getRawComposioTools({
    toolkits: [...toolkits],
    userId: user_id,
    limit: COMPOSIO_TOOL_LIST_LIMIT,
  } as unknown as Parameters<typeof composio.tools.getRawComposioTools>[0])
  // The SDK returns a `ToolList` object; structurally it iterates as an
  // array of tools with the fields we care about.
  return Array.from(result as unknown as Iterable<RawComposioTool>)
}

export type BuildAgentToolLoadoutResult = {
  actions: ComposioAction[]
  /**
   * Toolkits Composio actually returned tools for; may be a subset of
   * `toolkit_allowlist` if some toolkits have no actions for this user.
   */
  toolkits_with_actions: string[]
  /** True when the loadout was built without a Composio API error. */
  ok: boolean
  /** Error message when ok=false. Always null on success. */
  error: string | null
}

export async function buildAgentToolLoadout(
  input: BuildAgentToolLoadoutInput,
): Promise<BuildAgentToolLoadoutResult> {
  if (input.toolkit_allowlist.length === 0) {
    return {
      actions: [],
      toolkits_with_actions: [],
      ok: true,
      error: null,
    }
  }

  const fetcher = input.composioToolFetcher ?? defaultComposioToolFetcher
  let raw: readonly RawComposioTool[]
  try {
    raw = await fetcher({
      user_id: input.user_id,
      toolkits: input.toolkit_allowlist,
    })
  } catch (err) {
    return {
      actions: [],
      toolkits_with_actions: [],
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    }
  }

  const actions: ComposioAction[] = []
  const toolkitsWithActions = new Set<string>()

  for (const tool of raw) {
    const action = toolToComposioAction(tool)
    if (!action) continue
    actions.push(action)
    toolkitsWithActions.add(action.toolkit)
  }

  return {
    actions,
    toolkits_with_actions: Array.from(toolkitsWithActions).sort(),
    ok: true,
    error: null,
  }
}

/**
 * Map a raw Composio tool to the plugin's ComposioAction shape. Returns
 * null for tools we can't make sense of (missing slug, missing toolkit).
 *
 * Tool naming: Composio slugs are conventionally `TOOLKIT_ACTION_NAME`
 * uppercase; the plugin convention is `toolkit__action_name` lowercase
 * (KOD-381 body example: `"gmail__send_email"`). We derive both from the
 * raw shape so the plugin gets a stable name even if Composio changes
 * casing later.
 */
export function toolToComposioAction(
  tool: RawComposioTool,
): ComposioAction | null {
  if (!tool.slug || typeof tool.slug !== 'string') return null
  const toolkit = (tool.toolkitSlug ?? tool.toolkit?.slug ?? null)?.toLowerCase()
  if (!toolkit) return null

  const slugLower = tool.slug.toLowerCase()
  // Strip the toolkit prefix from the slug to get the action slug.
  // e.g. "GMAIL_SEND_EMAIL" + toolkit "gmail" → action "send_email".
  // Falls back to the full lowered slug if the prefix doesn't match.
  const action =
    slugLower.startsWith(`${toolkit}_`) && slugLower.length > toolkit.length + 1
      ? slugLower.slice(toolkit.length + 1)
      : slugLower

  return {
    name: `${toolkit}__${action}`,
    description: typeof tool.description === 'string' ? tool.description : '',
    parameters: tool.inputParameters ?? null,
    toolkit,
    action,
  }
}

// ── Allowlist resolution ──────────────────────────────────────────────────

/**
 * Compute the user's effective toolkit allowlist: toolkits the user has
 * an ACTIVE persisted connection for AND the org's policy enables.
 */
export async function computeEffectiveToolkitAllowlist(params: {
  dbInstance: typeof defaultDb
  org_id: string
  user_id: string
}): Promise<string[]> {
  const [connections, policies] = await Promise.all([
    listPersistedConnections(params.dbInstance, params.org_id, params.user_id),
    listToolkitPolicies(params.dbInstance, params.org_id),
  ])

  const enabledToolkits = new Set(
    policies.filter((p) => p.enabled !== false).map((p) => p.toolkitSlug),
  )

  const connectedActive = new Set(
    connections
      .filter((c) => c.connectedAccountStatus === 'ACTIVE')
      .map((c) => c.toolkitSlug),
  )

  const intersection: string[] = []
  for (const slug of connectedActive) {
    // Default to enabled when no policy row exists (matches
    // getDefaultToolkitPolicy() in composio.ts).
    if (enabledToolkits.size === 0 || enabledToolkits.has(slug)) {
      intersection.push(slug)
    }
  }
  return intersection.sort()
}

// ── Provisioning orchestrator ────────────────────────────────────────────

async function resolveOrgInstance(
  dbInstance: typeof defaultDb,
  org_id: string,
): Promise<Instance | null> {
  const inst = await dbInstance.query.instances.findFirst({
    where: (fields, { and, eq, ne }) =>
      and(eq(fields.orgId, org_id), ne(fields.status, 'deleted')),
  })
  return inst ?? null
}

export async function provisionAgentForUser(
  input: ProvisionAgentForUserInput,
): Promise<ProvisionAgentForUserResult> {
  const dbInstance = input.dbInstance ?? defaultDb
  const loadoutBuilder = input.loadoutBuilder ?? buildAgentToolLoadout
  const pluginPush = input.pluginPush ?? pushAgentProvision

  // 1. Effective allowlist
  const allowlist = await computeEffectiveToolkitAllowlist({
    dbInstance,
    org_id: input.org_id,
    user_id: input.user_id,
  })

  // 2. Loadout (Composio call)
  const loadout = await loadoutBuilder({
    user_id: input.user_id,
    toolkit_allowlist: allowlist,
  })

  // 3. Compute the status we'll persist + send to the plugin.
  let composio_status: ComposioStatus
  if (!loadout.ok) {
    composio_status = 'failed'
  } else if (allowlist.length === 0) {
    composio_status = 'skipped'
  } else {
    composio_status = 'active'
  }

  // 4. Ensure the openclaw_agents row exists + persist session metadata.
  // Use the Kodi user_id as the composio_session_id — it's the natural
  // scoping key for Composio's per-user API. KOD-388 may swap this for a
  // real Composio session id when direct plugin↔Composio is needed.
  const composio_session_id = input.user_id
  const sessionMetadata = {
    user_id: input.user_id,
    org_id: input.org_id,
    toolkits: loadout.toolkits_with_actions,
    persisted_at: new Date().toISOString(),
  }

  const agent = await ensureMemberOpenClawAgent(dbInstance, {
    orgId: input.org_id,
    orgMemberId: input.org_member_id,
    displayName: input.display_name ?? null,
    status: 'active',
    metadata: { source: 'composio-session-orchestrator' },
  })

  await dbInstance
    .update(openClawAgents)
    .set({
      composioUserId: input.user_id,
      composioSessionEnc: encrypt(JSON.stringify(sessionMetadata)),
      composioStatus: composio_status,
      updatedAt: new Date(),
    })
    .where(eq(openClawAgents.id, agent.id))

  // 5. Plugin call.
  let pluginResult:
    | PushResult
    | { ok: false; reason: 'no-instance' }
    | null = null
  let registered_tool_count: number | null = null

  const inst = await resolveOrgInstance(dbInstance, input.org_id)
  if (!inst) {
    pluginResult = { ok: false, reason: 'no-instance' }
  } else {
    pluginResult = await pluginPush({
      instance: inst,
      body: {
        org_id: input.org_id,
        user_id: input.user_id,
        composio_session_id: loadout.ok ? composio_session_id : null,
        actions: loadout.ok ? loadout.actions : [],
        kodi_agent_id: agent.id,
      },
    })
    if (pluginResult.ok && pluginResult.parsedBody) {
      const parsed = pluginResult.parsedBody as {
        composio_status?: string
        registered_tool_count?: number
      }
      if (typeof parsed.registered_tool_count === 'number') {
        registered_tool_count = parsed.registered_tool_count
      }
      if (typeof parsed.composio_status === 'string') {
        // Plugin's view wins over Kodi's — e.g. plugin may downgrade to
        // 'failed' if its own dispatcher couldn't register tools.
        composio_status = parsed.composio_status as ComposioStatus
        await dbInstance
          .update(openClawAgents)
          .set({ composioStatus: composio_status, updatedAt: new Date() })
          .where(eq(openClawAgents.id, agent.id))
      }
    } else if (!pluginResult.ok) {
      composio_status = 'failed'
      await dbInstance
        .update(openClawAgents)
        .set({ composioStatus: 'failed', updatedAt: new Date() })
        .where(eq(openClawAgents.id, agent.id))
    }
  }

  return {
    openclaw_agents_row_id: agent.id,
    openclaw_agent_id: agent.openclawAgentId,
    composio_status,
    attempted_tool_count: loadout.actions.length,
    registered_tool_count,
    composio_session_id: loadout.ok ? composio_session_id : null,
    pluginResult,
  }
}

export async function deprovisionAgentForUser(
  input: DeprovisionAgentForUserInput,
): Promise<DeprovisionAgentForUserResult> {
  const dbInstance = input.dbInstance ?? defaultDb
  const pluginPush = input.pluginPush ?? pushAgentDeprovision

  const existing = await dbInstance.query.openClawAgents.findFirst({
    where: and(
      eq(openClawAgents.orgId, input.org_id),
      eq(openClawAgents.orgMemberId, input.org_member_id),
    ),
  })

  if (!existing) {
    return { removed: false, pluginResult: { ok: false, reason: 'no-agent' } }
  }

  let pluginResult:
    | PushResult
    | { ok: false; reason: 'no-instance' | 'no-agent' }
    | null = null

  const inst = await resolveOrgInstance(dbInstance, input.org_id)
  if (!inst) {
    pluginResult = { ok: false, reason: 'no-instance' }
  } else {
    pluginResult = await pluginPush({
      instance: inst,
      body: { user_id: input.user_id },
    })
  }

  await dbInstance
    .update(openClawAgents)
    .set({
      status: 'deprovisioned',
      composioStatus: 'disconnected',
      composioSessionEnc: null,
      updatedAt: new Date(),
    })
    .where(eq(openClawAgents.id, existing.id))

  return { removed: true, pluginResult }
}

// Re-export the org-agent helper so triggers (M4-T5) can ensure it
// without pulling from @kodi/db directly.
export { ensureOrgOpenClawAgent }
