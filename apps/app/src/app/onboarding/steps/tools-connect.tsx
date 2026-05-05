'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { CheckCircle2, Circle } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@kodi/ui/components/button'
import { Skeleton } from '@kodi/ui/components/skeleton'
import { cn } from '@kodi/ui/lib/utils'
import { trpc } from '@/lib/trpc'
import { useOnboarding } from '../lib/onboarding-context'

type CatalogItem = {
  slug: string
  name: string
  description: string | null
  logo: string | null
  supportTier: string
  connection: { status: string } | null
}

export function ToolsConnectStep() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const { orgId, selectedToolSlugs, connectedToolSlugs, setConnectedToolSlugs, isReady } =
    useOnboarding()

  const [catalog, setCatalog] = useState<CatalogItem[]>([])
  const [loading, setLoading] = useState(false)
  const [connecting, setConnecting] = useState<string | null>(null)
  const didHandleReturn = useRef(false)

  const fetchCatalog = useCallback(async () => {
    if (!orgId || selectedToolSlugs.length === 0) return
    setLoading(true)
    try {
      const result = await trpc.toolAccess.getCatalog.query({ orgId, limit: 60 })
      // Filter to only the selected tools, tier-1 first
      const filtered = result.items
        .filter((item) => selectedToolSlugs.includes(item.slug))
        .sort((a, b) => {
          if (a.supportTier === 'tier_1' && b.supportTier !== 'tier_1') return -1
          if (b.supportTier === 'tier_1' && a.supportTier !== 'tier_1') return 1
          return a.name.localeCompare(b.name)
        })
      setCatalog(filtered)
    } catch {
      toast.error('Failed to load tool status.')
    } finally {
      setLoading(false)
    }
  }, [orgId, selectedToolSlugs])

  // Handle return from Composio OAuth
  useEffect(() => {
    if (!isReady || didHandleReturn.current) return
    const connectionStatus = searchParams.get('connectionStatus')
    const appName = searchParams.get('appName')

    if (connectionStatus === 'success' && appName) {
      didHandleReturn.current = true
      // Briefly reload catalog to pick up the new connection
      void fetchCatalog().then(() => {
        toast.success(`${appName} connected`)
      })
      // Clear OAuth return params from URL without a navigation history entry
      const clean = new URLSearchParams(searchParams.toString())
      clean.delete('connectionStatus')
      clean.delete('appName')
      // Remove any OAuth params Composio may have forwarded
      for (const key of ['code', 'state', 'error', 'error_description']) {
        clean.delete(key)
      }
      router.replace(`?${clean.toString()}`)
    } else if (connectionStatus === 'error') {
      didHandleReturn.current = true
      toast.error(`Connection failed${appName ? ` for ${appName}` : ''}. Try again.`)
      const clean = new URLSearchParams(searchParams.toString())
      clean.delete('connectionStatus')
      clean.delete('appName')
      router.replace(`?${clean.toString()}`)
    }
  }, [isReady, searchParams, router, fetchCatalog])

  // Initial catalog load
  useEffect(() => {
    if (isReady && orgId) void fetchCatalog()
  }, [isReady, orgId, fetchCatalog])

  async function handleConnect(item: CatalogItem) {
    if (!orgId) return
    setConnecting(item.slug)
    try {
      const result = await trpc.toolAccess.createConnectLink.mutate({
        orgId,
        toolkitSlug: item.slug,
        returnPath: `/onboarding?step=tools-connect&connectionStatus=success&appName=${encodeURIComponent(item.name)}`,
      })
      const url = result.redirectUrl
      if (!url) {
        toast.error(`No OAuth URL returned for ${item.name}. Please try again.`)
        setConnecting(null)
        return
      }
      window.location.href = url
    } catch {
      toast.error(`Failed to start ${item.name} connection.`)
      setConnecting(null)
    }
  }

  function handleContinue() {
    // Capture currently connected tools from catalog into context
    const nowConnected = catalog
      .filter((item) => item.connection?.status === 'ACTIVE')
      .map((item) => item.slug)
    setConnectedToolSlugs(Array.from(new Set([...connectedToolSlugs, ...nowConnected])))
    router.push('?step=invite-team')
  }

  // Empty state — no tools selected
  if (isReady && selectedToolSlugs.length === 0) {
    return (
      <div className="space-y-8">
        <div className="space-y-1.5">
          <h1 className="text-2xl font-semibold tracking-tight">Connect your tools</h1>
        </div>
        <p className="text-sm text-muted-foreground">
          No tools selected — you can connect integrations any time from Settings.
        </p>
        <Button onClick={handleContinue} className="w-full">
          Continue
        </Button>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="space-y-1.5">
        <h1 className="text-2xl font-semibold tracking-tight">Connect your tools</h1>
        <p className="text-sm text-muted-foreground">
          Connect each integration so Kodi can work with it. You can connect more any time from
          Settings.
        </p>
      </div>

      {/* Tool rows */}
      <div className="space-y-2">
        {loading && catalog.length === 0
          ? Array.from({ length: selectedToolSlugs.length || 3 }).map((_, i) => (
              <Skeleton key={i} className="h-16 rounded-lg" />
            ))
          : catalog.map((item) => {
              const isConnected = item.connection?.status === 'ACTIVE'
              const isConnecting = connecting === item.slug

              return (
                <div
                  key={item.slug}
                  className="flex items-center gap-3 rounded-lg border border-border p-3"
                >
                  {/* Logo */}
                  <div className="h-9 w-9 shrink-0">
                    {item.logo ? (
                      <img
                        src={item.logo}
                        alt=""
                        className="h-9 w-9 rounded object-contain"
                      />
                    ) : (
                      <div className="flex h-9 w-9 items-center justify-center rounded bg-muted text-xs font-medium uppercase text-muted-foreground">
                        {item.name.slice(0, 2)}
                      </div>
                    )}
                  </div>

                  {/* Name + status */}
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{item.name}</p>
                    <div className="flex items-center gap-1.5 mt-0.5">
                      {isConnected ? (
                        <>
                          <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
                          <span className="text-xs text-emerald-600 dark:text-emerald-400">
                            Connected
                          </span>
                        </>
                      ) : (
                        <>
                          <Circle className="h-3.5 w-3.5 text-muted-foreground/50" />
                          <span className="text-xs text-muted-foreground">Not connected</span>
                        </>
                      )}
                    </div>
                  </div>

                  {/* Connect button */}
                  {!isConnected && (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => handleConnect(item)}
                      disabled={isConnecting}
                      className="shrink-0"
                    >
                      {isConnecting ? 'Opening…' : 'Connect'}
                    </Button>
                  )}
                </div>
              )
            })}
      </div>

      <Button onClick={handleContinue} className="w-full">
        Continue
      </Button>
    </div>
  )
}
