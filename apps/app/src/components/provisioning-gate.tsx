'use client'

import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { usePathname } from 'next/navigation'
import { useOrg } from '@/lib/org-context'
import { trpc } from '@/lib/trpc'
import { Skeleton } from '@kodi/ui/components/skeleton'

type InstanceStatus =
  | 'pending'
  | 'installing'
  | 'running'
  | 'error'
  | 'suspended'
  | 'deleting'
  | 'deleted'

type InstanceState = {
  id: string
  status: InstanceStatus
  errorMessage: string | null
}

// These routes are always accessible regardless of provisioning state.
const UNGATED_PREFIXES = ['/settings']

const POLL_PENDING_MS = 10_000   // poll getStatus while EC2 is launching
const POLL_INSTALLING_MS = 15_000 // call checkHealth while cloud-init runs

export function ProvisioningGate({ children }: { children: ReactNode }) {
  const { activeOrg } = useOrg()
  const pathname = usePathname()

  const [instance, setInstance] = useState<InstanceState | null | undefined>(undefined)
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const isUngated = UNGATED_PREFIXES.some((p) => pathname.startsWith(p))

  // ── Fetch current status from DB ────────────────────────────────────────────
  const fetchStatus = useCallback(async () => {
    if (!activeOrg) return
    try {
      const data = await trpc.instance.getStatus.query({ orgId: activeOrg.orgId })
      setInstance(data as InstanceState | null)
    } catch {
      setInstance(null)
    }
  }, [activeOrg])

  // ── Drive installing → running via SSH + HTTP health check ──────────────────
  const runHealthCheck = useCallback(async () => {
    if (!activeOrg || !instance?.id) return
    try {
      const result = await trpc.instance.checkHealth.mutate({
        orgId: activeOrg.orgId,
        instanceId: instance.id,
      })
      setInstance((prev) =>
        prev
          ? {
              ...prev,
              status: result.status as InstanceStatus,
              errorMessage: result.errorMessage ?? null,
            }
          : prev,
      )
    } catch {
      // silently retry next tick
    }
  }, [activeOrg, instance?.id])

  // Initial load
  useEffect(() => {
    void fetchStatus()
  }, [fetchStatus])

  // Polling — varies by status
  useEffect(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current)
      intervalRef.current = null
    }

    if (!instance) return
    if (instance.status === 'running' || instance.status === 'error') return

    if (instance.status === 'pending') {
      intervalRef.current = setInterval(() => void fetchStatus(), POLL_PENDING_MS)
    } else if (instance.status === 'installing') {
      void runHealthCheck()
      intervalRef.current = setInterval(() => void runHealthCheck(), POLL_INSTALLING_MS)
    }

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current)
    }
  }, [instance, fetchStatus, runHealthCheck])

  // Settings routes always pass through
  if (isUngated) return <>{children}</>

  // Loading
  if (instance === undefined || !activeOrg) {
    return (
      <div className="flex min-h-full items-center justify-center p-8">
        <Skeleton className="h-64 w-full max-w-lg" />
      </div>
    )
  }

  // No instance yet — provisioning just triggered, waiting for it to appear
  if (instance === null) {
    return <ProvisioningScreen status="pending" />
  }

  // Active provisioning
  if (instance.status === 'pending' || instance.status === 'installing') {
    return <ProvisioningScreen status={instance.status} />
  }

  // Provisioning failed
  if (instance.status === 'error') {
    return <ProvisioningErrorScreen errorMessage={instance.errorMessage} />
  }

  // Running / suspended / deleting / deleted — render normally
  return <>{children}</>
}

// ── Provisioning screen ──────────────────────────────────────────────────────

function ProvisioningScreen({ status }: { status: 'pending' | 'installing' }) {
  return (
    <div className="flex min-h-full items-center justify-center p-8">
      <div className="w-full max-w-md space-y-6 text-center">
        {/* Animated indicator */}
        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl border border-brand-line bg-brand-accent-soft">
          <div className="h-7 w-7 animate-spin rounded-full border-[3px] border-brand-accent-strong/30 border-t-brand-accent-strong" />
        </div>

        <div className="space-y-2">
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">
            {status === 'pending'
              ? 'Setting up your AI agent'
              : 'Installing your AI agent'}
          </h1>
          <p className="text-sm leading-relaxed text-muted-foreground">
            {status === 'pending'
              ? "We're reserving cloud resources for your workspace. This only takes a moment."
              : 'Your agent is being configured on a dedicated server. This usually takes 1–3 minutes.'}
          </p>
        </div>

        {/* Subtle pulse to show it's alive */}
        <div className="flex items-center justify-center gap-2 text-xs text-muted-foreground">
          <span className="relative flex h-2 w-2">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-brand-accent-strong opacity-60" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-brand-accent-strong" />
          </span>
          {status === 'pending' ? 'Launching server…' : 'Checking every 15 seconds…'}
        </div>
      </div>
    </div>
  )
}

// ── Error screen ─────────────────────────────────────────────────────────────

function ProvisioningErrorScreen({ errorMessage }: { errorMessage: string | null }) {
  return (
    <div className="flex min-h-full items-center justify-center p-8">
      <div className="w-full max-w-md space-y-6 text-center">
        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl border border-destructive/20 bg-destructive/10 text-destructive">
          <span className="text-2xl font-light">✕</span>
        </div>

        <div className="space-y-2">
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">
            Setup failed
          </h1>
          <p className="text-sm leading-relaxed text-muted-foreground">
            Something went wrong while setting up your AI agent.{' '}
            {errorMessage && (
              <span className="font-mono text-xs text-muted-foreground">
                ({errorMessage})
              </span>
            )}
          </p>
        </div>

        <p className="text-sm text-muted-foreground">
          Please{' '}
          <a
            href="mailto:support@kodi.so"
            className="text-foreground underline underline-offset-4 hover:text-muted-foreground transition-colors"
          >
            contact support
          </a>{' '}
          and we'll get this sorted out.
        </p>
      </div>
    </div>
  )
}
