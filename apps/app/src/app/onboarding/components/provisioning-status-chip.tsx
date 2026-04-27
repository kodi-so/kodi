'use client'

import { useCallback, useEffect, useRef } from 'react'
import { Button } from '@kodi/ui/components/button'
import { cn } from '@kodi/ui/lib/utils'
import { trpc } from '@/lib/trpc'
import { useOnboarding, type ProvisioningStatus } from '../lib/onboarding-context'

const POLL_INTERVAL_MS = 10_000

export function ProvisioningStatusChip() {
  const { orgId, provisioningStatus, setProvisioningStatus } = useOnboarding()
  const instanceIdRef = useRef<string | null>(null)
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const stopPolling = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current)
      intervalRef.current = null
    }
  }, [])

  const poll = useCallback(async () => {
    if (!orgId) return

    try {
      // Get instance if we don't have its id yet
      if (!instanceIdRef.current) {
        const inst = await trpc.instance.getStatus.query({ orgId })
        if (!inst) return
        instanceIdRef.current = inst.id

        const mappedStatus = mapInstanceStatus(inst.status)
        if (mappedStatus === 'running' || mappedStatus === 'error') {
          setProvisioningStatus(mappedStatus)
          stopPolling()
          return
        }
      }

      // Active health check
      const health = await trpc.instance.checkHealth.mutate({
        orgId,
        instanceId: instanceIdRef.current,
      })

      if (health.status === 'running') {
        setProvisioningStatus('running')
        stopPolling()
      } else if (health.status === 'error') {
        setProvisioningStatus('error')
        stopPolling()
      } else {
        setProvisioningStatus('installing')
      }
    } catch {
      // Silently ignore poll errors — don't surface transient network failures
    }
  }, [orgId, setProvisioningStatus, stopPolling])

  // Start / stop polling based on status
  useEffect(() => {
    const isActive =
      provisioningStatus === 'pending' || provisioningStatus === 'installing'

    if (!isActive) {
      stopPolling()
      return
    }

    if (!intervalRef.current) {
      void poll()
      intervalRef.current = setInterval(() => void poll(), POLL_INTERVAL_MS)
    }

    return stopPolling
  }, [provisioningStatus, poll, stopPolling])

  // Cleanup on unmount
  useEffect(() => () => stopPolling(), [stopPolling])

  function handleRetry() {
    if (!orgId) return
    instanceIdRef.current = null
    setProvisioningStatus('pending')
    trpc.instance.provision
      .mutate({ orgId })
      .catch((err: { data?: { code?: string } }) => {
        if (err?.data?.code === 'CONFLICT') {
          setProvisioningStatus('running')
        } else {
          setProvisioningStatus('error')
        }
      })
  }

  if (provisioningStatus === 'idle') return null

  return (
    <div className="flex items-center gap-2 text-sm">
      {(provisioningStatus === 'pending' || provisioningStatus === 'installing') && (
        <>
          <span className="h-2 w-2 animate-pulse rounded-full bg-amber-500" />
          <span className="text-muted-foreground">Setting up Kodi…</span>
        </>
      )}

      {provisioningStatus === 'running' && (
        <>
          <span className="h-2 w-2 rounded-full bg-emerald-500" />
          <span className="text-emerald-600 dark:text-emerald-400">Kodi is ready</span>
        </>
      )}

      {provisioningStatus === 'error' && (
        <>
          <span className="h-2 w-2 rounded-full bg-destructive" />
          <span className="text-destructive">Setup failed</span>
          <Button
            variant="ghost"
            size="sm"
            className="h-auto px-1.5 py-0.5 text-xs"
            onClick={handleRetry}
          >
            Retry
          </Button>
        </>
      )}
    </div>
  )
}

function mapInstanceStatus(status: string): ProvisioningStatus {
  switch (status) {
    case 'running':
      return 'running'
    case 'error':
      return 'error'
    case 'installing':
      return 'installing'
    default:
      return 'pending'
  }
}
