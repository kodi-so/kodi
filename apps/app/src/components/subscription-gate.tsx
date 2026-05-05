'use client'

import { useEffect, useState, type ReactNode } from 'react'
import { useOrg } from '@/lib/org-context'
import { trpc } from '@/lib/trpc'
import { PLANS, type PlanId } from '@kodi/db/plans'
import {
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Skeleton,
} from '@kodi/ui'
import { panelCardClass } from '@/lib/brand-styles'
import { CreditCard, Sparkles, Check } from 'lucide-react'

type BillingStatus = {
  subscription: {
    status: string
    planId: string
  } | null
}

export function SubscriptionGate({ children }: { children: ReactNode }) {
  const { activeOrg } = useOrg()
  const [status, setStatus] = useState<BillingStatus | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!activeOrg) return
    setLoading(true)

    trpc.billing.getStatus
      .query({ orgId: activeOrg.orgId })
      .then((data) => {
        setStatus(data)
        setLoading(false)
      })
      .catch(() => {
        setStatus(null)
        setLoading(false)
      })
  }, [activeOrg])

  // Still loading — show skeleton
  if (loading || !activeOrg) {
    return (
      <div className="flex min-h-full items-center justify-center p-8">
        <Skeleton className="h-64 w-full max-w-2xl" />
      </div>
    )
  }

  // Has active or past_due subscription — allow through
  const sub = status?.subscription
  if (sub && (sub.status === 'active' || sub.status === 'past_due')) {
    return <>{children}</>
  }

  // No subscription or canceled — show paywall
  return <PaywallDialog orgId={activeOrg.orgId} role={activeOrg.role} />
}

function PaywallDialog({ orgId, role }: { orgId: string; role: string }) {
  const [subscribing, setSubscribing] = useState<PlanId | null>(null)
  const isOwner = role === 'owner'

  async function handleSubscribe(planId: PlanId) {
    setSubscribing(planId)
    try {
      const result = await trpc.billing.createCheckoutSession.mutate({
        orgId,
        planId,
      })
      if (result.type === 'checkout' && result.url) {
        window.location.href = result.url
      }
    } catch (err) {
      console.error('[subscription-gate] Failed to create checkout:', err)
      setSubscribing(null)
    }
  }

  return (
    <div className="flex min-h-full items-center justify-center p-8">
      <div className="w-full max-w-2xl space-y-6">
        <div className="text-center space-y-2">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl bg-indigo-500/10 border border-indigo-500/20">
            <Sparkles className="h-6 w-6 text-indigo-400" />
          </div>
          <h1 className="text-2xl font-semibold text-foreground">
            Subscribe to get started
          </h1>
          <p className="text-sm text-muted-foreground">
            Choose a plan to start using Kodi
          </p>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          {(Object.entries(PLANS) as [PlanId, (typeof PLANS)[PlanId]][]).map(
            ([planId, plan]) => (
              <Card key={planId} className={panelCardClass}>
                <CardHeader className="pb-3">
                  <CardTitle className="flex items-center justify-between">
                    <span>{plan.name}</span>
                    <span className="text-lg font-semibold">
                      ${(plan.monthlyPriceCents / 100).toFixed(2)}
                      <span className="text-xs font-normal text-muted-foreground">
                        /mo
                      </span>
                    </span>
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <ul className="space-y-1.5 text-sm text-muted-foreground">
                    <li className="flex items-center gap-2">
                      <Check className="h-3.5 w-3.5 text-indigo-400" />$
                      {(plan.includedCreditsCents / 100).toFixed(2)} included
                      credits
                    </li>
                    <li className="flex items-center gap-2">
                      <Check className="h-3.5 w-3.5 text-indigo-400" />$
                      {(plan.defaultSpendingCapCents / 100).toFixed(2)} default
                      spending cap
                    </li>
                    <li className="flex items-center gap-2">
                      <Check className="h-3.5 w-3.5 text-indigo-400" />
                      {plan.maxMembers} team members
                    </li>
                    {plan.byokEnabled && (
                      <li className="flex items-center gap-2">
                        <Check className="h-3.5 w-3.5 text-indigo-400" />
                        Bring your own API keys
                      </li>
                    )}
                  </ul>

                  {isOwner ? (
                    <Button
                      className="w-full"
                      onClick={() => handleSubscribe(planId)}
                      disabled={subscribing !== null}
                    >
                      {subscribing === planId ? (
                        <span className="flex items-center gap-2">
                          <CreditCard className="h-4 w-4 animate-pulse" />
                          Redirecting...
                        </span>
                      ) : (
                        `Subscribe to ${plan.name}`
                      )}
                    </Button>
                  ) : (
                    <p className="text-center text-xs text-muted-foreground">
                      Ask your workspace owner to subscribe
                    </p>
                  )}
                </CardContent>
              </Card>
            )
          )}
        </div>
      </div>
    </div>
  )
}
