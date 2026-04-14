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
import { getStripe } from '../../lib/stripe'
import { requireStripeBilling, requireLiteLLM, env } from '../../env'

type Db = typeof import('@kodi/db').db

function getLiteLLM() {
  const { LITELLM_PROXY_URL, LITELLM_MASTER_KEY } = requireLiteLLM()
  return createLiteLLMClient(LITELLM_PROXY_URL, LITELLM_MASTER_KEY)
}

export async function getBillingStatus(db: Db, orgId: string) {
  const sub = await db.query.subscriptions.findFirst({
    where: eq(subscriptions.orgId, orgId),
  })

  if (!sub) {
    return { subscription: null, usage: null }
  }

  const plan = PLANS[sub.planId as PlanId]

  const orgSettings = await db.query.organizationSettings.findFirst({
    where: eq(organizationSettings.orgId, orgId),
  })
  const spendingCapCents =
    orgSettings?.spendingCapCents ?? plan.defaultSpendingCapCents

  let includedCreditsUsedCents = 0
  let overageCents = 0

  const inst = await db.query.instances.findFirst({
    where: eq(instances.orgId, orgId),
  })

  if (inst?.litellmVirtualKey) {
    try {
      const litellm = getLiteLLM()
      const plainKey = decrypt(inst.litellmVirtualKey)
      const keyInfo = await litellm.getKeyInfo(plainKey)
      const markedUpSpendCents = Math.round(
        keyInfo.spend * 100 * MARKUP_FACTOR,
      )
      includedCreditsUsedCents = Math.min(
        markedUpSpendCents,
        plan.includedCreditsCents,
      )
      overageCents = Math.max(
        0,
        markedUpSpendCents - plan.includedCreditsCents,
      )
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
}

export async function ensureStripeCustomer(
  db: Db,
  orgId: string,
  existingCustomerId: string | null,
) {
  if (existingCustomerId) return existingCustomerId

  const stripe = getStripe()
  const customer = await stripe.customers.create({
    metadata: { orgId },
  })
  await db
    .update(organizations)
    .set({ stripeCustomerId: customer.id })
    .where(eq(organizations.id, orgId))
  return customer.id
}

export async function createCheckout(
  db: Db,
  orgId: string,
  stripeCustomerId: string,
  planId: PlanId,
) {
  const plan = PLANS[planId]
  const stripe = getStripe()
  const { STRIPE_USAGE_PRICE_ID } = requireStripeBilling()

  // Check for existing active subscription — handle upgrade in-place
  const existingSub = await db.query.subscriptions.findFirst({
    where: eq(subscriptions.orgId, orgId),
  })

  if (existingSub?.status === 'active' && existingSub.stripeSubscriptionId) {
    if (existingSub.planId === planId) {
      return { type: 'already_on_plan' as const }
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
      return { type: 'error' as const, message: 'Could not find flat-rate subscription item' }
    }

    await stripe.subscriptions.update(existingSub.stripeSubscriptionId, {
      items: [{ id: flatItem.id, price: plan.stripePriceId }],
      proration_behavior: 'create_prorations',
      metadata: { orgId, planId },
    })

    await db
      .update(subscriptions)
      .set({ planId })
      .where(eq(subscriptions.id, existingSub.id))

    return { type: 'upgrade' as const, planId }
  }

  // New subscription — create Stripe Checkout Session
  const session = await stripe.checkout.sessions.create({
    customer: stripeCustomerId,
    mode: 'subscription',
    line_items: [
      { price: plan.stripePriceId, quantity: 1 },
      { price: STRIPE_USAGE_PRICE_ID },
    ],
    metadata: { orgId, planId },
    success_url: `${env.APP_URL}/settings/billing?success=true`,
    cancel_url: `${env.APP_URL}/settings/billing?canceled=true`,
  })

  return { type: 'checkout' as const, url: session.url }
}

export async function createPortal(stripeCustomerId: string) {
  const stripe = getStripe()
  const session = await stripe.billingPortal.sessions.create({
    customer: stripeCustomerId,
    return_url: `${env.APP_URL}/settings/billing`,
  })
  return { url: session.url }
}

export async function updateSpendingCap(
  db: Db,
  orgId: string,
  capCents: number,
) {
  // Upsert organization_settings
  const existing = await db.query.organizationSettings.findFirst({
    where: eq(organizationSettings.orgId, orgId),
  })
  if (existing) {
    await db
      .update(organizationSettings)
      .set({ spendingCapCents: capCents })
      .where(eq(organizationSettings.id, existing.id))
  } else {
    await db.insert(organizationSettings).values({
      orgId,
      spendingCapCents: capCents,
    })
  }

  // Update LiteLLM budget
  // NOTE: If capCents is 0, LiteLLM budget becomes $0 which blocks ALL usage
  // including included credits. This is the intended behavior for cap=0
  // ("freeze all usage"). To only block overage while allowing included credits,
  // the minimum cap should be set to plan.includedCreditsCents by the frontend.
  let litellmSynced = true
  const inst = await db.query.instances.findFirst({
    where: eq(instances.orgId, orgId),
  })
  if (inst?.litellmVirtualKey) {
    try {
      const litellm = getLiteLLM()
      const plainKey = decrypt(inst.litellmVirtualKey)
      const newBudgetDollars = toRealBudget(capCents) / 100
      await litellm.updateKeyBudget(plainKey, newBudgetDollars)
    } catch (e) {
      console.error(
        '[billing.updateSpendingCap] Failed to update LiteLLM budget:',
        e,
      )
      litellmSynced = false
    }
  }

  return { success: true, spendingCapCents: capCents, litellmSynced }
}
