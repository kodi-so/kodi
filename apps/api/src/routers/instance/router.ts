import { TRPCError } from '@trpc/server'
import { eq } from 'drizzle-orm'
import { z } from 'zod'
import { instances } from '@kodi/db'
import { router, memberProcedure } from '../../trpc'
import { checkInstanceHealth } from './health'

export const instanceRouter = router({
  /**
   * Returns the current status of an org's instance.
   * Requires caller to be a member of the org (enforced by memberProcedure).
   */
  getStatus: memberProcedure
    .input(z.object({ orgId: z.string() }))
    .query(async ({ ctx, input }) => {
      const inst = await ctx.db.query.instances.findFirst({
        where: eq(instances.orgId, input.orgId),
      })
      if (!inst) return null

      return {
        id: inst.id,
        status: inst.status,
        hostname: inst.hostname,
        ipAddress: inst.ipAddress,
        errorMessage: inst.errorMessage,
        lastHealthCheck: inst.lastHealthCheck,
      }
    }),

  /**
   * Actively checks instance health and updates status.
   * Called by the frontend every 15s while status === 'installing'.
   * Idempotent — safe to call repeatedly.
   * Requires caller to be a member of the org (enforced by memberProcedure).
   */
  checkHealth: memberProcedure
    .input(z.object({ orgId: z.string(), instanceId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const inst = await ctx.db.query.instances.findFirst({
        where: eq(instances.id, input.instanceId),
      })
      if (!inst) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Instance not found' })
      }

      return checkInstanceHealth(inst)
    }),
})
