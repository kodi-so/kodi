import { TRPCError } from '@trpc/server'
import { eq } from 'drizzle-orm'
import { orgMembers } from '@kodi/db'
import { router, protectedProcedure } from '../../trpc'

export const orgRouter = router({
  /**
   * org.getMyCurrent — returns the logged-in user's current org + role.
   * The app shell calls this once on mount to populate role-gated UI.
   * Returns null if the user has no org membership yet.
   */
  getMyCurrent: protectedProcedure.query(async ({ ctx }) => {
    if (!ctx.session?.user?.id) {
      throw new TRPCError({ code: 'UNAUTHORIZED' })
    }

    const membership = await ctx.db.query.orgMembers.findFirst({
      where: eq(orgMembers.userId, ctx.session.user.id),
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
})
