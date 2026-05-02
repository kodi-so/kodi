import type { Hono } from 'hono'
import {
  db,
  decrypt,
  eq,
  instances,
  openClawAgents,
  orgMembers,
  type Instance,
  type OpenClawAgent,
} from '@kodi/db'
import {
  buildAgentToolLoadout,
  computeEffectiveToolkitAllowlist,
  type ComposioAction,
} from '../lib/composio-sessions'

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

async function buildReconcileEntry(
  agent: OpenClawAgent,
  org_id: string,
): Promise<ReconcileAgentEntry> {
  if (agent.agentType === 'org') {
    // Org agent: no user identity → no Composio session, empty actions.
    return {
      kodi_agent_id: agent.id,
      openclaw_agent_id: agent.openclawAgentId,
      agent_type: 'org',
      user_id: org_id,
      composio_session_id: null,
      actions: [],
    }
  }

  // Member agent: resolve user_id via org_members, build action list.
  if (!agent.orgMemberId) {
    // Defensive: a member-typed agent without org_member_id is malformed;
    // surface as zero-action skipped agent rather than crash the route.
    return {
      kodi_agent_id: agent.id,
      openclaw_agent_id: agent.openclawAgentId,
      agent_type: 'member',
      user_id: agent.composioUserId ?? '',
      composio_session_id: null,
      actions: [],
    }
  }

  const member = await db.query.orgMembers.findFirst({
    where: eq(orgMembers.id, agent.orgMemberId),
  })
  if (!member) {
    return {
      kodi_agent_id: agent.id,
      openclaw_agent_id: agent.openclawAgentId,
      agent_type: 'member',
      user_id: agent.composioUserId ?? '',
      composio_session_id: null,
      actions: [],
    }
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

export function registerOpenClawAgentsRoutes(app: Hono): void {
  app.get('/api/openclaw/agents', async (c) => {
    const bearer = readBearerToken(c.req.header('authorization') ?? null)
    if (!bearer) return c.json({ error: 'Unauthorized' }, 401)

    const instance = await resolveInstanceByToken(bearer)
    if (!instance) return c.json({ error: 'Unauthorized' }, 401)

    const agents = await db
      .select()
      .from(openClawAgents)
      .where(eq(openClawAgents.orgId, instance.orgId))

    const entries: ReconcileAgentEntry[] = []
    for (const agent of agents) {
      // Skip deprovisioned rows — the plugin should not re-create them.
      if (agent.status === 'deprovisioned') continue
      entries.push(await buildReconcileEntry(agent, instance.orgId))
    }

    return c.json<ReconcileAgentsResponse>({ agents: entries })
  })
}
