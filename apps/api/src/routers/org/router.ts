import { TRPCError } from '@trpc/server'
import { activityLog, and, asc, desc, ensurePersonalOrganizationForUser, eq, instances, orgMembers, organizations, user } from '@kodi/db'
import { z } from 'zod'
import { router, protectedProcedure, memberProcedure, ownerProcedure } from '../../trpc'
import { logActivity } from '../../lib/activity'
import { deprovisionInstance } from '../instance/provisioning'

async function listOrganizationsForUser(database: typeof import('@kodi/db').db, userId: string) {
  return database
    .select({
      orgId: organizations.id,
      orgName: organizations.name,
      orgSlug: organizations.slug,
      orgImage: organizations.image,
      orgStatus: organizations.status,
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
        orgImage: membership.orgImage,
        orgStatus: membership.orgStatus,
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
    .query(async ({ ctx }) => {
      // Join org_members with user table to get name + email
      const members = await ctx.db
        .select({
          id: orgMembers.id,
          userId: orgMembers.userId,
          role: orgMembers.role,
          joinedAt: orgMembers.createdAt,
          name: user.name,
          email: user.email,
          image: user.image,
        })
        .from(orgMembers)
        .innerJoin(user, eq(orgMembers.userId, user.id))
        .where(eq(orgMembers.orgId, ctx.org.id))
        .orderBy(desc(orgMembers.createdAt))

      return members
    }),

  /**
   * org.update — owner only, updates org name and/or image.
   */
  update: ownerProcedure
    .input(z.object({
      name: z.string().min(1).max(80).optional(),
      image: z.string().nullable().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const patch: Record<string, unknown> = {}
      if (input.name !== undefined) patch.name = input.name.trim()
      if (input.image !== undefined) patch.image = input.image
      if (Object.keys(patch).length === 0) return { success: true }
      await ctx.db
        .update(organizations)
        .set(patch)
        .where(and(eq(organizations.id, ctx.org.id), eq(organizations.ownerId, ctx.session!.user.id)))
      return { success: true }
    }),

  /**
   * org.create — creates a new organization owned by the caller.
   * The org starts in 'pending_billing' status until a subscription is confirmed.
   */
  create: protectedProcedure
    .input(z.object({ name: z.string().min(1).max(80) }))
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.session!.user.id
      const slug = `${input.name.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')}-${crypto.randomUUID().slice(0, 8)}`
      const [org] = await ctx.db
        .insert(organizations)
        .values({
          name: input.name.trim(),
          slug,
          ownerId: userId,
          status: 'pending_billing',
        })
        .returning()
      if (!org) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Failed to create organization' })

      // Add creator as owner member
      await ctx.db.insert(orgMembers).values({
        orgId: org.id,
        userId,
        role: 'owner',
      })

      return { orgId: org.id, orgSlug: org.slug, orgName: org.name }
    }),

  /**
   * org.delete — owner only, tears down all associated infrastructure and removes the org.
   * Cannot delete personal/only org.
   */
  delete: ownerProcedure
    .mutation(async ({ ctx }) => {
      const userId = ctx.session!.user.id
      const orgId = ctx.org.id

      // Prevent deleting the last org — user must always have at least one
      const allOrgs = await listOrganizationsForUser(ctx.db, userId)
      if (allOrgs.length <= 1) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'Cannot delete your only workspace' })
      }

      // Deprovision any active instance
      const inst = await ctx.db.query.instances.findFirst({
        where: eq(instances.orgId, orgId),
      })
      if (inst && inst.status !== 'deleted') {
        await deprovisionInstance(inst.id)
      }

      // TODO: cancel Stripe subscription when billing is implemented
      // await stripe.subscriptions.cancel(org.stripeSubscriptionId)

      // Delete the org — cascades to org_members, instances, etc.
      await ctx.db.delete(organizations).where(eq(organizations.id, orgId))

      return { success: true }
    }),

  /**
   * org.removeMember — owner only, removes a member from the org.
   * Owner cannot remove themselves.
   */
  removeMember: ownerProcedure
    .input(z.object({ userId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      // Prevent owner removing themselves
      if (input.userId === ctx.session!.user.id) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'Cannot remove yourself from the org' })
      }

      // Ensure the target user is actually a member
      const existing = await ctx.db.query.orgMembers.findFirst({
        where: and(eq(orgMembers.orgId, ctx.org.id), eq(orgMembers.userId, input.userId)),
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
        .where(and(eq(orgMembers.orgId, ctx.org.id), eq(orgMembers.userId, input.userId)))

      // Log activity
      await logActivity(
        ctx.db,
        ctx.org.id,
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
    .input(z.object({ limit: z.number().int().min(1).max(50).default(20) }))
    .query(async ({ ctx, input }) => {
      return ctx.db
        .select()
        .from(activityLog)
        .where(eq(activityLog.orgId, ctx.org.id))
        .orderBy(desc(activityLog.createdAt))
        .limit(input.limit)
    }),
})
