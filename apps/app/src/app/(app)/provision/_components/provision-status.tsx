'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
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

// ─── Status Icon ─────────────────────────────────────────────────────────────

function StatusIcon({ status }: { status: InstanceStatus }) {
  if (status === 'running') {
    return (
      <div className="w-16 h-16 rounded-2xl bg-green-500/10 border border-green-500/20 flex items-center justify-center mx-auto mb-4">
        <span className="text-2xl">✅</span>
      </div>
    )
  }
  if (status === 'error') {
    return (
      <div className="w-16 h-16 rounded-2xl bg-red-500/10 border border-red-500/20 flex items-center justify-center mx-auto mb-4">
        <span className="text-2xl">❌</span>
      </div>
    )
  }
  if (status === 'suspended') {
    return (
      <div className="w-16 h-16 rounded-2xl bg-yellow-500/10 border border-yellow-500/20 flex items-center justify-center mx-auto mb-4">
        <span className="text-2xl">⏸️</span>
      </div>
    )
  }
  // pending / installing
  return (
    <div className="w-16 h-16 rounded-2xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center mx-auto mb-4">
      <span className="text-2xl animate-spin inline-block">⚙️</span>
    </div>
  )
}

// ─── Running Card ─────────────────────────────────────────────────────────────

function RunningCard({ hostname }: { hostname: string }) {
  const [copied, setCopied] = useState(false)
  const [blurred, setBlurred] = useState(true)

  const deepLink = `openclaw://connect?host=${encodeURIComponent(hostname)}`

  const handleCopy = () => {
    void navigator.clipboard.writeText(hostname)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div className="mt-6 rounded-xl border border-green-500/20 bg-green-500/5 p-6 text-left">
      <h3 className="text-lg font-semibold text-white mb-4">Your AI Agent is Ready 🎉</h3>

      <div className="space-y-3">
        <div>
          <p className="text-xs text-zinc-500 mb-1">Hostname</p>
          <div className="flex items-center gap-2">
            <code
              className={`flex-1 text-sm bg-zinc-800 rounded-lg px-3 py-2 text-zinc-300 font-mono transition-all ${blurred ? 'blur-sm select-none' : ''}`}
              aria-label="Instance hostname"
            >
              {hostname}
            </code>
            <button
              onClick={() => setBlurred(!blurred)}
              className="text-xs text-zinc-500 hover:text-zinc-300 transition-colors px-2 py-1 rounded border border-zinc-700 hover:border-zinc-500"
              aria-label={blurred ? 'Show hostname' : 'Hide hostname'}
            >
              {blurred ? 'Show' : 'Hide'}
            </button>
            <button
              onClick={handleCopy}
              className="text-xs text-zinc-500 hover:text-zinc-300 transition-colors px-2 py-1 rounded border border-zinc-700 hover:border-zinc-500"
              aria-label="Copy hostname"
            >
              {copied ? '✓ Copied' : 'Copy'}
            </button>
          </div>
        </div>

        <div className="pt-2">
          <p className="text-xs text-zinc-500 mb-2">Connect from your device</p>
          <a
            href={deepLink}
            className="inline-flex items-center gap-2 bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors"
            aria-label="Open in OpenClaw app"
          >
            🔗 Connect with OpenClaw
          </a>
        </div>
      </div>
    </div>
  )
}

// ─── Polling Wrapper ──────────────────────────────────────────────────────────

function PollingWrapper({
  instanceId,
  onStatusUpdate,
  active,
}: {
  instanceId: string
  onStatusUpdate: (status: InstanceStatus) => void
  active: boolean
}) {
  const pollRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const poll = useCallback(async () => {
    if (!active) return
    try {
      const result = await trpc.instance.checkHealth.mutate({ instanceId })
      onStatusUpdate(result.status as InstanceStatus)
    } catch (e) {
      console.error('[provision] Health check failed:', e)
    }
  }, [instanceId, onStatusUpdate, active])

  useEffect(() => {
    if (!active) return

    // Poll every 15s
    pollRef.current = setInterval(() => {
      void poll()
    }, 15000)

    // Also poll immediately
    void poll()

    return () => {
      if (pollRef.current) clearInterval(pollRef.current)
    }
  }, [active, poll])

  return null
}

// ─── Main Component ──────────────────────────────────────────────────────────

export function ProvisionStatus({
  orgId,
  initialData,
}: {
  orgId: string
  initialData: StatusData | null
}) {
  const [status, setStatus] = useState<InstanceStatus>(
    (initialData?.status as InstanceStatus) ?? 'pending',
  )
  const [hostname, setHostname] = useState(initialData?.hostname ?? null)
  const [errorMessage, setErrorMessage] = useState(initialData?.errorMessage ?? null)
  const [instanceId] = useState(initialData?.id ?? '')

  const handleStatusUpdate = useCallback((newStatus: InstanceStatus) => {
    setStatus(newStatus)
  }, [])

  const isPolling = status === 'installing'

  return (
    <div className="max-w-lg mx-auto">
      <div className="text-center">
        <StatusIcon status={status} />

        {status === 'pending' && (
          <>
            <h1 className="text-2xl font-bold text-white mb-2">Setting up your AI agent...</h1>
            <p className="text-zinc-500">Reserving cloud resources. This will take a moment.</p>
          </>
        )}

        {status === 'installing' && (
          <>
            <h1 className="text-2xl font-bold text-white mb-2">Installing OpenClaw...</h1>
            <p className="text-zinc-500">
              Your agent is being configured. Usually takes 1–3 minutes.
            </p>
            <p className="mt-2 text-xs text-zinc-600" aria-live="polite">
              Checking every 15 seconds...
            </p>
          </>
        )}

        {status === 'running' && hostname && (
          <>
            <h1 className="text-2xl font-bold text-white mb-2">Agent is Live!</h1>
            <RunningCard hostname={hostname} />
          </>
        )}

        {status === 'running' && !hostname && (
          <>
            <h1 className="text-2xl font-bold text-white mb-2">Agent is Live!</h1>
            <p className="text-zinc-500">Your agent is running.</p>
          </>
        )}

        {status === 'error' && (
          <>
            <h1 className="text-2xl font-bold text-white mb-2">Something went wrong</h1>
            {errorMessage && (
              <p className="text-red-400 text-sm mb-4">{errorMessage}</p>
            )}
            <p className="text-zinc-500 text-sm mb-4">
              If this keeps happening, please{' '}
              <a href="mailto:support@kodi.so" className="text-indigo-400 hover:underline">
                contact support
              </a>
              .
            </p>
            <a
              href="/provision"
              className="inline-flex items-center gap-2 bg-zinc-800 hover:bg-zinc-700 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors border border-zinc-700"
              aria-label="Retry provisioning check"
            >
              🔄 Retry
            </a>
          </>
        )}

        {status === 'suspended' && (
          <>
            <h1 className="text-2xl font-bold text-white mb-2">Agent Suspended</h1>
            <p className="text-zinc-500">
              Your agent has been suspended. Please{' '}
              <a href="mailto:support@kodi.so" className="text-indigo-400 hover:underline">
                contact support
              </a>{' '}
              to reactivate.
            </p>
          </>
        )}
      </div>

      {/* Active polling while installing */}
      {instanceId && (
        <PollingWrapper
          instanceId={instanceId}
          onStatusUpdate={handleStatusUpdate}
          active={isPolling}
        />
      )}
    </div>
  )
}
