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
  const [status, setStatus] = useState<InstanceStatus>(
    initialData?.status ?? 'pending',
  )
  const [hostname, setHostname] = useState(initialData?.hostname ?? null)
  const [errorMessage, setErrorMessage] = useState(initialData?.errorMessage ?? null)
  const [copied, setCopied] = useState(false)
  const [hostnameBlurred, setHostnameBlurred] = useState(true)

  const instanceId = initialData?.id ?? ''
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const handleCopy = () => {
    if (hostname) {
      void navigator.clipboard.writeText(hostname)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
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
  }, [instanceId])

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

  // ── Pending ──────────────────────────────────────────────────────────────
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
      <div className="max-w-lg mx-auto">
        <div className="text-center mb-6">
          <div className="w-16 h-16 rounded-2xl bg-green-500/10 border border-green-500/20 flex items-center justify-center mx-auto mb-4">
            <span className="relative flex h-3 w-3">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-green-400 opacity-75" />
              <span className="relative inline-flex h-3 w-3 rounded-full bg-green-500" />
            </span>
          </div>
          <h1 className="text-2xl font-bold text-white">Your agent is live 🎉</h1>
        </div>

        {hostname ? (
          <div className="rounded-xl border border-green-500/20 bg-green-500/5 p-6">
            <h3 className="text-sm font-semibold text-white mb-4">Connect to your instance</h3>

            <div className="mb-4">
              <p className="text-xs text-zinc-500 mb-1">Hostname</p>
              <div className="flex items-center gap-2">
                <code
                  className={`flex-1 text-sm bg-zinc-800 rounded-lg px-3 py-2 text-zinc-300 font-mono transition-all ${hostnameBlurred ? 'blur-sm select-none' : ''}`}
                  aria-label="Instance hostname"
                >
                  {hostname}
                </code>
                <button
                  onClick={() => setHostnameBlurred(!hostnameBlurred)}
                  className="text-xs text-zinc-500 hover:text-zinc-300 transition-colors px-2 py-1.5 rounded border border-zinc-700 hover:border-zinc-500 shrink-0"
                  aria-label={hostnameBlurred ? 'Show hostname' : 'Hide hostname'}
                >
                  {hostnameBlurred ? 'Show' : 'Hide'}
                </button>
                <button
                  onClick={handleCopy}
                  className="text-xs text-zinc-500 hover:text-zinc-300 transition-colors px-2 py-1.5 rounded border border-zinc-700 hover:border-zinc-500 shrink-0"
                  aria-label="Copy hostname"
                >
                  {copied ? '✓ Copied' : 'Copy'}
                </button>
              </div>
            </div>

            <div className="rounded-lg bg-zinc-800/50 border border-zinc-700 p-4 text-sm text-zinc-400 space-y-1">
              <p className="font-medium text-zinc-300 mb-2">How to connect</p>
              <p>1. Open the OpenClaw app on your device.</p>
              <p>2. Go to <span className="text-zinc-300">Settings → Gateway</span>.</p>
              <p>3. Enter the hostname above and connect.</p>
            </div>
          </div>
        ) : (
          <p className="text-zinc-500 text-center text-sm">Your agent is running.</p>
        )}
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
        <a
          href="/provision"
          className="inline-flex items-center gap-2 bg-zinc-800 hover:bg-zinc-700 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors border border-zinc-700"
        >
          Try again
        </a>
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
