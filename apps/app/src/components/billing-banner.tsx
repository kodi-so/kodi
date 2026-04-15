'use client'

import { useEffect, useState } from 'react'
import { useOrg } from '@/lib/org-context'
import { trpc } from '@/lib/trpc'
import { AlertTriangle, X } from 'lucide-react'
import { Button } from '@kodi/ui'
import Link from 'next/link'

type BannerState =
  | { type: 'none' }
  | { type: 'warning'; pct: number }
  | { type: 'cap_reached' }
  | { type: 'past_due' }

const POLL_INTERVAL_MS = 5 * 60 * 1000 // 5 minutes

export function BillingBanner() {
  const { activeOrg } = useOrg()
  const [banner, setBanner] = useState<BannerState>({ type: 'none' })
  const [dismissed, setDismissed] = useState(false)

  useEffect(() => {
    if (!activeOrg) return

    let mounted = true

    async function fetchStatus() {
      try {
        const data = await trpc.billing.getStatus.query({
          orgId: activeOrg!.orgId,
        })

        if (!mounted) return

        const sub = data.subscription
        const usage = data.usage

        if (sub?.status === 'past_due') {
          setBanner({ type: 'past_due' })
          return
        }

        if (!sub || !usage || sub.status !== 'active') {
          setBanner({ type: 'none' })
          return
        }

        // Calculate total spend as percentage of spending cap
        const totalSpendCents =
          usage.includedCreditsUsedCents + usage.overageCents
        const capCents = usage.spendingCapCents
        if (capCents <= 0) {
          setBanner({ type: 'none' })
          return
        }

        const pct = (totalSpendCents / capCents) * 100

        if (pct >= 100) {
          setBanner({ type: 'cap_reached' })
        } else if (pct >= 80) {
          setBanner({ type: 'warning', pct: Math.round(pct) })
        } else {
          setBanner({ type: 'none' })
        }
      } catch {
        // Silently ignore — don't show banner if status fetch fails
        if (mounted) setBanner({ type: 'none' })
      }
    }

    void fetchStatus()
    const interval = setInterval(fetchStatus, POLL_INTERVAL_MS)

    return () => {
      mounted = false
      clearInterval(interval)
    }
  }, [activeOrg])

  // Reset dismissed state when banner type changes
  useEffect(() => {
    setDismissed(false)
  }, [banner.type])

  if (banner.type === 'none' || dismissed) return null

  const isOwner = activeOrg?.role === 'owner'

  if (banner.type === 'past_due') {
    return (
      <BannerShell variant="destructive" onDismiss={() => setDismissed(true)}>
        <AlertTriangle className="h-4 w-4 flex-shrink-0" />
        <span className="flex-1">
          Your payment failed. Update your payment method to continue using
          Kodi.
        </span>
        {isOwner && (
          <Button size="sm" variant="outline" asChild>
            <Link href="/settings/billing">Update Payment</Link>
          </Button>
        )}
      </BannerShell>
    )
  }

  if (banner.type === 'cap_reached') {
    return (
      <BannerShell variant="destructive" onDismiss={() => setDismissed(true)}>
        <AlertTriangle className="h-4 w-4 flex-shrink-0" />
        <span className="flex-1">
          Your spending cap has been reached. Usage is paused.
        </span>
        {isOwner && (
          <div className="flex gap-2">
            <Button size="sm" variant="outline" asChild>
              <Link href="/settings/billing">Increase Cap</Link>
            </Button>
          </div>
        )}
      </BannerShell>
    )
  }

  // warning (80-99%)
  return (
    <BannerShell variant="warning" onDismiss={() => setDismissed(true)}>
      <AlertTriangle className="h-4 w-4 flex-shrink-0" />
      <span className="flex-1">
        You&apos;ve used {banner.pct}% of your monthly spending cap.
      </span>
      {isOwner && (
        <Button size="sm" variant="outline" asChild>
          <Link href="/settings/billing">Manage Billing</Link>
        </Button>
      )}
    </BannerShell>
  )
}

function BannerShell({
  variant,
  onDismiss,
  children,
}: {
  variant: 'warning' | 'destructive'
  onDismiss: () => void
  children: React.ReactNode
}) {
  const bg =
    variant === 'destructive'
      ? 'bg-red-500/10 border-red-500/20 text-red-300'
      : 'bg-amber-500/10 border-amber-500/20 text-amber-300'

  return (
    <div
      className={`flex items-center gap-3 border-b px-4 py-2.5 text-sm ${bg}`}
    >
      {children}
      <button
        onClick={onDismiss}
        className="flex-shrink-0 rounded p-0.5 opacity-60 hover:opacity-100"
      >
        <X className="h-3.5 w-3.5" />
      </button>
    </div>
  )
}
