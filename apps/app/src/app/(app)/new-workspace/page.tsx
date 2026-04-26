'use client'

import { useState, useEffect, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { Building2, Check, CreditCard, X } from 'lucide-react'
import { PLANS, type PlanId } from '@kodi/db/plans'
import { trpc } from '@/lib/trpc'
import { useOrg } from '@/lib/org-context'
import { Alert, AlertDescription } from '@kodi/ui/components/alert'
import { Button } from '@kodi/ui/components/button'
import { Card, CardContent, CardHeader, CardTitle } from '@kodi/ui/components/card'
import { Input } from '@kodi/ui/components/input'
import { Label } from '@kodi/ui/components/label'
import { panelCardClass } from '@/lib/brand-styles'

export default function NewWorkspacePage() {
  return (
    <Suspense>
      <NewWorkspacePageInner />
    </Suspense>
  )
}

function NewWorkspacePageInner() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const { refreshOrgs } = useOrg()

  const [step, setStep] = useState<'name' | 'billing'>('name')
  const [name, setName] = useState('')
  const [creating, setCreating] = useState(false)
  const [subscribing, setSubscribing] = useState<PlanId | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [pendingOrgId, setPendingOrgId] = useState<string | null>(null)

  // Restore billing step after Stripe Checkout abandonment (cancel_url brings user back with ?orgId=&name=)
  useEffect(() => {
    const orgId = searchParams.get('orgId')
    const restoredName = searchParams.get('name')
    if (orgId) {
      setPendingOrgId(orgId)
      if (restoredName) setName(restoredName)
      setStep('billing')
    }
  }, [searchParams])

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault()
    if (!name.trim()) return
    setCreating(true)
    setError(null)
    try {
      const result = await trpc.org.create.mutate({ name: name.trim() })
      setPendingOrgId(result.orgId)
      setStep('billing')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create workspace')
    } finally {
      setCreating(false)
    }
  }

  async function handleCancel() {
    if (pendingOrgId) {
      try {
        await trpc.org.delete.mutate({ orgId: pendingOrgId })
      } catch {
        // best-effort cleanup
      }
      await refreshOrgs()
    }
    router.replace('/chat')
  }

  async function handleSubscribe(planId: PlanId) {
    if (!pendingOrgId) return
    setSubscribing(planId)
    setError(null)
    try {
      const result = await trpc.billing.createCheckoutSession.mutate({
        orgId: pendingOrgId,
        planId,
        successPath: '/chat',
        cancelPath: `/new-workspace?orgId=${pendingOrgId}&name=${encodeURIComponent(name)}`,
      })
      if (result.type === 'checkout' && result.url) {
        window.location.href = result.url
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to start checkout')
      setSubscribing(null)
    }
  }

  if (step === 'billing') {
    return (
      <div className="flex min-h-full items-center justify-center px-4 py-16">
        <div className="w-full max-w-2xl space-y-6">
          <div className="relative space-y-1 text-center">
            <button
              type="button"
              onClick={() => void handleCancel()}
              className="absolute right-0 top-0 rounded-md p-1 text-muted-foreground hover:text-foreground"
              aria-label="Cancel and discard workspace"
            >
              <X size={18} />
            </button>
            <h1 className="text-2xl font-semibold tracking-tight">Choose a plan</h1>
            <p className="text-sm text-muted-foreground">
              Subscribe to activate <span className="font-medium text-foreground">{name}</span>
            </p>
          </div>

          {error && (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          <div className="grid gap-4 sm:grid-cols-2">
            {(Object.entries(PLANS) as [PlanId, (typeof PLANS)[PlanId]][]).map(([planId, plan]) => (
              <Card key={planId} className={panelCardClass}>
                <CardHeader className="pb-3">
                  <CardTitle className="flex items-center justify-between">
                    <span>{plan.name}</span>
                    <span className="text-lg font-semibold">
                      ${(plan.monthlyPriceCents / 100).toFixed(2)}
                      <span className="text-xs font-normal text-muted-foreground">/mo</span>
                    </span>
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <ul className="space-y-1.5 text-sm text-muted-foreground">
                    <li className="flex items-center gap-2">
                      <Check className="h-3.5 w-3.5 text-indigo-400" />
                      ${(plan.includedCreditsCents / 100).toFixed(2)} included credits
                    </li>
                    <li className="flex items-center gap-2">
                      <Check className="h-3.5 w-3.5 text-indigo-400" />
                      ${(plan.defaultSpendingCapCents / 100).toFixed(2)} default spending cap
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
                  <Button
                    className="w-full"
                    onClick={() => void handleSubscribe(planId)}
                    disabled={subscribing !== null}
                  >
                    {subscribing === planId ? (
                      <span className="flex items-center gap-2">
                        <CreditCard className="h-4 w-4 animate-pulse" />
                        Redirecting…
                      </span>
                    ) : (
                      `Subscribe to ${plan.name}`
                    )}
                  </Button>
                </CardContent>
              </Card>
            ))}
          </div>

          <p className="text-center text-sm text-muted-foreground">
            Changed your mind?{' '}
            <button
              type="button"
              onClick={() => void handleCancel()}
              className="underline underline-offset-4 hover:text-foreground transition-colors"
              disabled={subscribing !== null}
            >
              Discard this workspace
            </button>
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="flex min-h-full items-center justify-center px-4 py-16">
      <div className="w-full max-w-md space-y-6">
        <div className="space-y-1 text-center">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-2xl border border-border bg-accent text-primary shadow-sm">
            <Building2 size={22} />
          </div>
          <h1 className="text-2xl font-semibold tracking-tight">Create a new workspace</h1>
          <p className="text-sm text-muted-foreground">
            Each workspace gets its own AI instance, members, and subscription.
          </p>
        </div>

        <Card className="border-border">
          <CardContent className="pt-6">
            <form onSubmit={(e) => void handleCreate(e)} className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="workspace-name">Workspace name</Label>
                <Input
                  id="workspace-name"
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Acme Corp"
                  maxLength={80}
                  disabled={creating}
                  className="h-12 rounded-xl"
                  autoFocus
                />
              </div>

              {error && (
                <Alert variant="destructive">
                  <AlertDescription>{error}</AlertDescription>
                </Alert>
              )}

              <div className="flex gap-2">
                <Button
                  type="button"
                  variant="outline"
                  className="flex-1"
                  onClick={() => router.back()}
                  disabled={creating}
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  className="flex-1"
                  disabled={!name.trim() || creating}
                >
                  {creating ? 'Creating…' : 'Continue'}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
