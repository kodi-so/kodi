export const MARKUP_FACTOR = 1.2

export const PLANS = {
  pro: {
    name: 'Pro',
    stripePriceId: process.env.STRIPE_PRO_PRICE_ID ?? '',
    monthlyPriceCents: 5999, // $59.99/mo
    includedCreditsCents: 1500, // $15.00 visible to user
    includedCreditsRealCents: 1250, // $12.50 actual LiteLLM budget ($15 / 1.2)
    defaultSpendingCapCents: 5000, // $50.00 default monthly cap
    maxMembers: 5,
    computeTier: 'standard' as const,
    byokEnabled: false,
  },
  business: {
    name: 'Business',
    stripePriceId: process.env.STRIPE_BUSINESS_PRICE_ID ?? '',
    monthlyPriceCents: 15999, // $159.99/mo
    includedCreditsCents: 5000, // $50.00 visible to user
    includedCreditsRealCents: 4167, // $41.67 actual LiteLLM budget ($50 / 1.2)
    defaultSpendingCapCents: 20000, // $200.00 default monthly cap
    maxMembers: 25,
    computeTier: 'enhanced' as const,
    byokEnabled: true,
  },
} as const

export type PlanId = keyof typeof PLANS
export type PlanConfig = (typeof PLANS)[PlanId]

/** Convert a user-visible dollar amount (cents) to the real LiteLLM budget (cents). */
export function toRealBudget(userVisibleCents: number): number {
  return Math.round(userVisibleCents / MARKUP_FACTOR)
}

/** Convert a real LiteLLM cost (cents) to the user-visible (marked-up) amount (cents). */
export function toUserVisibleCost(realCostCents: number): number {
  return Math.round(realCostCents * MARKUP_FACTOR)
}
