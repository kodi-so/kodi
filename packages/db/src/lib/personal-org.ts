import { eq, sql } from 'drizzle-orm'
import { organizations, orgMembers } from '../schema'
import { ensureMemberOpenClawAgent } from './openclaw-agent-registry'

const PERSONAL_ORG_NAME = 'Personal'

function toSlugPart(value: string) {
  const slugPart = value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')

  return slugPart || 'user'
}

function buildPersonalOrgSlug(userId: string) {
  return `personal-${toSlugPart(userId)}`
}

export async function ensurePersonalOrganizationForUser(
  database: typeof import('../index').db,
  userId: string,
) {
  await database.transaction(async tx => {
    // Serialize per-user org provisioning so signup and first-load backfills do not race.
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`personal-org:${userId}`}))`)

    const existingMembership = await tx.query.orgMembers.findFirst({
      where: eq(orgMembers.userId, userId),
    })
    if (existingMembership) {
      await ensureMemberOpenClawAgent(tx, {
        orgId: existingMembership.orgId,
        orgMemberId: existingMembership.id,
        displayName:
          existingMembership.role === 'owner' ? 'Kodi Owner' : 'Kodi Member',
        metadata: {
          source: 'personal-org-membership-backfill',
          role: existingMembership.role,
        },
      })
      return
    }

    const existingOwnedOrg = await tx.query.organizations.findFirst({
      where: eq(organizations.ownerId, userId),
    })
    if (existingOwnedOrg) {
      const [member] = await tx.insert(orgMembers).values({
        orgId: existingOwnedOrg.id,
        userId,
        role: 'owner',
      }).returning()

      if (member) {
        await ensureMemberOpenClawAgent(tx, {
          orgId: existingOwnedOrg.id,
          orgMemberId: member.id,
          displayName: 'Kodi Owner',
          metadata: { source: 'personal-org-backfill', role: 'owner' },
        })
      }
      return
    }

    const organizationId = crypto.randomUUID()

    await tx.insert(organizations).values({
      id: organizationId,
      name: PERSONAL_ORG_NAME,
      slug: buildPersonalOrgSlug(userId),
      ownerId: userId,
    })

    const [member] = await tx.insert(orgMembers).values({
      orgId: organizationId,
      userId,
      role: 'owner',
    }).returning()

    if (member) {
      await ensureMemberOpenClawAgent(tx, {
        orgId: organizationId,
        orgMemberId: member.id,
        displayName: 'Kodi Owner',
        metadata: { source: 'personal-org-bootstrap', role: 'owner' },
      })
    }
  })
}
