import { TRPCError } from '@trpc/server'
import { subscriptions, eq } from '@kodi/db'
import { z } from 'zod'
import { router, memberProcedure, ownerProcedure } from '../../trpc'
import {
  getBillingStatus,
  ensureStripeCustomer,
  createCheckout,
  createPortal,
  updateSpendingCap,
} from './service'

export const billingRouter = router({
  getStatus: memberProcedure.query(async ({ ctx }) => {
    return getBillingStatus(ctx.db, ctx.org.id)
  }),

  createCheckoutSession: ownerProcedure
    .input(z.object({ planId: z.enum(['pro', 'business']), successPath: z.string().optional(), cancelPath: z.string().optional() }))
    .mutation(async ({ ctx, input }) => {
      const stripeCustomerId = await ensureStripeCustomer(
        ctx.db,
        ctx.org.id,
        ctx.org.stripeCustomerId,
      )

      const result = await createCheckout(
        ctx.db,
        ctx.org.id,
        stripeCustomerId,
        input.planId,
        input.successPath,
        input.cancelPath,
      )

      if (result.type === 'already_on_plan') {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'Already subscribed to this plan',
        })
      }
      if (result.type === 'error') {
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: result.message,
        })
      }

      return result
    }),

  createPortalSession: ownerProcedure.mutation(async ({ ctx }) => {
    if (!ctx.org.stripeCustomerId) {
      throw new TRPCError({
        code: 'NOT_FOUND',
        message: 'No billing account found for this organization',
      })
    }

    return createPortal(ctx.org.stripeCustomerId)
  }),

  updateSpendingCap: ownerProcedure
    .input(
      z.object({
        capCents: z.number().int().min(0).max(100000),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const sub = await ctx.db.query.subscriptions.findFirst({
        where: eq(subscriptions.orgId, ctx.org.id),
      })
      if (!sub) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'No subscription found. Subscribe to a plan first.',
        })
      }

      return updateSpendingCap(ctx.db, ctx.org.id, input.capCents)
    }),
})
