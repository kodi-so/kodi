'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { trpc } from '@/lib/trpc'
import Link from 'next/link'
import {
  Alert,
  AlertDescription,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@kodi/ui'

type InstanceStatus =
  | 'pending'
  | 'installing'
  | 'running'
  | 'error'
  | 'suspended'
  | 'deleting'
  | 'deleted'

interface StatusData {
  id: string
  status: InstanceStatus
  hostname: string | null
  ipAddress: string | null
  errorMessage: string | null
  lastHealthCheck: Date | null
}

export function ProvisionStatus({
  orgId,
  initialData,
}: {
  orgId: string
  initialData: StatusData | null
}) {
  const [status, setStatus] = useState<InstanceStatus | 'none'>(
    initialData?.status ?? 'none'
  )
  const [instanceId, setInstanceId] = useState(initialData?.id ?? '')
  const [hostname, setHostname] = useState(initialData?.hostname ?? null)
  const [errorMessage, setErrorMessage] = useState(
    initialData?.errorMessage ?? null
  )
  const [copied, setCopied] = useState(false)
  const [hostnameBlurred, setHostnameBlurred] = useState(true)
  const [provisioning, setProvisioning] = useState(false)

  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const handleCopy = () => {
    if (hostname) {
      void navigator.clipboard.writeText(hostname)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    }
  }

  const startProvision = async () => {
    setProvisioning(true)
    setErrorMessage(null)
    try {
      const result = await trpc.instance.provision.mutate({ orgId })
      setInstanceId(result.id)
      setStatus(result.status as InstanceStatus)
      if (result.hostname) setHostname(result.hostname)
    } catch (err) {
      setErrorMessage(
        err instanceof Error ? err.message : 'Failed to start provisioning'
      )
      setStatus('error')
    } finally {
      setProvisioning(false)
    }
  }

  const retryProvision = async () => {
    if (!instanceId) return
    setProvisioning(true)
    setErrorMessage(null)
    try {
      const result = await trpc.instance.retryProvision.mutate({
        orgId,
        instanceId,
      })
      setStatus(result.status as InstanceStatus)
      setErrorMessage(null)
    } catch (err) {
      setErrorMessage(
        err instanceof Error ? err.message : 'Failed to retry provisioning'
      )
    } finally {
      setProvisioning(false)
    }
  }

  const checkHealth = useCallback(async () => {
    if (!instanceId) return
    try {
      const result = await trpc.instance.checkHealth.mutate({
        orgId,
        instanceId,
      })
      setStatus(result.status as InstanceStatus)
      if (result.hostname) setHostname(result.hostname)
      if (result.errorMessage) setErrorMessage(result.errorMessage)
    } catch {
      // silently retry next tick
    }
  }, [instanceId, orgId])

  // Poll every 15s while installing
  useEffect(() => {
    if (status !== 'installing') {
      if (intervalRef.current) clearInterval(intervalRef.current)
      return
    }

    void checkHealth()
    intervalRef.current = setInterval(() => void checkHealth(), 15_000)

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current)
    }
  }, [status, checkHealth])

  // ── No instance yet ─────────────────────────────────────────────────────
  if (status === 'none') {
    return (
      <Card className="mx-auto max-w-lg border-white/10 bg-[rgba(31,44,49,0.9)] text-center">
        <CardHeader>
          <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-2xl border border-[#DFAE56]/22 bg-[#DFAE56]/12">
            <svg
              className="h-7 w-7 text-[#F0C570]"
              fill="none"
              viewBox="0 0 24 24"
              strokeWidth={1.5}
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M5.25 14.25h13.5m-13.5 0a3 3 0 0 1-3-3m3 3a3 3 0 1 0 0 6h13.5a3 3 0 1 0 0-6m-16.5-3a3 3 0 0 1 3-3h13.5a3 3 0 0 1 3 3m-19.5 0a4.5 4.5 0 0 1 .9-2.7L5.737 5.1a3.375 3.375 0 0 1 2.7-1.35h7.126c1.062 0 2.062.5 2.7 1.35l2.587 3.45a4.5 4.5 0 0 1 .9 2.7m0 0a3 3 0 0 1-3 3m0 3h.008v.008h-.008v-.008Zm0-6h.008v.008h-.008v-.008Zm-3 6h.008v.008h-.008v-.008Zm0-6h.008v.008h-.008v-.008Z"
              />
            </svg>
          </div>
          <CardTitle className="text-2xl text-white">
            Deploy your AI agent
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="mb-6 text-sm text-[#8ea3a8]">
            Provision a dedicated OpenClaw instance for your organization. This
            sets up a cloud server with your own AI agent.
          </p>
          {errorMessage && (
            <Alert
              variant="destructive"
              className="mb-4 border-red-500/20 bg-red-500/10 text-red-400"
            >
              <AlertDescription>{errorMessage}</AlertDescription>
            </Alert>
          )}
          <Button
            onClick={() => void startProvision()}
            disabled={provisioning}
            className="gap-2 bg-[#DFAE56] px-5 text-[#223239] hover:bg-[#e8bf70]"
          >
            {provisioning ? (
              <>
                <div className="w-4 h-4 rounded-full border-2 border-white border-t-transparent animate-spin" />
                Provisioning...
              </>
            ) : (
              'Start provisioning'
            )}
          </Button>
        </CardContent>
      </Card>
    )
  }

  // ── Pending / Installing ───────────────────────────────────────────────
  if (status === 'pending' || status === 'installing') {
    return (
      <Card className="mx-auto max-w-lg border-white/10 bg-[rgba(31,44,49,0.9)] text-center">
        <CardContent className="pt-6">
          <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-2xl border border-[#DFAE56]/22 bg-[#DFAE56]/12">
            <div className="h-7 w-7 rounded-full border-2 border-[#DFAE56] border-t-transparent animate-spin" />
          </div>
          <h1 className="text-2xl font-bold text-white mb-2">
            {status === 'pending'
              ? 'Setting up your AI agent...'
              : 'Installing OpenClaw...'}
          </h1>
          <p className="text-sm text-[#8ea3a8]">
            {status === 'pending'
              ? 'Reserving cloud resources. This will take a moment.'
              : 'Your agent is being configured. Usually takes 1–3 minutes.'}
          </p>
          {status === 'installing' && (
            <p className="mt-2 text-xs text-[#7d9196]" aria-live="polite">
              Checking every 15 seconds...
            </p>
          )}
        </CardContent>
      </Card>
    )
  }

  // ── Running ───────────────────────────────────────────────────────────────
  if (status === 'running') {
    return (
      <Card className="mx-auto max-w-lg border-white/10 bg-[rgba(31,44,49,0.9)] text-center">
        <CardContent className="pt-6">
          <div className="w-16 h-16 rounded-2xl bg-green-500/10 border border-green-500/20 flex items-center justify-center mx-auto mb-4">
            <span className="relative flex h-3 w-3">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-green-400 opacity-75" />
              <span className="relative inline-flex h-3 w-3 rounded-full bg-green-500" />
            </span>
          </div>
          <h1 className="text-2xl font-bold text-white mb-2">
            Your agent is live
          </h1>
          <p className="mb-6 text-sm text-[#8ea3a8]">
            Your AI agent is running and ready to chat.
          </p>
          <Button
            asChild
            className="gap-2 bg-[#DFAE56] px-5 text-[#223239] hover:bg-[#e8bf70]"
          >
            <Link href="/chat">Open chat</Link>
          </Button>
        </CardContent>
      </Card>
    )
  }

  // ── Error ─────────────────────────────────────────────────────────────────
  if (status === 'error') {
    return (
      <Card className="mx-auto max-w-lg border-white/10 bg-[rgba(31,44,49,0.9)] text-center">
        <CardContent className="pt-6">
          <div className="w-16 h-16 rounded-2xl bg-red-500/10 border border-red-500/20 flex items-center justify-center mx-auto mb-6">
            <span className="text-2xl">✕</span>
          </div>
          <h1 className="text-2xl font-bold text-white mb-2">
            Something went wrong
          </h1>
          {errorMessage && (
            <Alert
              variant="destructive"
              className="mb-3 border-red-500/20 bg-red-500/10 text-red-400"
            >
              <AlertDescription>{errorMessage}</AlertDescription>
            </Alert>
          )}
          <p className="mb-6 text-sm text-[#8ea3a8]">
            If this keeps happening,{' '}
            <a
              href="mailto:support@kodi.so"
              className="text-[#F0C570] hover:underline"
            >
              contact support
            </a>
            .
          </p>
          <Button
            onClick={() => void retryProvision()}
            disabled={provisioning}
            variant="outline"
            className="gap-2 border-white/12 bg-white/8 text-white hover:bg-white/10"
          >
            {provisioning ? (
              <>
                <div className="w-4 h-4 rounded-full border-2 border-white border-t-transparent animate-spin" />
                Retrying...
              </>
            ) : (
              'Try again'
            )}
          </Button>
        </CardContent>
      </Card>
    )
  }

  // ── Suspended ─────────────────────────────────────────────────────────────
  if (status === 'suspended') {
    return (
      <Card className="mx-auto max-w-lg border-white/10 bg-[rgba(31,44,49,0.9)] text-center">
        <CardContent className="pt-6">
          <div className="w-16 h-16 rounded-2xl bg-yellow-500/10 border border-yellow-500/20 flex items-center justify-center mx-auto mb-6">
            <span className="text-2xl">⏸</span>
          </div>
          <h1 className="text-2xl font-bold text-white mb-2">
            Agent suspended
          </h1>
          <p className="text-sm text-[#8ea3a8]">
            Your agent has been suspended. Please{' '}
            <a
              href="mailto:support@kodi.so"
              className="text-[#F0C570] hover:underline"
            >
              contact support
            </a>{' '}
            to reactivate.
          </p>
        </CardContent>
      </Card>
    )
  }

  return null
}
