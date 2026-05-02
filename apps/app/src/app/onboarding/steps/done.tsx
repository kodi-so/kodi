'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Button } from '@kodi/ui/components/button'
import { trpc } from '@/lib/trpc'
import { useOnboarding } from '../lib/onboarding-context'

const NAVIGATE_DELAY_MS = 1000

export function DoneStep() {
  const router = useRouter()
  const {
    orgId,
    orgName,
    botDisplayName,
    connectedToolSlugs,
    invitesSentCount,
    provisioningStatus,
    setProvisioningStatus,
    clearStorage,
    isReady,
  } = useOnboarding()

  const [navigating, setNavigating] = useState(false)
  const completionFired = useRef(false)

  // On mount: mark onboarding complete and clear storage
  useEffect(() => {
    if (!isReady || !orgId || completionFired.current) return
    completionFired.current = true

    trpc.org.completeOnboarding.mutate({ orgId }).catch(() => {
      // Non-fatal — guard in layout will fall back to instance-check heuristic
    })
    clearStorage()
  }, [isReady, orgId, clearStorage])

  // Phase 2: auto-navigate when provisioning becomes 'running'
  useEffect(() => {
    if (provisioningStatus === 'running' && !navigating) {
      setNavigating(true)
      setTimeout(() => router.replace('/chat'), NAVIGATE_DELAY_MS)
    }
  }, [provisioningStatus, navigating, router])

  function handleRetryProvision() {
    if (!orgId) return
    setProvisioningStatus('pending')
    trpc.instance.provision
      .mutate({ orgId })
      .catch((err: { data?: { code?: string } }) => {
        if (err?.data?.code === 'CONFLICT') {
          setProvisioningStatus('running')
        } else {
          setProvisioningStatus('error')
          toast.error('Could not start provisioning. Please contact support.')
        }
      })
  }

  function handleOpenKodi() {
    setNavigating(true)
    router.replace('/chat')
  }

  // Provisioning states
  const isWaiting =
    provisioningStatus === 'pending' || provisioningStatus === 'installing'
  const isError = provisioningStatus === 'error'

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="space-y-1.5">
        <h1 className="text-2xl font-semibold tracking-tight">
          {navigating ? 'Opening Kodi…' : "You're all set!"}
        </h1>
        <p className="text-sm text-muted-foreground">
          Here&apos;s what you configured. You can change any of this in Settings.
        </p>
      </div>

      {/* Summary */}
      <div className="space-y-3 rounded-lg border border-border bg-muted/20 p-4 text-sm">
        <SummaryRow
          label="Team name"
          value={orgName || '—'}
        />
        <SummaryRow
          label="AI teammate name"
          value={botDisplayName || 'Kodi'}
        />
        <SummaryRow
          label="Integrations"
          value={
            connectedToolSlugs.length > 0
              ? `Connected ${connectedToolSlugs.length} integration${connectedToolSlugs.length !== 1 ? 's' : ''}`
              : 'No integrations connected yet — add them in Settings'
          }
          muted={connectedToolSlugs.length === 0}
        />
        <SummaryRow
          label="Teammates invited"
          value={
            invitesSentCount > 0
              ? `Invited ${invitesSentCount} teammate${invitesSentCount !== 1 ? 's' : ''} — they'll get an email shortly`
              : 'No teammates invited yet — invite them in Settings › Members'
          }
          muted={invitesSentCount === 0}
        />
      </div>

      {/* Phase 2: provisioning-aware CTA */}
      {/* TODO Phase 2: check provisioning status before navigating */}
      {isWaiting ? (
        <div className="space-y-3 text-center">
          <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
            <span className="h-4 w-4 animate-spin rounded-full border-2 border-primary border-t-transparent" />
            Your AI teammate is almost ready…
          </div>
          <p className="text-xs text-muted-foreground">
            This usually takes 2–3 minutes. You&apos;ll be taken in automatically.
          </p>
        </div>
      ) : isError ? (
        <div className="space-y-3">
          <p className="text-sm text-destructive">
            Something went wrong setting up your agent.{' '}
            <button
              type="button"
              className="underline"
              onClick={handleRetryProvision}
            >
              Try again
            </button>{' '}
            or{' '}
            <a
              href="mailto:support@kodi.so"
              className="underline"
            >
              contact support
            </a>
            .
          </p>
          <Button onClick={handleOpenKodi} variant="outline" className="w-full" disabled={navigating}>
            Open Kodi anyway →
          </Button>
        </div>
      ) : (
        <Button onClick={handleOpenKodi} className="w-full" disabled={navigating}>
          Open Kodi →
        </Button>
      )}
    </div>
  )
}

function SummaryRow({
  label,
  value,
  muted = false,
}: {
  label: string
  value: string
  muted?: boolean
}) {
  return (
    <div className="flex flex-col gap-0.5 sm:flex-row sm:items-baseline sm:gap-2">
      <span className="w-40 shrink-0 text-xs font-medium uppercase tracking-wider text-muted-foreground">
        {label}
      </span>
      <span className={muted ? 'text-muted-foreground' : 'text-foreground'}>
        {value}
      </span>
    </div>
  )
}
