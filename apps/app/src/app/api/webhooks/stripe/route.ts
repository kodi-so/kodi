import { stripe } from '@/lib/stripe'
import {
  db,
  subscriptions,
  organizations,
  organizationSettings,
  instances,
  decrypt,
  createLiteLLMClient,
  PLANS,
  type PlanId,
} from '@kodi/db'
import { eq } from 'drizzle-orm'
import { headers } from 'next/headers'
import type { NextRequest } from 'next/server'
import type Stripe from 'stripe'

function getLiteLLM() {
  const baseUrl = process.env.LITELLM_PROXY_URL
  const masterKey = process.env.LITELLM_MASTER_KEY
  if (!baseUrl || !masterKey) {
    throw new Error('LITELLM_PROXY_URL and LITELLM_MASTER_KEY must be set')
  }
  return createLiteLLMClient(baseUrl, masterKey)
}

export async function POST(req: NextRequest) {
  const body = await req.text()
  const signature = headers().get('stripe-signature')!

  let event: Stripe.Event

  try {
    event = stripe.webhooks.constructEvent(
      body,
      signature,
      process.env.STRIPE_WEBHOOK_SECRET!,
    )
  } catch (err) {
    return new Response('Webhook signature verification failed', { status: 400 })
  }

  try {
    switch (event.type) {
      case 'checkout.session.completed':
        await handleCheckoutCompleted(
          event.data.object as Stripe.Checkout.Session,
        )
        break
      case 'customer.subscription.updated':
        await handleSubscriptionUpdated(
          event.data.object as Stripe.Subscription,
        )
        break
      case 'customer.subscription.deleted':
        await handleSubscriptionDeleted(
          event.data.object as Stripe.Subscription,
        )
        break
      case 'invoice.payment_succeeded':
        await handlePaymentSucceeded(event.data.object as Stripe.Invoice)
        break
      case 'invoice.payment_failed':
        await handlePaymentFailed(event.data.object as Stripe.Invoice)
        break
      default:
        break
    }
  } catch (err) {
    console.error(`[stripe-webhook] Error handling ${event.type}:`, err)
    return new Response('Webhook handler error', { status: 500 })
  }

  return new Response(JSON.stringify({ received: true }), {
    headers: { 'Content-Type': 'application/json' },
  })
}

async function handleCheckoutCompleted(session: Stripe.Checkout.Session) {
  const orgId = session.metadata?.orgId
  const planId = (session.metadata?.planId ?? 'pro') as PlanId
  if (!orgId || !session.subscription || !session.customer) return

  const stripeSubscriptionId =
    typeof session.subscription === 'string'
      ? session.subscription
      : session.subscription.id
  const stripeCustomerId =
    typeof session.customer === 'string'
      ? session.customer
      : session.customer.id

  // 1. Store Stripe customer ID on org
  await db
    .update(organizations)
    .set({ stripeCustomerId })
    .where(eq(organizations.id, orgId))

  // 2. Get subscription period from Stripe
  const stripeSub = await stripe.subscriptions.retrieve(stripeSubscriptionId)
  const periodStart = new Date(stripeSub.current_period_start * 1000)
  const periodEnd = new Date(stripeSub.current_period_end * 1000)

  // 3. Upsert subscription in DB
  const existing = await db.query.subscriptions.findFirst({
    where: eq(subscriptions.orgId, orgId),
  })

  const plan = PLANS[planId]
  const subData = {
    stripeCustomerId,
    stripeSubscriptionId,
    planId,
    status: 'active' as const,
    currentPeriodStart: periodStart,
    currentPeriodEnd: periodEnd,
    cancelAtPeriodEnd: false,
  }

  if (existing) {
    await db
      .update(subscriptions)
      .set(subData)
      .where(eq(subscriptions.id, existing.id))
  } else {
    await db.insert(subscriptions).values({ orgId, ...subData })
  }

  // 4. Upsert organization_settings with plan defaults (if not exists)
  const existingSettings = await db.query.organizationSettings.findFirst({
    where: eq(organizationSettings.orgId, orgId),
  })
  if (!existingSettings) {
    await db.insert(organizationSettings).values({
      orgId,
      spendingCapCents: plan.defaultSpendingCapCents,
    })
  }

  // 5. Set LiteLLM budget for the org's instance
  const inst = await db.query.instances.findFirst({
    where: eq(instances.orgId, orgId),
  })
  if (inst?.litellmVirtualKey) {
    try {
      const litellm = getLiteLLM()
      const plainKey = decrypt(inst.litellmVirtualKey)
      await litellm.updateKeyBudget(
        plainKey,
        plan.includedCreditsRealCents / 100,
      )
    } catch (e) {
      console.error('[stripe-webhook] Failed to set LiteLLM budget:', e)
    }
  }
}

async function handleSubscriptionUpdated(stripeSub: Stripe.Subscription) {
  const sub = await db.query.subscriptions.findFirst({
    where: eq(subscriptions.stripeSubscriptionId, stripeSub.id),
  })
  if (!sub) return

  // Detect plan change by comparing price IDs
  const flatPriceId = stripeSub.items.data.find(
    (item) =>
      item.price.type === 'recurring' &&
      item.price.recurring?.usage_type !== 'metered',
  )?.price.id

  let newPlanId: PlanId | undefined
  if (flatPriceId) {
    const matchedPlan = Object.entries(PLANS).find(
      ([, plan]) => plan.stripePriceId === flatPriceId,
    )
    if (matchedPlan && matchedPlan[0] !== sub.planId) {
      newPlanId = matchedPlan[0] as PlanId
    }
  }

  const updateData: Partial<typeof subscriptions.$inferInsert> = {
    status:
      stripeSub.status === 'active'
        ? 'active'
        : stripeSub.status === 'past_due'
          ? 'past_due'
          : sub.status,
    cancelAtPeriodEnd: stripeSub.cancel_at_period_end,
    currentPeriodStart: new Date(stripeSub.current_period_start * 1000),
    currentPeriodEnd: new Date(stripeSub.current_period_end * 1000),
  }

  // If plan changed, update planId and adjust LiteLLM budget
  if (newPlanId) {
    updateData.planId = newPlanId
    const newPlan = PLANS[newPlanId]

    const inst = await db.query.instances.findFirst({
      where: eq(instances.orgId, sub.orgId),
    })
    if (inst?.litellmVirtualKey) {
      try {
        const litellm = getLiteLLM()
        const plainKey = decrypt(inst.litellmVirtualKey)
        const keyInfo = await litellm.getKeyInfo(plainKey)
        // Give fresh included credits on top of current spend
        const newBudget =
          keyInfo.spend + newPlan.includedCreditsRealCents / 100
        await litellm.updateKeyBudget(plainKey, newBudget)
      } catch (e) {
        console.error(
          '[stripe-webhook] Failed to update LiteLLM budget on plan change:',
          e,
        )
      }
    }
  }

  await db
    .update(subscriptions)
    .set(updateData)
    .where(eq(subscriptions.id, sub.id))
}

async function handleSubscriptionDeleted(stripeSub: Stripe.Subscription) {
  const sub = await db.query.subscriptions.findFirst({
    where: eq(subscriptions.stripeSubscriptionId, stripeSub.id),
  })
  if (!sub) return

  await db
    .update(subscriptions)
    .set({ status: 'canceled' })
    .where(eq(subscriptions.id, sub.id))

  // NOTE: Instance deprovisioning on cancellation is a future ticket.
  // NOTE: organization_settings is NOT deleted — spending cap survives cancellation.
}

async function handlePaymentSucceeded(invoice: Stripe.Invoice) {
  const stripeSubscriptionId = getSubscriptionIdFromInvoice(invoice)
  if (!stripeSubscriptionId) return

  const periodEnd = invoice.lines.data[0]?.period?.end
  const periodStart = invoice.lines.data[0]?.period?.start

  const sub = await db.query.subscriptions.findFirst({
    where: eq(subscriptions.stripeSubscriptionId, stripeSubscriptionId),
  })
  if (!sub) return

  // Update period in DB
  await db
    .update(subscriptions)
    .set({
      status: 'active',
      ...(periodStart
        ? { currentPeriodStart: new Date(periodStart * 1000) }
        : {}),
      ...(periodEnd
        ? { currentPeriodEnd: new Date(periodEnd * 1000) }
        : {}),
    })
    .where(eq(subscriptions.id, sub.id))

  // Reset LiteLLM budget for new period
  const plan = PLANS[sub.planId as PlanId]
  const inst = await db.query.instances.findFirst({
    where: eq(instances.orgId, sub.orgId),
  })
  if (inst?.litellmVirtualKey) {
    try {
      const litellm = getLiteLLM()
      const plainKey = decrypt(inst.litellmVirtualKey)
      const keyInfo = await litellm.getKeyInfo(plainKey)
      // New budget = current spend + fresh included credits
      // (We don't reset the spend counter — we raise the ceiling)
      const newBudget =
        keyInfo.spend + plan.includedCreditsRealCents / 100
      await litellm.updateKeyBudget(plainKey, newBudget)
      console.log(
        `[stripe-webhook] Monthly reset: spend=$${keyInfo.spend} newBudget=$${newBudget}`,
      )
    } catch (e) {
      console.error(
        '[stripe-webhook] Failed to reset monthly budget:',
        e,
      )
    }
  }
}

async function handlePaymentFailed(invoice: Stripe.Invoice) {
  const stripeSubscriptionId = getSubscriptionIdFromInvoice(invoice)
  if (!stripeSubscriptionId) return

  await db
    .update(subscriptions)
    .set({ status: 'past_due' })
    .where(eq(subscriptions.stripeSubscriptionId, stripeSubscriptionId))
}

function getSubscriptionIdFromInvoice(
  invoice: Stripe.Invoice,
): string | null {
  // Stripe API v2024+ uses parent.subscription_details
  const subDetails = (invoice as any).parent?.subscription_details
  if (subDetails) {
    return typeof subDetails.subscription === 'string'
      ? subDetails.subscription
      : (subDetails.subscription?.id ?? null)
  }
  // Fallback for older API versions
  const sub = (invoice as any).subscription
  return typeof sub === 'string' ? sub : (sub?.id ?? null)
}
