import { eq, sql } from 'drizzle-orm'
import { organizations, orgMembers } from '../schema'

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
      return
    }

    const existingOwnedOrg = await tx.query.organizations.findFirst({
      where: eq(organizations.ownerId, userId),
    })
    if (existingOwnedOrg) {
      await tx.insert(orgMembers).values({
        orgId: existingOwnedOrg.id,
        userId,
        role: 'owner',
      })
      return
    }

    const organizationId = crypto.randomUUID()

    await tx.insert(organizations).values({
      id: organizationId,
      name: PERSONAL_ORG_NAME,
      slug: buildPersonalOrgSlug(userId),
      ownerId: userId,
    })

    await tx.insert(orgMembers).values({
      orgId: organizationId,
      userId,
      role: 'owner',
    })
  })
}
