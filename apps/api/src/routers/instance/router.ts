import { TRPCError } from '@trpc/server'
import { eq } from 'drizzle-orm'
import { z } from 'zod'
import { instances } from '@kodi/db'
import { router, memberProcedure, ownerProcedure } from '../../trpc'
import { checkInstanceHealth } from './health'
import { provisionInstance, deprovisionInstance } from './provisioning'

export const instanceRouter = router({
  /**
   * Returns the current status of an org's instance.
   * Requires caller to be a member of the org (enforced by memberProcedure).
   */
  getStatus: memberProcedure
    .input(z.object({ orgId: z.string() }))
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
    .input(z.object({ orgId: z.string(), instanceId: z.string() }))
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
    .input(z.object({ orgId: z.string() }))
    .mutation(async ({ ctx }) => {
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
    .input(z.object({ orgId: z.string(), instanceId: z.string() }))
    .mutation(async ({ ctx, input }) => {
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
    .input(z.object({ orgId: z.string(), instanceId: z.string() }))
    .mutation(async ({ ctx, input }) => {
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
