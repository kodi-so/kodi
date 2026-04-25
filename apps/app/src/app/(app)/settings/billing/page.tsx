'use client'

import { useEffect, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { trpc } from '@/lib/trpc'
import { useOrg } from '@/lib/org-context'
import { SettingsLayout } from '../_components/settings-layout'
import { PLANS, type PlanId } from '@kodi/db/plans'
import { CreditCard, Check, ExternalLink } from 'lucide-react'
import {
  Alert,
  AlertDescription,
  Badge,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Input,
  Skeleton,
} from '@kodi/ui'

function fmt(cents: number) {
  return `$${(cents / 100).toFixed(2)}`
}

type BillingStatus = {
  subscription: {
    status: string
    planId: string
    planName: string
    monthlyPriceCents: number
    currentPeriodEnd: string | null
    cancelAtPeriodEnd: boolean
  } | null
  usage: {
    includedCreditsUsedCents: number
    includedCreditsTotalCents: number
    overageCents: number
    spendingCapCents: number
  } | null
}

export default function BillingSettingsPage() {
  const { activeOrg } = useOrg()
  const searchParams = useSearchParams()
  const [status, setStatus] = useState<BillingStatus | null>(null)
  const [loading, setLoading] = useState(true)
  const [successMsg, setSuccessMsg] = useState<string | null>(null)

  useEffect(() => {
    if (searchParams.get('success') === 'true') {
      setSuccessMsg('Subscription activated — your AI agent is being set up and will be ready in a few minutes.')
      window.history.replaceState({}, '', '/settings/billing')
    }
    if (searchParams.get('canceled') === 'true') {
      window.history.replaceState({}, '', '/settings/billing')
    }
  }, [searchParams])

  useEffect(() => {
    if (!activeOrg) return
    setLoading(true)
    trpc.billing.getStatus
      .query({ orgId: activeOrg.orgId })
      .then((data) => {
        setStatus(data as BillingStatus)
        setLoading(false)
      })
      .catch(() => setLoading(false))
  }, [activeOrg])

  if (!activeOrg || loading) {
    return (
      <SettingsLayout>
        <div className="mx-auto max-w-3xl space-y-6">
          <Skeleton className="h-10 w-48 bg-brand-muted" />
          <Skeleton className="h-48 w-full bg-brand-muted" />
          <Skeleton className="h-48 w-full bg-brand-muted" />
        </div>
      </SettingsLayout>
    )
  }

  const isOwner = activeOrg.role === 'owner'
  const sub = status?.subscription
  const usage = status?.usage

  return (
    <SettingsLayout>
      <div className="mx-auto max-w-3xl space-y-8">
        <div>
          <div className="mb-2 flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-2xl border border-brand-line bg-brand-accent-soft text-brand-accent-strong shadow-brand-panel">
              <CreditCard size={18} />
            </div>
            <h1 className="text-2xl font-medium tracking-tight text-foreground">
              Billing
            </h1>
          </div>
          <p className="ml-[3.25rem] text-sm leading-7 text-brand-quiet">
            Manage your subscription and usage
          </p>
        </div>

        {successMsg && (
          <Alert>
            <AlertDescription>{successMsg}</AlertDescription>
          </Alert>
        )}

        {sub?.status === 'past_due' && (
          <Alert variant="destructive">
            <AlertDescription className="flex items-center justify-between">
              <span>
                Your payment failed. Please update your payment method to
                continue using Kodi.
              </span>
              {isOwner && (
                <PortalButton orgId={activeOrg.orgId} label="Update Payment" />
              )}
            </AlertDescription>
          </Alert>
        )}

        {!sub || sub.status === 'canceled' || sub.status === 'incomplete' ? (
          <PlanSelectionCards orgId={activeOrg.orgId} isOwner={isOwner} />
        ) : (
          <>
            <CurrentPlanCard
              sub={sub}
              orgId={activeOrg.orgId}
              isOwner={isOwner}
            />
            {usage && (
              <UsageCard
                usage={usage}
                orgId={activeOrg.orgId}
                isOwner={isOwner}
              />
            )}
          </>
        )}
      </div>
    </SettingsLayout>
  )
}

function PlanSelectionCards({
  orgId,
  isOwner,
}: {
  orgId: string
  isOwner: boolean
}) {
  const [subscribing, setSubscribing] = useState<PlanId | null>(null)

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
    } catch {
      setSubscribing(null)
    }
  }

  return (
    <Card className="border-brand-line">
      <CardHeader>
        <CardTitle className="text-base font-semibold text-foreground">
          Choose a plan
        </CardTitle>
        <CardDescription className="text-brand-quiet">
          Subscribe to start using Kodi
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="grid gap-4 sm:grid-cols-2">
          {(Object.entries(PLANS) as [PlanId, (typeof PLANS)[PlanId]][]).map(
            ([planId, plan]) => (
              <div
                key={planId}
                className="rounded-xl border border-brand-line bg-brand-elevated p-4 space-y-3"
              >
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-foreground">
                    {plan.name}
                  </span>
                  <span className="text-lg font-semibold text-foreground">
                    {fmt(plan.monthlyPriceCents)}
                    <span className="text-xs font-normal text-brand-quiet">
                      /mo
                    </span>
                  </span>
                </div>
                <ul className="space-y-1.5 text-sm text-brand-quiet">
                  <li className="flex items-center gap-2">
                    <Check className="h-3.5 w-3.5 text-brand-accent-strong" />
                    {fmt(plan.includedCreditsCents)} included credits
                  </li>
                  <li className="flex items-center gap-2">
                    <Check className="h-3.5 w-3.5 text-brand-accent-strong" />
                    {fmt(plan.defaultSpendingCapCents)} default spending cap
                  </li>
                  <li className="flex items-center gap-2">
                    <Check className="h-3.5 w-3.5 text-brand-accent-strong" />
                    {plan.maxMembers} team members
                  </li>
                  {plan.byokEnabled && (
                    <li className="flex items-center gap-2">
                      <Check className="h-3.5 w-3.5 text-brand-accent-strong" />
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
                    {subscribing === planId
                      ? 'Redirecting...'
                      : `Subscribe to ${plan.name}`}
                  </Button>
                ) : (
                  <p className="text-center text-xs text-brand-subtle">
                    Only the workspace owner can manage billing
                  </p>
                )}
              </div>
            )
          )}
        </div>
      </CardContent>
    </Card>
  )
}

function CurrentPlanCard({
  sub,
  orgId,
  isOwner,
}: {
  sub: NonNullable<BillingStatus['subscription']>
  orgId: string
  isOwner: boolean
}) {
  const statusColor =
    sub.status === 'active'
      ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
      : sub.status === 'past_due'
        ? 'bg-amber-500/10 text-amber-400 border-amber-500/20'
        : 'bg-zinc-500/10 text-zinc-400 border-zinc-500/20'

  const periodEnd = sub.currentPeriodEnd
    ? new Date(sub.currentPeriodEnd).toLocaleDateString('en-US', {
        month: 'long',
        day: 'numeric',
        year: 'numeric',
      })
    : null

  return (
    <Card className="border-brand-line">
      <CardHeader>
        <div className="flex items-center justify-between">
          <div className="space-y-1">
            <CardTitle className="text-base font-semibold text-foreground">
              {sub.planName} Plan
            </CardTitle>
            <CardDescription className="text-brand-quiet">
              {fmt(sub.monthlyPriceCents)}/mo
              {periodEnd && ` \u00b7 Next billing: ${periodEnd}`}
              {sub.cancelAtPeriodEnd &&
                periodEnd &&
                ` \u00b7 Cancels on ${periodEnd}`}
            </CardDescription>
          </div>
          <Badge className={statusColor}>
            {sub.status === 'active'
              ? 'Active'
              : sub.status === 'past_due'
                ? 'Past due'
                : sub.status}
          </Badge>
        </div>
      </CardHeader>
      {isOwner && (
        <CardContent className="flex gap-3">
          <PortalButton orgId={orgId} label="Manage Subscription" />
          {sub.planId === 'pro' && (
            <UpgradeButton orgId={orgId} planId="business" />
          )}
        </CardContent>
      )}
    </Card>
  )
}

function UsageCard({
  usage,
  orgId,
  isOwner,
}: {
  usage: NonNullable<BillingStatus['usage']>
  orgId: string
  isOwner: boolean
}) {
  const pct =
    usage.includedCreditsTotalCents > 0
      ? (usage.includedCreditsUsedCents / usage.includedCreditsTotalCents) * 100
      : 0
  const barColor =
    pct >= 100 ? 'bg-red-500' : pct >= 80 ? 'bg-amber-500' : 'bg-indigo-500'

  return (
    <Card className="border-brand-line">
      <CardHeader>
        <CardTitle className="text-base font-semibold text-foreground">
          Usage this period
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="space-y-2">
          <div className="flex items-center justify-between text-sm">
            <span className="text-brand-quiet">Included credits</span>
            <span className="text-foreground">
              {fmt(usage.includedCreditsUsedCents)} /{' '}
              {fmt(usage.includedCreditsTotalCents)}
            </span>
          </div>
          <div className="h-2 rounded-full bg-brand-muted">
            <div
              className={`h-full rounded-full transition-all ${barColor}`}
              style={{ width: `${Math.min(pct, 100)}%` }}
            />
          </div>
        </div>

        <div className="flex items-center justify-between text-sm">
          <span className="text-brand-quiet">Overage charges</span>
          <span className="text-foreground">{fmt(usage.overageCents)}</span>
        </div>

        <SpendingCapEditor
          orgId={orgId}
          currentCapCents={usage.spendingCapCents}
          isOwner={isOwner}
        />
      </CardContent>
    </Card>
  )
}

function SpendingCapEditor({
  orgId,
  currentCapCents,
  isOwner,
}: {
  orgId: string
  currentCapCents: number
  isOwner: boolean
}) {
  const [capDollars, setCapDollars] = useState(
    (currentCapCents / 100).toFixed(2)
  )
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const isDirty =
    Math.round(parseFloat(capDollars) * 100) !== currentCapCents &&
    !isNaN(parseFloat(capDollars))

  async function handleSave(e: React.FormEvent) {
    e.preventDefault()
    if (!isDirty || !isOwner) return
    setSaving(true)
    setError(null)
    setSaved(false)
    try {
      const capCents = Math.round(parseFloat(capDollars) * 100)
      await trpc.billing.updateSpendingCap.mutate({ orgId, capCents })
      setSaved(true)
      setTimeout(() => setSaved(false), 3000)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between text-sm">
        <span className="text-brand-quiet">Monthly spending cap</span>
      </div>
      <form onSubmit={handleSave} className="flex items-center gap-3">
        <div className="relative">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-brand-quiet">
            $
          </span>
          <Input
            type="number"
            step="0.01"
            min="0"
            max="1000"
            value={capDollars}
            onChange={(e) => setCapDollars(e.target.value)}
            disabled={!isOwner || saving}
            className="h-10 w-32 rounded-xl border-brand-line bg-brand-elevated pl-7"
          />
        </div>
        {isOwner && isDirty && (
          <Button type="submit" size="sm" disabled={saving}>
            {saving ? 'Saving...' : 'Save'}
          </Button>
        )}
        {saved && (
          <span className="text-sm font-medium text-brand-success">Saved</span>
        )}
      </form>
      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
      <p className="text-xs text-brand-subtle">
        Maximum you&apos;ll be charged for usage above included credits each
        month.
      </p>
    </div>
  )
}

function PortalButton({ orgId, label }: { orgId: string; label: string }) {
  const [loading, setLoading] = useState(false)

  async function handleClick() {
    setLoading(true)
    try {
      const { url } = await trpc.billing.createPortalSession.mutate({ orgId })
      window.location.href = url
    } catch {
      setLoading(false)
    }
  }

  return (
    <Button variant="outline" onClick={handleClick} disabled={loading}>
      {loading ? 'Loading...' : label}
      <ExternalLink className="ml-2 h-3.5 w-3.5" />
    </Button>
  )
}

function UpgradeButton({ orgId, planId }: { orgId: string; planId: PlanId }) {
  const [loading, setLoading] = useState(false)
  const plan = PLANS[planId]

  async function handleClick() {
    setLoading(true)
    try {
      const result = await trpc.billing.createCheckoutSession.mutate({
        orgId,
        planId,
      })
      if (result.type === 'checkout' && result.url) {
        window.location.href = result.url
      } else {
        // Upgrade happened in-place, reload to reflect
        window.location.reload()
      }
    } catch {
      setLoading(false)
    }
  }

  return (
    <Button onClick={handleClick} disabled={loading}>
      {loading ? 'Upgrading...' : `Upgrade to ${plan.name}`}
    </Button>
  )
}
