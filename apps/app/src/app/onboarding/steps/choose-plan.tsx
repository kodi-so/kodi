'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { Check } from 'lucide-react'
import { toast } from 'sonner'
import { PLANS, type PlanId } from '@kodi/db/plans'
import { Button } from '@kodi/ui/components/button'
import { trpc } from '@/lib/trpc'
import { useOnboarding } from '../lib/onboarding-context'

function fmt(cents: number) {
  return `$${(cents / 100).toFixed(0)}`
}

export function ChoosePlanStep() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const { orgId, setProvisioningStatus, isReady } = useOnboarding()

  const [subscribing, setSubscribing] = useState<PlanId | null>(null)
  const [checkingExisting, setCheckingExisting] = useState(true)
  const didHandleReturn = useRef(false)

  // On mount: if the org already has an active subscription (e.g., user returned
  // after paying but before reaching the done screen), advance straight to tools-pick.
  useEffect(() => {
    if (!isReady || !orgId) return
    trpc.billing.getStatus
      .query({ orgId })
      .then((status) => {
        if (status.subscription?.status === 'active') {
          // Webhook already triggered provisioning — start polling
          setProvisioningStatus('pending')
          router.replace('?step=tools-pick')
        } else {
          setCheckingExisting(false)
        }
      })
      .catch(() => setCheckingExisting(false))
  }, [isReady, orgId, setProvisioningStatus, router])

  // Handle return from Stripe Checkout
  useEffect(() => {
    if (!isReady || didHandleReturn.current) return
    const billing = searchParams.get('billing')

    if (billing === 'success') {
      didHandleReturn.current = true
      // Stripe webhook already triggered server-side provisioning — start polling
      setProvisioningStatus('pending')
      const clean = new URLSearchParams(searchParams.toString())
      clean.delete('billing')
      router.replace(`?${clean.toString()}`)
      router.push('?step=tools-pick')
    } else if (billing === 'canceled') {
      didHandleReturn.current = true
      toast.info("Payment canceled — choose a plan below when you're ready.")
      const clean = new URLSearchParams(searchParams.toString())
      clean.delete('billing')
      router.replace(`?${clean.toString()}`)
    }
  }, [isReady, searchParams, router, setProvisioningStatus])

  async function handleSubscribe(planId: PlanId) {
    if (!orgId) return
    setSubscribing(planId)
    try {
      const result = await trpc.billing.createCheckoutSession.mutate({
        orgId,
        planId,
        successPath: '/onboarding?step=choose-plan&billing=success',
        cancelPath: '/onboarding?step=choose-plan&billing=canceled',
      })
      if (result.type === 'checkout' && result.url) {
        window.location.href = result.url
      }
    } catch {
      toast.error('Could not start checkout — please try again.')
      setSubscribing(null)
    }
  }

  if (checkingExisting) {
    return (
      <div className="flex justify-center pt-20">
        <span className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="space-y-1.5">
        <h1 className="text-2xl font-semibold tracking-tight">Choose a plan</h1>
        <p className="text-sm text-muted-foreground">
          Subscribe to start using Kodi. Cancel any time.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        {(Object.entries(PLANS) as [PlanId, (typeof PLANS)[PlanId]][]).map(([planId, plan]) => (
          <div
            key={planId}
            className="flex flex-col rounded-xl border border-border p-5 space-y-4"
          >
            <div className="flex items-baseline justify-between">
              <span className="font-semibold">{plan.name}</span>
              <span>
                <span className="text-xl font-semibold">
                  {fmt(plan.monthlyPriceCents)}
                </span>
                <span className="text-xs text-muted-foreground">/mo</span>
              </span>
            </div>

            <ul className="flex-1 space-y-2 text-sm text-muted-foreground">
              <li className="flex items-center gap-2">
                <Check className="h-3.5 w-3.5 shrink-0 text-emerald-500" />
                {fmt(plan.includedCreditsCents)} included AI credits/mo
              </li>
              <li className="flex items-center gap-2">
                <Check className="h-3.5 w-3.5 shrink-0 text-emerald-500" />
                Up to {plan.maxMembers} team members
              </li>
              {plan.byokEnabled && (
                <li className="flex items-center gap-2">
                  <Check className="h-3.5 w-3.5 shrink-0 text-emerald-500" />
                  Bring your own API keys
                </li>
              )}
            </ul>

            <Button
              className="w-full"
              onClick={() => handleSubscribe(planId)}
              disabled={subscribing !== null}
            >
              {subscribing === planId ? 'Redirecting…' : `Get ${plan.name}`}
            </Button>
          </div>
        ))}
      </div>

      <p className="text-center text-xs text-muted-foreground">
        Secure checkout via Stripe. No commitment — cancel any time.
      </p>
    </div>
  )
}
