import { TRPCError } from '@trpc/server'
import { eq, and, desc } from 'drizzle-orm'
import { orgMembers, organizations, user, activityLog } from '@kodi/db'
import { z } from 'zod'
import { router, protectedProcedure, memberProcedure, ownerProcedure } from '../../trpc'
import { logActivity } from '../../lib/activity'

export const orgRouter = router({
  /**
   * org.getMyCurrent — returns the logged-in user's current org + role.
   * Accepts an optional orgId to return a specific org (verifying membership).
   * Falls back to the user's first membership if no orgId provided.
   * Returns null if the user has no org membership yet.
   */
  getMyCurrent: protectedProcedure
    .input(z.object({ orgId: z.string().optional() }).optional())
    .query(async ({ ctx, input }) => {
      const userId = ctx.session!.user.id

      if (input?.orgId) {
        const membership = await ctx.db.query.orgMembers.findFirst({
          where: and(eq(orgMembers.userId, userId), eq(orgMembers.orgId, input.orgId)),
          with: { org: true },
        })
        if (!membership) return null
        return {
          orgId: membership.orgId,
          orgName: membership.org.name,
          orgSlug: membership.org.slug,
          role: membership.role,
        }
      }

      const membership = await ctx.db.query.orgMembers.findFirst({
        where: eq(orgMembers.userId, userId),
        with: { org: true },
      })

      if (!membership) return null

      return {
        orgId: membership.orgId,
        orgName: membership.org.name,
        orgSlug: membership.org.slug,
        role: membership.role,
      }
    }),

  /**
   * org.getMyOrgs — returns all orgs the user belongs to (for org switcher).
   */
  getMyOrgs: protectedProcedure.query(async ({ ctx }) => {
    const memberships = await ctx.db.query.orgMembers.findMany({
      where: eq(orgMembers.userId, ctx.session!.user.id),
      with: { org: true },
    })
    return memberships.map(m => ({
      orgId: m.orgId,
      orgName: m.org.name,
      orgSlug: m.org.slug,
      role: m.role,
    }))
  }),

  /**
   * org.ensurePersonal — idempotent.
   * Creates a personal org for the user if they don't have one yet.
   * Called from the onboarding page immediately after signup.
   */
  ensurePersonal: protectedProcedure.mutation(async ({ ctx }) => {
    const userId = ctx.session!.user.id
    const userName = ctx.session!.user.name ?? ctx.session!.user.email ?? 'User'

    // Already has at least one org — return the first one (their personal org)
    const existing = await ctx.db.query.orgMembers.findFirst({
      where: and(eq(orgMembers.userId, userId), eq(orgMembers.role, 'owner')),
      with: { org: true },
    })
    if (existing) return { orgId: existing.orgId, orgSlug: existing.org.slug }

    // Create a personal org
    const orgId = crypto.randomUUID()
    const baseSlug = userName
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 30) || 'personal'
    const slug = `${baseSlug}-${orgId.slice(0, 6)}`

    await ctx.db.insert(organizations).values({
      id: orgId,
      name: `${userName}'s Workspace`,
      slug,
      ownerId: userId,
    })
    await ctx.db.insert(orgMembers).values({
      orgId,
      userId,
      role: 'owner',
    })

    return { orgId, orgSlug: slug }
  }),

  /**
   * org.getMembers — returns the list of members in an org with user info.
   * Requires the caller to be a member of the org (any role).
   */
  getMembers: memberProcedure
    .input(z.object({ orgId: z.string() }))
    .query(async ({ ctx, input }) => {
      // Join org_members with user table to get name + email
      const members = await ctx.db
        .select({
          id: orgMembers.id,
          userId: orgMembers.userId,
          role: orgMembers.role,
          joinedAt: orgMembers.createdAt,
          name: user.name,
          email: user.email,
        })
        .from(orgMembers)
        .innerJoin(user, eq(orgMembers.userId, user.id))
        .where(eq(orgMembers.orgId, input.orgId))

      return members
    }),

  /**
   * org.removeMember — owner only, removes a member from the org.
   * Owner cannot remove themselves.
   */
  removeMember: ownerProcedure
    .input(z.object({ orgId: z.string(), userId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      // Prevent owner removing themselves
      if (input.userId === ctx.session!.user.id) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'Cannot remove yourself from the org' })
      }

      // Ensure the target user is actually a member
      const existing = await ctx.db.query.orgMembers.findFirst({
        where: and(eq(orgMembers.orgId, input.orgId), eq(orgMembers.userId, input.userId)),
      })
      if (!existing) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Member not found in this org' })
      }

      // Fetch user info before deletion for the activity log
      const removedUser = await ctx.db.query.user.findFirst({
        where: eq(user.id, input.userId),
      })

      await ctx.db
        .delete(orgMembers)
        .where(and(eq(orgMembers.orgId, input.orgId), eq(orgMembers.userId, input.userId)))

      // Log activity
      await logActivity(
        ctx.db,
        input.orgId,
        'member.removed',
        { userId: input.userId, name: removedUser?.name ?? removedUser?.email ?? 'Unknown' },
        ctx.session!.user.id,
      )

      return { success: true }
    }),

  /**
   * org.getActivity — member procedure, returns activity log newest-first.
   * Scoped to the caller's org via memberProcedure RBAC.
   */
  getActivity: memberProcedure
    .input(z.object({ orgId: z.string(), limit: z.number().int().min(1).max(50).default(20) }))
    .query(async ({ ctx, input }) => {
      return ctx.db
        .select()
        .from(activityLog)
        .where(eq(activityLog.orgId, input.orgId))
        .orderBy(desc(activityLog.createdAt))
        .limit(input.limit)
    }),
})
