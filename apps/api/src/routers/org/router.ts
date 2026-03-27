import { TRPCError } from '@trpc/server'
import { eq, and, desc, asc } from 'drizzle-orm'
import { ensurePersonalOrganizationForUser, orgMembers, organizations, user, activityLog } from '@kodi/db'
import { z } from 'zod'
import { router, protectedProcedure, memberProcedure, ownerProcedure } from '../../trpc'
import { logActivity } from '../../lib/activity'

async function listOrganizationsForUser(database: typeof import('@kodi/db').db, userId: string) {
  return database
    .select({
      orgId: organizations.id,
      orgName: organizations.name,
      orgSlug: organizations.slug,
      role: orgMembers.role,
      joinedAt: orgMembers.createdAt,
    })
    .from(orgMembers)
    .innerJoin(organizations, eq(orgMembers.orgId, organizations.id))
    .where(eq(orgMembers.userId, userId))
    .orderBy(asc(orgMembers.createdAt), asc(organizations.createdAt))
}

export const orgRouter = router({
  listMine: protectedProcedure.query(async ({ ctx }) => {
    if (!ctx.session?.user?.id) {
      throw new TRPCError({ code: 'UNAUTHORIZED' })
    }

    await ensurePersonalOrganizationForUser(ctx.db, ctx.session.user.id)

    return listOrganizationsForUser(ctx.db, ctx.session.user.id)
  }),

  /**
   * org.getMyCurrent — returns the logged-in user's current org + role.
   * Ensures a personal org exists, then returns the first membership.
   * Returns null if the user has no org membership yet.
   */
  getMyCurrent: protectedProcedure
    .input(z.object({ orgId: z.string().optional() }).optional())
    .query(async ({ ctx }) => {
      await ensurePersonalOrganizationForUser(ctx.db, ctx.session!.user.id)

      const [membership] = await listOrganizationsForUser(ctx.db, ctx.session!.user.id)
      if (!membership) return null

      return {
        orgId: membership.orgId,
        orgName: membership.orgName,
        orgSlug: membership.orgSlug,
        role: membership.role,
      }
    }),

  /**
   * org.ensurePersonal — idempotent.
   * Creates a personal org for the user if they don't have one yet.
   * Called from the onboarding page immediately after signup.
   */
  ensurePersonal: protectedProcedure.mutation(async ({ ctx }) => {
    const userId = ctx.session!.user.id
    const result = await ensurePersonalOrganizationForUser(ctx.db, userId)
    const orgs = await listOrganizationsForUser(ctx.db, userId)
    const first = orgs[0]
    if (!first) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Failed to create personal org' })
    return { orgId: first.orgId, orgSlug: first.orgSlug }
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
   * org.update — owner only, updates org name (and optionally slug).
   */
  update: ownerProcedure
    .input(z.object({ orgId: z.string(), name: z.string().min(1).max(80) }))
    .mutation(async ({ ctx, input }) => {
      await ctx.db
        .update(organizations)
        .set({ name: input.name.trim() })
        .where(and(eq(organizations.id, input.orgId), eq(organizations.ownerId, ctx.session!.user.id)))
      return { success: true }
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
