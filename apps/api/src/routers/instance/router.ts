import { TRPCError } from '@trpc/server'
import { z } from 'zod'
import { eq, instances, subscriptions } from '@kodi/db'
import { router, memberProcedure, ownerProcedure } from '../../trpc'
import { checkInstanceHealth } from './health'
import { provisionInstance, deprovisionInstance } from './provisioning'

async function requireActiveSubscription(
  db: typeof import('@kodi/db').db,
  orgId: string,
) {
  const sub = await db.query.subscriptions.findFirst({
    where: eq(subscriptions.orgId, orgId),
  })
  if (!sub || sub.status !== 'active') {
    throw new TRPCError({
      code: 'FORBIDDEN',
      message: 'An active subscription is required. Please subscribe to a plan first.',
    })
  }
  return sub
}

export const instanceRouter = router({
  /**
   * Returns the current status of an org's instance.
   * Requires caller to be a member of the org (enforced by memberProcedure).
   */
  getStatus: memberProcedure
    .query(async ({ ctx }) => {
      const inst = await ctx.db.query.instances.findFirst({
        where: eq(instances.orgId, ctx.org.id),
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
   */
  checkHealth: memberProcedure
    .input(z.object({ instanceId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const inst = await ctx.db.query.instances.findFirst({
        where: eq(instances.id, input.instanceId),
      })
      if (!inst || inst.orgId !== ctx.org.id) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Instance not found' })
      }

      return checkInstanceHealth(inst)
    }),

  /**
   * Provision a new OpenClaw instance for the org.
   * Owner-only — only org owners can trigger provisioning.
   * Returns the new instance record.
   */
  provision: ownerProcedure
    .mutation(async ({ ctx }) => {
      await requireActiveSubscription(ctx.db, ctx.org.id)

      // Check if org already has an instance
      const existing = await ctx.db.query.instances.findFirst({
        where: eq(instances.orgId, ctx.org.id),
      })
      if (existing && existing.status !== 'deleted') {
        throw new TRPCError({
          code: 'CONFLICT',
          message: 'This organization already has an instance',
        })
      }

      const inst = await provisionInstance(ctx.org.id)
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
   * Retry provisioning for an instance in error state.
   * Resets the instance to 'installing' so health check polling picks it up.
   */
  retryProvision: ownerProcedure
    .input(z.object({ instanceId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      await requireActiveSubscription(ctx.db, ctx.org.id)

      const inst = await ctx.db.query.instances.findFirst({
        where: eq(instances.id, input.instanceId),
      })
      if (!inst || inst.orgId !== ctx.org.id) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Instance not found' })
      }
      if (inst.status !== 'error') {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'Can only retry instances in error state' })
      }

      await ctx.db
        .update(instances)
        .set({ status: 'installing', errorMessage: null, lastHealthCheck: null })
        .where(eq(instances.id, input.instanceId))

      return {
        id: inst.id,
        status: 'installing' as const,
        hostname: inst.hostname,
        ipAddress: inst.ipAddress,
        errorMessage: null,
        lastHealthCheck: null,
      }
    }),

  /**
   * Deprovision an instance — tears down DNS, LiteLLM, and EC2.
   * Owner-only.
   */
  deprovision: ownerProcedure
    .input(z.object({ instanceId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      await requireActiveSubscription(ctx.db, ctx.org.id)

      const inst = await ctx.db.query.instances.findFirst({
        where: eq(instances.id, input.instanceId),
      })
      if (!inst || inst.orgId !== ctx.org.id) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Instance not found' })
      }

      await deprovisionInstance(input.instanceId)
      return { status: 'deleted' as const }
    }),
})
