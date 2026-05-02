import { and, eq, sql } from 'drizzle-orm'
import { openClawAgents } from '../schema/work-items'
import type { OpenClawAgent } from '../schema/work-items'

type DatabaseLike = typeof import('../index').db
type OpenClawAgentExecutor = Pick<DatabaseLike, 'execute' | 'insert' | 'query'>
type OpenClawAgentDatabase = OpenClawAgentExecutor & {
  transaction?: DatabaseLike['transaction']
}

function buildOrgOpenClawAgentId(orgId: string) {
  return `kodi-agent-${orgId}`
}

function buildMemberOpenClawAgentId(orgMemberId: string) {
  return `kodi-member-agent-${orgMemberId}`
}

function buildMemberOpenClawAgentSlug(orgMemberId: string) {
  return `member-${orgMemberId}`
}

export async function ensureOrgOpenClawAgent(
  database: OpenClawAgentDatabase,
  input: {
    orgId: string
    status?: OpenClawAgent['status']
    metadata?: Record<string, unknown> | null
  }
) {
  return withOpenClawAgentTransaction(database, async (tx) => {
    await tx.execute(
      sql`select pg_advisory_xact_lock(hashtext(${`openclaw-agent:org:${input.orgId}`}))`
    )

    const existing = await tx.query.openClawAgents.findFirst({
      where: and(
        eq(openClawAgents.orgId, input.orgId),
        eq(openClawAgents.agentType, 'org')
      ),
    })

    if (existing) {
      return existing
    }

    const [agent] = await tx
      .insert(openClawAgents)
      .values({
        orgId: input.orgId,
        orgMemberId: null,
        agentType: 'org',
        openclawAgentId: buildOrgOpenClawAgentId(input.orgId),
        slug: 'kodi',
        displayName: 'Kodi',
        description:
          'Shared Kodi org agent for org-scoped memory and shared runtime work.',
        isDefault: true,
        status: input.status ?? 'provisioning',
        metadata: input.metadata ?? { source: 'org-lifecycle' },
      })
      .returning()

    if (!agent) {
      throw new Error('Failed to register org OpenClaw agent.')
    }

    return agent
  })
}

export async function ensureMemberOpenClawAgent(
  database: OpenClawAgentDatabase,
  input: {
    orgId: string
    orgMemberId: string
    displayName?: string | null
    status?: OpenClawAgent['status']
    metadata?: Record<string, unknown> | null
  }
) {
  return withOpenClawAgentTransaction(database, async (tx) => {
    await tx.execute(
      sql`select pg_advisory_xact_lock(hashtext(${`openclaw-agent:member:${input.orgMemberId}`}))`
    )

    const existing = await tx.query.openClawAgents.findFirst({
      where: and(
        eq(openClawAgents.orgId, input.orgId),
        eq(openClawAgents.orgMemberId, input.orgMemberId)
      ),
    })

    if (existing) {
      return existing
    }

    const [agent] = await tx
      .insert(openClawAgents)
      .values({
        orgId: input.orgId,
        orgMemberId: input.orgMemberId,
        agentType: 'member',
        openclawAgentId: buildMemberOpenClawAgentId(input.orgMemberId),
        slug: buildMemberOpenClawAgentSlug(input.orgMemberId),
        displayName: input.displayName?.trim() || 'Kodi Member',
        description:
          'Kodi member agent for private runtime work and member-scoped memory.',
        isDefault: false,
        status: input.status ?? 'provisioning',
        metadata: input.metadata ?? { source: 'member-lifecycle' },
      })
      .returning()

    if (!agent) {
      throw new Error('Failed to register member OpenClaw agent.')
    }

    return agent
  })
}

export {
  buildMemberOpenClawAgentId,
  buildMemberOpenClawAgentSlug,
  buildOrgOpenClawAgentId,
}

async function withOpenClawAgentTransaction<T>(
  database: OpenClawAgentDatabase,
  callback: (executor: OpenClawAgentExecutor) => Promise<T>
) {
  if (database.transaction) {
    return database.transaction((tx) =>
      callback(tx as OpenClawAgentExecutor)
    )
  }

  return callback(database)
}
