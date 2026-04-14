import { TRPCError } from '@trpc/server'
import {
  subscriptions,
  organizationSettings,
  organizations,
  instances,
  eq,
  decrypt,
  createLiteLLMClient,
  PLANS,
  MARKUP_FACTOR,
  toRealBudget,
  type PlanId,
} from '@kodi/db'
import { z } from 'zod'
import { router, memberProcedure, ownerProcedure } from '../../trpc'
import { getStripe } from '../../lib/stripe'
import { requireStripeBilling, requireLiteLLM, env } from '../../env'

export const billingRouter = router({
  getStatus: memberProcedure.query(async ({ ctx }) => {
    const sub = await ctx.db.query.subscriptions.findFirst({
      where: eq(subscriptions.orgId, ctx.org.id),
    })

    if (!sub) {
      return { subscription: null, usage: null }
    }

    const plan = PLANS[sub.planId as PlanId]

    const orgSettings = await ctx.db.query.organizationSettings.findFirst({
      where: eq(organizationSettings.orgId, ctx.org.id),
    })
    const spendingCapCents =
      orgSettings?.spendingCapCents ?? plan.defaultSpendingCapCents

    // Get current usage from LiteLLM
    let includedCreditsUsedCents = 0
    let overageCents = 0

    const inst = await ctx.db.query.instances.findFirst({
      where: eq(instances.orgId, ctx.org.id),
    })

    if (inst?.litellmVirtualKey) {
      try {
        const { LITELLM_PROXY_URL, LITELLM_MASTER_KEY } = requireLiteLLM()
        const litellm = createLiteLLMClient(
          LITELLM_PROXY_URL,
          LITELLM_MASTER_KEY,
        )
        const plainKey = decrypt(inst.litellmVirtualKey)
        const keyInfo = await litellm.getKeyInfo(plainKey)
        const markedUpSpendCents = Math.round(keyInfo.spend * 100 * MARKUP_FACTOR)
        includedCreditsUsedCents = Math.min(
          markedUpSpendCents,
          plan.includedCreditsCents,
        )
        overageCents = Math.max(0, markedUpSpendCents - plan.includedCreditsCents)
      } catch (e) {
        console.error('[billing.getStatus] Failed to fetch LiteLLM usage:', e)
      }
    }

    return {
      subscription: {
        status: sub.status,
        planId: sub.planId,
        planName: plan.name,
        monthlyPriceCents: plan.monthlyPriceCents,
        currentPeriodEnd: sub.currentPeriodEnd,
        cancelAtPeriodEnd: sub.cancelAtPeriodEnd,
      },
      usage: {
        includedCreditsUsedCents,
        includedCreditsTotalCents: plan.includedCreditsCents,
        overageCents,
        spendingCapCents,
      },
    }
  }),

  createCheckoutSession: ownerProcedure
    .input(z.object({ planId: z.enum(['pro', 'business']) }))
    .mutation(async ({ ctx, input }) => {
      const plan = PLANS[input.planId]
      const stripe = getStripe()
      const { STRIPE_USAGE_PRICE_ID } = requireStripeBilling()

      // Find or create Stripe Customer
      let stripeCustomerId = ctx.org.stripeCustomerId
      if (!stripeCustomerId) {
        const customer = await stripe.customers.create({
          metadata: { orgId: ctx.org.id },
        })
        stripeCustomerId = customer.id
        await ctx.db
          .update(organizations)
          .set({ stripeCustomerId })
          .where(eq(organizations.id, ctx.org.id))
      }

      // Check for existing active subscription — handle upgrade in-place
      const existingSub = await ctx.db.query.subscriptions.findFirst({
        where: eq(subscriptions.orgId, ctx.org.id),
      })

      if (existingSub?.status === 'active' && existingSub.stripeSubscriptionId) {
        // Upgrade/change plan via Stripe subscription update (no new checkout)
        if (existingSub.planId === input.planId) {
          throw new TRPCError({
            code: 'BAD_REQUEST',
            message: 'Already subscribed to this plan',
          })
        }

        const stripeSub = await stripe.subscriptions.retrieve(
          existingSub.stripeSubscriptionId,
        )
        // Find the flat-rate item (not the metered/usage-based one)
        const flatItem = stripeSub.items.data.find(
          (item) =>
            item.price.type === 'recurring' &&
            item.price.recurring?.usage_type !== 'metered',
        )
        if (!flatItem) {
          throw new TRPCError({
            code: 'INTERNAL_SERVER_ERROR',
            message: 'Could not find flat-rate subscription item',
          })
        }

        await stripe.subscriptions.update(existingSub.stripeSubscriptionId, {
          items: [{ id: flatItem.id, price: plan.stripePriceId }],
          proration_behavior: 'create_prorations',
          metadata: { orgId: ctx.org.id, planId: input.planId },
        })

        // Update our DB immediately (webhook will also fire, but this gives instant feedback)
        await ctx.db
          .update(subscriptions)
          .set({ planId: input.planId })
          .where(eq(subscriptions.id, existingSub.id))

        return { type: 'upgrade' as const, planId: input.planId }
      }

      // New subscription — create Stripe Checkout Session
      const session = await stripe.checkout.sessions.create({
        customer: stripeCustomerId,
        mode: 'subscription',
        line_items: [
          { price: plan.stripePriceId, quantity: 1 },
          { price: STRIPE_USAGE_PRICE_ID },
        ],
        metadata: { orgId: ctx.org.id, planId: input.planId },
        success_url: `${env.APP_URL}/settings/billing?success=true`,
        cancel_url: `${env.APP_URL}/settings/billing?canceled=true`,
      })

      return { type: 'checkout' as const, url: session.url }
    }),

  createPortalSession: ownerProcedure.mutation(async ({ ctx }) => {
    const stripe = getStripe()

    if (!ctx.org.stripeCustomerId) {
      throw new TRPCError({
        code: 'NOT_FOUND',
        message: 'No billing account found for this organization',
      })
    }

    const session = await stripe.billingPortal.sessions.create({
      customer: ctx.org.stripeCustomerId,
      return_url: `${env.APP_URL}/settings/billing`,
    })

    return { url: session.url }
  }),

  updateSpendingCap: ownerProcedure
    .input(
      z.object({
        capCents: z.number().int().min(0).max(100000),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      // Must have an active subscription
      const sub = await ctx.db.query.subscriptions.findFirst({
        where: eq(subscriptions.orgId, ctx.org.id),
      })
      if (!sub) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'No subscription found. Subscribe to a plan first.',
        })
      }

      // Upsert organization_settings
      const existing = await ctx.db.query.organizationSettings.findFirst({
        where: eq(organizationSettings.orgId, ctx.org.id),
      })
      if (existing) {
        await ctx.db
          .update(organizationSettings)
          .set({ spendingCapCents: input.capCents })
          .where(eq(organizationSettings.id, existing.id))
      } else {
        await ctx.db.insert(organizationSettings).values({
          orgId: ctx.org.id,
          spendingCapCents: input.capCents,
        })
      }

      // Update LiteLLM budget
      // NOTE: If capCents is 0, LiteLLM budget becomes $0 which blocks ALL usage
      // including included credits. This is the intended behavior for cap=0
      // ("freeze all usage"). To only block overage while allowing included credits,
      // the minimum cap should be set to plan.includedCreditsCents by the frontend.
      let litellmSynced = true
      const inst = await ctx.db.query.instances.findFirst({
        where: eq(instances.orgId, ctx.org.id),
      })
      if (inst?.litellmVirtualKey) {
        try {
          const { LITELLM_PROXY_URL, LITELLM_MASTER_KEY } = requireLiteLLM()
          const litellm = createLiteLLMClient(
            LITELLM_PROXY_URL,
            LITELLM_MASTER_KEY,
          )
          const plainKey = decrypt(inst.litellmVirtualKey)
          const newBudgetDollars = toRealBudget(input.capCents) / 100
          await litellm.updateKeyBudget(plainKey, newBudgetDollars)
        } catch (e) {
          console.error('[billing.updateSpendingCap] Failed to update LiteLLM budget:', e)
          litellmSynced = false
        }
      }

      return { success: true, spendingCapCents: input.capCents, litellmSynced }
    }),
})
