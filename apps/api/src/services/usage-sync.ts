import {
  db,
  subscriptions,
  instances,
  organizationSettings,
  usageSyncLog,
  organizations,
  eq,
  and,
  desc,
  gte,
  decrypt,
  createLiteLLMClient,
  PLANS,
  MARKUP_FACTOR,
  toRealBudget,
  type PlanId,
} from '@kodi/db'
import { getStripe } from '../lib/stripe'
import { requireLiteLLM, env } from '../env'

interface SyncResult {
  orgId: string
  success: boolean
  overageReportedCents: number
  error?: string
}

export async function syncAllOrgs(): Promise<SyncResult[]> {
  const activeSubs = await db.query.subscriptions.findMany({
    where: eq(subscriptions.status, 'active'),
  })

  const results: SyncResult[] = []

  for (const sub of activeSubs) {
    try {
      const result = await syncOrgUsage(sub)
      results.push(result)
    } catch (error) {
      results.push({
        orgId: sub.orgId,
        success: false,
        overageReportedCents: 0,
        error: error instanceof Error ? error.message : 'Unknown error',
      })
    }
  }

  return results
}

async function syncOrgUsage(
  sub: typeof subscriptions.$inferSelect,
): Promise<SyncResult> {
  const plan = PLANS[sub.planId as PlanId]

  // Get org settings for spending cap
  const orgSettings = await db.query.organizationSettings.findFirst({
    where: eq(organizationSettings.orgId, sub.orgId),
  })
  const spendingCapCents =
    orgSettings?.spendingCapCents ?? plan.defaultSpendingCapCents

  // 1. Get org's running instance
  const inst = await db.query.instances.findFirst({
    where: and(
      eq(instances.orgId, sub.orgId),
      eq(instances.status, 'running'),
    ),
  })
  if (!inst?.litellmVirtualKey) {
    return { orgId: sub.orgId, success: true, overageReportedCents: 0 }
  }

  // 2. Get current LiteLLM spend
  const { LITELLM_PROXY_URL, LITELLM_MASTER_KEY } = requireLiteLLM()
  const litellm = createLiteLLMClient(LITELLM_PROXY_URL, LITELLM_MASTER_KEY)
  const plainKey = decrypt(inst.litellmVirtualKey)
  const keyInfo = await litellm.getKeyInfo(plainKey)
  const currentSpendCents = Math.round(keyInfo.spend * 100)

  // 3. Get last sync for this org in current period
  const lastSync = sub.currentPeriodStart
    ? await db.query.usageSyncLog.findFirst({
        where: and(
          eq(usageSyncLog.orgId, sub.orgId),
          gte(usageSyncLog.periodStart, sub.currentPeriodStart),
        ),
        orderBy: [desc(usageSyncLog.createdAt)],
      })
    : null

  const previousSpendCents = lastSync?.litellmSpendCents ?? 0
  const previousCarryOverCents = lastSync?.carryOverCents ?? 0

  // 4. Calculate delta — skip if no new usage
  const deltaSpendCents = currentSpendCents - previousSpendCents
  if (deltaSpendCents <= 0) {
    return { orgId: sub.orgId, success: true, overageReportedCents: 0 }
  }

  // 5. Calculate total marked-up spend this period
  const totalMarkedUpCents = Math.round(currentSpendCents * MARKUP_FACTOR)
  const includedCreditsCents = plan.includedCreditsCents

  // 6. Calculate cumulative overage
  const cumulativeOverage = Math.max(
    0,
    totalMarkedUpCents - includedCreditsCents,
  )

  // Sum all overage previously reported in this period
  const previouslyReportedOverage = await getPreviouslyReportedOverage(
    sub.orgId,
    sub.currentPeriodStart!,
  )

  const newOverageSinceLastSync = cumulativeOverage - previouslyReportedOverage
  const overageWithCarry =
    newOverageSinceLastSync + previousCarryOverCents / 100
  const wholeOverageCents = Math.floor(Math.max(0, overageWithCarry))
  const newCarryOver = Math.round(
    (overageWithCarry - wholeOverageCents) * 100,
  )

  // 7. Enforce spending cap
  let actualOverageToReport = wholeOverageCents
  const totalOverageIfReported = previouslyReportedOverage + wholeOverageCents
  const maxOverage = Math.max(0, spendingCapCents - includedCreditsCents)

  if (totalOverageIfReported > maxOverage) {
    actualOverageToReport = Math.max(
      0,
      maxOverage - previouslyReportedOverage,
    )
    // Hard-stop: lock LiteLLM budget so no more usage is allowed
    const capBudgetDollars = toRealBudget(spendingCapCents) / 100
    await litellm.updateKeyBudget(plainKey, capBudgetDollars)
    console.log(
      `[usage-sync] org=${sub.orgId} hit spending cap, LiteLLM budget locked at $${capBudgetDollars}`,
    )
  }

  // 8. Report to Stripe meter
  let meterEventId: string | null = null
  if (actualOverageToReport > 0) {
    const org = await db.query.organizations.findFirst({
      where: eq(organizations.id, sub.orgId),
    })
    if (org?.stripeCustomerId) {
      const stripe = getStripe()
      const event = await stripe.billing.meterEvents.create({
        event_name: env.STRIPE_METER_EVENT_NAME,
        payload: {
          value: String(actualOverageToReport),
          stripe_customer_id: org.stripeCustomerId,
        },
      })
      meterEventId = event.identifier
    }
  }

  // 9. Log to usage_sync_log
  await db.insert(usageSyncLog).values({
    orgId: sub.orgId,
    periodStart: sub.currentPeriodStart ?? new Date(),
    periodEnd: new Date(),
    litellmSpendCents: currentSpendCents,
    markedUpCents: totalMarkedUpCents,
    overageCents: actualOverageToReport,
    reportedToStripe: meterEventId !== null,
    carryOverCents: newCarryOver,
    stripeMeterEventId: meterEventId,
  })

  return {
    orgId: sub.orgId,
    success: true,
    overageReportedCents: actualOverageToReport,
  }
}

async function getPreviouslyReportedOverage(
  orgId: string,
  periodStart: Date,
): Promise<number> {
  const logs = await db.query.usageSyncLog.findMany({
    where: and(
      eq(usageSyncLog.orgId, orgId),
      gte(usageSyncLog.periodStart, periodStart),
    ),
  })
  return logs.reduce((sum, log) => sum + log.overageCents, 0)
}
