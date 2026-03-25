export type PlanId = 'starter' | 'pro'

export interface Plan {
  creditsDollars: number
  instanceType: string
  volumeGb: number
}

export const PLANS: Record<PlanId, Plan> = {
  starter: { creditsDollars: 15, instanceType: 't4g.small', volumeGb: 20 },
  pro: { creditsDollars: 50, instanceType: 't4g.medium', volumeGb: 40 },
}
