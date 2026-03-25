import { TRPCError } from '@trpc/server'
import { eq } from 'drizzle-orm'
import { z } from 'zod'
import { instances } from '@kodi/db'
import { router, protectedProcedure } from '../trpc'
import { checkCloudInitComplete } from '../services/ssh'

const INSTALL_TIMEOUT_MS = 10 * 60 * 1000 // 10 minutes

export const instanceRouter = router({
  /**
   * Returns the current status of an org's instance.
   */
  getStatus: protectedProcedure
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
   * Actively polls an instance and updates its status.
   * Called by frontend every 15s while status === 'installing'.
   * Idempotent — safe to call repeatedly.
   */
  checkHealth: protectedProcedure
    .input(z.object({ instanceId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const inst = await ctx.db.query.instances.findFirst({
        where: eq(instances.id, input.instanceId),
      })

      if (!inst) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Instance not found',
        })
      }

      console.log(`[health] Checking instance=${inst.id} status=${inst.status}`)

      // No-op if not installing
      if (inst.status !== 'installing') {
        return {
          status: inst.status,
          hostname: inst.hostname,
          errorMessage: inst.errorMessage,
        }
      }

      // Check for install timeout first
      const elapsed = Date.now() - inst.createdAt.getTime()
      console.log(`[health] Elapsed: ${Math.round(elapsed / 1000)}s / ${INSTALL_TIMEOUT_MS / 1000}s`)

      if (elapsed > INSTALL_TIMEOUT_MS) {
        console.warn(`[health] Install TIMED OUT for instance=${inst.id}`)
        await ctx.db
          .update(instances)
          .set({
            status: 'error',
            errorMessage: 'Provisioning timed out',
            lastHealthCheck: new Date(),
          })
          .where(eq(instances.id, inst.id))

        return {
          status: 'error' as const,
          hostname: inst.hostname,
          errorMessage: 'Provisioning timed out',
        }
      }

      // Step 1: SSH cloud-init check
      const sshUser = inst.sshUser ?? 'ubuntu'
      let cloudInitDone = false

      if (inst.ipAddress) {
        console.log(`[health] SSH cloud-init check: ${inst.ipAddress}`)
        cloudInitDone = await checkCloudInitComplete(inst.ipAddress, sshUser)
        console.log(`[health] Cloud-init complete: ${cloudInitDone}`)
      } else {
        console.log(`[health] No IP address yet, skipping SSH check`)
      }

      // Step 2: HTTP health check (only if cloud-init is done)
      let httpHealthy = false
      if (cloudInitDone && inst.hostname) {
        try {
          const controller = new AbortController()
          const timeout = setTimeout(() => controller.abort(), 5000)
          const resp = await fetch(`https://${inst.hostname}/health`, {
            method: 'GET',
            signal: controller.signal,
          })
          clearTimeout(timeout)
          httpHealthy = resp.ok
          console.log(`[health] HTTP health: ${resp.status} healthy=${httpHealthy}`)
        } catch (e) {
          console.log(`[health] HTTP health check failed: ${e instanceof Error ? e.message : 'unknown'}`)
        }
      }

      // Update status based on health checks
      let newStatus = inst.status
      if (cloudInitDone && httpHealthy) {
        newStatus = 'running'
        console.log(`[health] Instance is RUNNING: ${inst.id}`)
      }

      await ctx.db
        .update(instances)
        .set({
          status: newStatus,
          lastHealthCheck: new Date(),
        })
        .where(eq(instances.id, inst.id))

      return {
        status: newStatus,
        hostname: inst.hostname,
        errorMessage: inst.errorMessage,
      }
    }),
})
