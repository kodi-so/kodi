import type { Hono } from 'hono'
import {
  agentAutonomyPolicies,
  and,
  db,
  decrypt,
  eq,
  instances,
  ne,
  openClawAgents,
  orgMembers,
  type AgentAutonomyPolicy,
  type AutonomyLevel,
  type AutonomyOverrides,
  type Instance,
  type OpenClawAgent,
} from '@kodi/db'
import {
  buildAgentToolLoadout,
  computeEffectiveToolkitAllowlist,
  type ComposioAction,
} from '../lib/composio-sessions'
import { getSessionFromHeaders } from '../context'
import {
  setAgentAutonomyPolicy,
  SetAgentAutonomyBodySchema,
} from '../lib/openclaw/autonomy'

/**
 * GET /api/openclaw/agents
 *
 * Plugin-side startup reconciliation endpoint (KOD-387). Returns the
 * canonical agent list for the calling instance with everything the
 * plugin needs to recreate each agent locally:
 *
 *   - kodi_agent_id        (the Kodi DB UUID)
 *   - openclaw_agent_id    (the runtime ID Kodi expects the plugin to use)
 *   - agent_type           ('org' | 'member')
 *   - user_id              (member's Kodi user_id, or org_id sentinel for org agents)
 *   - composio_session_id  (session id Kodi sends on /agents/provision; null if no session)
 *   - actions              (full action list, matching KOD-381's body schema)
 *
 * Auth: Bearer instance.gatewayToken. Read-only, no HMAC needed.
 *
 * Cost note: this endpoint resolves each member's effective toolkit
 * allowlist and asks Composio for their action list — N Composio API
 * calls per request, where N is the org's member count. Acceptable
 * because the plugin only calls this on startup + hourly retry.
 */

function readBearerToken(headerValue: string | null): string | null {
  if (!headerValue) return null
  const match = /^Bearer\s+(.+)$/i.exec(headerValue.trim())
  return match?.[1] ?? null
}

async function resolveInstanceByToken(bearer: string): Promise<Instance | null> {
  const candidates = await db.select().from(instances).where(eq(instances.status, 'running'))
  for (const instance of candidates) {
    if (!instance.gatewayToken) continue
    try {
      if (decrypt(instance.gatewayToken) === bearer) return instance
    } catch {
      // skip rows whose ciphertext can't be decrypted
    }
  }
  return null
}

export type ReconcileAgentEntry = {
  kodi_agent_id: string
  openclaw_agent_id: string
  agent_type: 'org' | 'member'
  /**
   * For member agents: the Kodi user UUID. For org agents: the org_id
   * itself (sentinel — see provisionOrgAgent comment in
   * composio-sessions.ts).
   */
  user_id: string
  composio_session_id: string | null
  actions: ComposioAction[]
}

export type ReconcileAgentsResponse = {
  agents: ReconcileAgentEntry[]
}

function emptyEntry(
  agent: OpenClawAgent,
  agent_type: 'org' | 'member',
  user_id: string,
): ReconcileAgentEntry {
  return {
    kodi_agent_id: agent.id,
    openclaw_agent_id: agent.openclawAgentId,
    agent_type,
    user_id,
    composio_session_id: null,
    actions: [],
  }
}

async function buildReconcileEntry(
  agent: OpenClawAgent,
  org_id: string,
): Promise<ReconcileAgentEntry> {
  // Org agent: no user identity → no Composio session, empty actions.
  if (agent.agentType === 'org') return emptyEntry(agent, 'org', org_id)

  // Defensive: a member-typed agent without org_member_id (or whose
  // member row vanished) is malformed; surface as zero-action skipped
  // agent rather than crash the route.
  if (!agent.orgMemberId) {
    return emptyEntry(agent, 'member', agent.composioUserId ?? '')
  }
  const member = await db.query.orgMembers.findFirst({
    where: eq(orgMembers.id, agent.orgMemberId),
  })
  if (!member) {
    return emptyEntry(agent, 'member', agent.composioUserId ?? '')
  }

  const allowlist = await computeEffectiveToolkitAllowlist({
    dbInstance: db,
    org_id,
    user_id: member.userId,
  })
  const loadout = await buildAgentToolLoadout({
    user_id: member.userId,
    toolkit_allowlist: allowlist,
  })

  return {
    kodi_agent_id: agent.id,
    openclaw_agent_id: agent.openclawAgentId,
    agent_type: 'member',
    user_id: member.userId,
    composio_session_id: loadout.ok && allowlist.length > 0 ? member.userId : null,
    actions: loadout.ok ? loadout.actions : [],
  }
}

export type AutonomyPolicyResponse = {
  agent_id: string
  autonomy_level: AutonomyLevel
  overrides: AutonomyOverrides | null
}

/**
 * Default returned to the plugin when no `agent_autonomy_policies` row
 * exists for the agent. Spec note from KOD-389: missing rows mean
 * "use defaults", and the defaults live in application code (here)
 * rather than as DB triggers.
 */
export const DEFAULT_AUTONOMY_POLICY: Omit<AutonomyPolicyResponse, 'agent_id'> = {
  autonomy_level: 'normal',
  overrides: null,
}

function rowToResponse(
  row: AgentAutonomyPolicy | undefined,
  agentId: string,
): AutonomyPolicyResponse {
  if (!row) return { agent_id: agentId, ...DEFAULT_AUTONOMY_POLICY }
  return {
    agent_id: row.agentId,
    autonomy_level: row.autonomyLevel as AutonomyLevel,
    overrides: row.overrides ?? null,
  }
}

export function registerOpenClawAgentsRoutes(app: Hono): void {
  app.get('/api/openclaw/agents', async (c) => {
    const bearer = readBearerToken(c.req.header('authorization') ?? null)
    if (!bearer) return c.json({ error: 'Unauthorized' }, 401)

    const instance = await resolveInstanceByToken(bearer)
    if (!instance) return c.json({ error: 'Unauthorized' }, 401)

    const agents = await db
      .select()
      .from(openClawAgents)
      .where(
        and(
          eq(openClawAgents.orgId, instance.orgId),
          ne(openClawAgents.status, 'deprovisioned'),
        ),
      )

    // Build entries in parallel — each member row triggers a Composio
    // tools.list fetch, and serial would block the response for ~N×500ms
    // on large orgs. Composio's per-account rate limit applies regardless;
    // parallel just keeps the wall-clock low for the common case.
    const entries = await Promise.all(
      agents.map((agent) => buildReconcileEntry(agent, instance.orgId)),
    )

    return c.json<ReconcileAgentsResponse>({ agents: entries })
  })

  /**
   * GET /api/openclaw/agents/:id/autonomy (KOD-389)
   *
   * Returns the autonomy policy for a single agent. Used by the plugin's
   * autonomy module on cache miss / TTL expiry. Bearer-auth via the
   * instance's gateway token; the agent must belong to the calling
   * instance's org so one instance can't probe another's policies.
   */
  app.get('/api/openclaw/agents/:id/autonomy', async (c) => {
    const bearer = readBearerToken(c.req.header('authorization') ?? null)
    if (!bearer) return c.json({ error: 'Unauthorized' }, 401)

    const instance = await resolveInstanceByToken(bearer)
    if (!instance) return c.json({ error: 'Unauthorized' }, 401)

    const agentId = c.req.param('id')
    if (!agentId) return c.json({ error: 'Missing agent id' }, 400)

    // Ownership check: the requested agent must be in this instance's org.
    const agent = await db.query.openClawAgents.findFirst({
      where: and(
        eq(openClawAgents.id, agentId),
        eq(openClawAgents.orgId, instance.orgId),
      ),
    })
    if (!agent) return c.json({ error: 'Not Found' }, 404)

    const row = await db.query.agentAutonomyPolicies.findFirst({
      where: eq(agentAutonomyPolicies.agentId, agentId),
    })

    return c.json<AutonomyPolicyResponse>(rowToResponse(row, agentId))
  })

  /**
   * PUT /api/openclaw/agents/:id/autonomy (KOD-392 / M5-T4)
   *
   * Admin mutation: set the autonomy level + overrides for a single agent.
   * Auth: better-auth session cookie + role='owner' membership in the
   * agent's org. After the upsert, signs and POSTs to
   * `/plugins/kodi-bridge/agents/update-policy` so the plugin's loader
   * cache invalidates within seconds (rather than waiting for the
   * 15-min TTL).
   */
  app.put('/api/openclaw/agents/:id/autonomy', async (c) => {
    const session = await getSessionFromHeaders(c.req.raw.headers)
    if (!session?.user?.id) {
      return c.json({ error: 'Unauthorized' }, 401)
    }

    const agentId = c.req.param('id')
    if (!agentId) return c.json({ error: 'Missing agent id' }, 400)

    const agent = await db.query.openClawAgents.findFirst({
      where: eq(openClawAgents.id, agentId),
    })
    if (!agent) return c.json({ error: 'Not Found' }, 404)

    // Ownership check: caller must be `owner` of the agent's org. We use
    // the existing org_members table — same primitive tRPC's
    // `requireOwner` middleware leans on.
    const membership = await db.query.orgMembers.findFirst({
      where: and(
        eq(orgMembers.orgId, agent.orgId),
        eq(orgMembers.userId, session.user.id),
      ),
    })
    if (!membership) return c.json({ error: 'Forbidden' }, 403)
    if (membership.role !== 'owner') {
      return c.json({ error: 'Forbidden — owner role required' }, 403)
    }

    const rawBody = await c.req.json().catch(() => null)
    const parsed = SetAgentAutonomyBodySchema.safeParse(rawBody)
    if (!parsed.success) {
      return c.json(
        { error: 'Invalid body', details: parsed.error.flatten() },
        400,
      )
    }

    const result = await setAgentAutonomyPolicy({
      agentId,
      orgId: agent.orgId,
      autonomyLevel: parsed.data.autonomy_level,
      overrides: parsed.data.overrides ?? null,
      decidedByUserId: session.user.id,
    })

    return c.json(result, 200)
  })
}
