'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { trpc } from '@/lib/trpc'

type InstanceStatus = 'pending' | 'installing' | 'running' | 'error' | 'suspended' | 'deleting' | 'deleted'

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
    initialData?.status ?? 'none',
  )
  const [instanceId, setInstanceId] = useState(initialData?.id ?? '')
  const [hostname, setHostname] = useState(initialData?.hostname ?? null)
  const [errorMessage, setErrorMessage] = useState(initialData?.errorMessage ?? null)
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
      setErrorMessage(err instanceof Error ? err.message : 'Failed to start provisioning')
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
      const result = await trpc.instance.retryProvision.mutate({ orgId, instanceId })
      setStatus(result.status as InstanceStatus)
      setErrorMessage(null)
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Failed to retry provisioning')
    } finally {
      setProvisioning(false)
    }
  }

  const checkHealth = useCallback(async () => {
    if (!instanceId) return
    try {
      const result = await trpc.instance.checkHealth.mutate({ orgId, instanceId })
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
      <div className="max-w-lg mx-auto text-center">
        <div className="w-16 h-16 rounded-2xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center mx-auto mb-6">
          <svg className="w-7 h-7 text-indigo-400" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M5.25 14.25h13.5m-13.5 0a3 3 0 0 1-3-3m3 3a3 3 0 1 0 0 6h13.5a3 3 0 1 0 0-6m-16.5-3a3 3 0 0 1 3-3h13.5a3 3 0 0 1 3 3m-19.5 0a4.5 4.5 0 0 1 .9-2.7L5.737 5.1a3.375 3.375 0 0 1 2.7-1.35h7.126c1.062 0 2.062.5 2.7 1.35l2.587 3.45a4.5 4.5 0 0 1 .9 2.7m0 0a3 3 0 0 1-3 3m0 3h.008v.008h-.008v-.008Zm0-6h.008v.008h-.008v-.008Zm-3 6h.008v.008h-.008v-.008Zm0-6h.008v.008h-.008v-.008Z" />
          </svg>
        </div>
        <h1 className="text-2xl font-bold text-white mb-2">Deploy your AI agent</h1>
        <p className="text-zinc-500 text-sm mb-6">
          Provision a dedicated OpenClaw instance for your organization. This sets up a cloud server with your own AI agent.
        </p>
        {errorMessage && <p className="text-red-400 text-sm mb-4">{errorMessage}</p>}
        <button
          onClick={() => void startProvision()}
          disabled={provisioning}
          className="inline-flex items-center gap-2 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-medium px-5 py-2.5 rounded-lg transition-colors"
        >
          {provisioning ? (
            <>
              <div className="w-4 h-4 rounded-full border-2 border-white border-t-transparent animate-spin" />
              Provisioning...
            </>
          ) : (
            'Start provisioning'
          )}
        </button>
      </div>
    )
  }

  // ── Pending / Installing ───────────────────────────────────────────────
  if (status === 'pending' || status === 'installing') {
    return (
      <div className="max-w-lg mx-auto text-center">
        <div className="w-16 h-16 rounded-2xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center mx-auto mb-6">
          <div className="w-7 h-7 rounded-full border-2 border-indigo-400 border-t-transparent animate-spin" />
        </div>
        <h1 className="text-2xl font-bold text-white mb-2">
          {status === 'pending' ? 'Setting up your AI agent...' : 'Installing OpenClaw...'}
        </h1>
        <p className="text-zinc-500 text-sm">
          {status === 'pending'
            ? 'Reserving cloud resources. This will take a moment.'
            : 'Your agent is being configured. Usually takes 1–3 minutes.'}
        </p>
        {status === 'installing' && (
          <p className="mt-2 text-xs text-zinc-600" aria-live="polite">
            Checking every 15 seconds...
          </p>
        )}
      </div>
    )
  }

  // ── Running ───────────────────────────────────────────────────────────────
  if (status === 'running') {
    return (
      <div className="max-w-lg mx-auto text-center">
        <div className="w-16 h-16 rounded-2xl bg-green-500/10 border border-green-500/20 flex items-center justify-center mx-auto mb-4">
          <span className="relative flex h-3 w-3">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-green-400 opacity-75" />
            <span className="relative inline-flex h-3 w-3 rounded-full bg-green-500" />
          </span>
        </div>
        <h1 className="text-2xl font-bold text-white mb-2">Your agent is live</h1>
        <p className="text-zinc-500 text-sm mb-6">
          Your AI agent is running and ready to chat.
        </p>
        <a
          href="/chat"
          className="inline-flex items-center gap-2 bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-medium px-5 py-2.5 rounded-lg transition-colors"
        >
          Open chat
        </a>
      </div>
    )
  }

  // ── Error ─────────────────────────────────────────────────────────────────
  if (status === 'error') {
    return (
      <div className="max-w-lg mx-auto text-center">
        <div className="w-16 h-16 rounded-2xl bg-red-500/10 border border-red-500/20 flex items-center justify-center mx-auto mb-6">
          <span className="text-2xl">✕</span>
        </div>
        <h1 className="text-2xl font-bold text-white mb-2">Something went wrong</h1>
        {errorMessage && <p className="text-red-400 text-sm mb-3">{errorMessage}</p>}
        <p className="text-zinc-500 text-sm mb-6">
          If this keeps happening,{' '}
          <a href="mailto:support@kodi.so" className="text-indigo-400 hover:underline">
            contact support
          </a>
          .
        </p>
        <button
          onClick={() => void retryProvision()}
          disabled={provisioning}
          className="inline-flex items-center gap-2 bg-zinc-800 hover:bg-zinc-700 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors border border-zinc-700"
        >
          {provisioning ? (
            <>
              <div className="w-4 h-4 rounded-full border-2 border-white border-t-transparent animate-spin" />
              Retrying...
            </>
          ) : (
            'Try again'
          )}
        </button>
      </div>
    )
  }

  // ── Suspended ─────────────────────────────────────────────────────────────
  if (status === 'suspended') {
    return (
      <div className="max-w-lg mx-auto text-center">
        <div className="w-16 h-16 rounded-2xl bg-yellow-500/10 border border-yellow-500/20 flex items-center justify-center mx-auto mb-6">
          <span className="text-2xl">⏸</span>
        </div>
        <h1 className="text-2xl font-bold text-white mb-2">Agent suspended</h1>
        <p className="text-zinc-500 text-sm">
          Your agent has been suspended. Please{' '}
          <a href="mailto:support@kodi.so" className="text-indigo-400 hover:underline">
            contact support
          </a>{' '}
          to reactivate.
        </p>
      </div>
    )
  }

  return null
}
