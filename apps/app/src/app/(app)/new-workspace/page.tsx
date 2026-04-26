'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Building2 } from 'lucide-react'
import { trpc } from '@/lib/trpc'
import { useOrg } from '@/lib/org-context'
import { Alert, AlertDescription } from '@kodi/ui/components/alert'
import { Button } from '@kodi/ui/components/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@kodi/ui/components/card'
import { Input } from '@kodi/ui/components/input'
import { Label } from '@kodi/ui/components/label'

/**
 * New workspace creation flow.
 *
 * Step 1 — Name: user enters a workspace name.
 * Step 2 — Billing: user subscribes (Stripe checkout — TODO: wire up when billing is ready).
 *
 * If the user leaves before completing billing, the org is left in 'pending_billing'
 * status and can be cleaned up. On cancel we immediately delete it.
 */
export default function NewWorkspacePage() {
  const router = useRouter()
  const { refreshOrgs, setActiveOrg } = useOrg()

  const [step, setStep] = useState<'name' | 'billing'>('name')
  const [name, setName] = useState('')
  const [creating, setCreating] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [pendingOrgId, setPendingOrgId] = useState<string | null>(null)

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

  async function handleCancelBilling() {
    // Delete the pending org since the user didn't complete billing
    if (pendingOrgId) {
      try {
        // orgId required by ownerProcedure
        await trpc.org.delete.mutate({ orgId: pendingOrgId })
      } catch {
        // Best-effort cleanup — ignore errors
      }
      await refreshOrgs()
    }
    router.replace('/chat')
  }

  async function handleSubscribed() {
    // Called after a successful Stripe checkout (webhook will activate the org).
    // For now, activate the org and redirect to provision.
    if (!pendingOrgId) return
    await refreshOrgs()
    // Switch to the new org
    const orgs = await trpc.org.listMine.query()
    const newOrg = orgs.find((o) => o.orgId === pendingOrgId)
    if (newOrg) setActiveOrg(newOrg)
    router.replace('/provision')
  }

  if (step === 'billing') {
    return (
      <div className="flex min-h-full items-center justify-center px-4 py-16">
        <div className="w-full max-w-md space-y-6">
          <div className="space-y-1 text-center">
            <h1 className="text-2xl font-semibold tracking-tight">Subscribe to activate</h1>
            <p className="text-sm text-muted-foreground">
              A subscription is required to provision your new workspace.
            </p>
          </div>

          <Card className="border-border">
            <CardHeader>
              <CardTitle className="text-base">Workspace: {name}</CardTitle>
              <CardDescription>
                Your workspace has been created and is waiting for a subscription before we provision infrastructure.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {/* TODO: Replace with Stripe Checkout button when billing is wired up.
                  Create a Stripe Checkout session via /api/stripe/create-checkout
                  with orgId={pendingOrgId}, then redirect to the Stripe-hosted page.
                  On success, the webhook will update org.status = 'active' and
                  trigger provisioning. */}
              <div className="rounded-lg border border-dashed border-border bg-muted/30 p-4 text-center">
                <p className="text-sm text-muted-foreground">
                  Stripe Checkout integration coming soon.
                </p>
                <Button
                  className="mt-3"
                  onClick={() => void handleSubscribed()}
                >
                  Continue (dev mode — skip billing)
                </Button>
              </div>

              <Button
                variant="ghost"
                className="w-full text-muted-foreground"
                onClick={() => void handleCancelBilling()}
              >
                Cancel and discard workspace
              </Button>
            </CardContent>
          </Card>
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
