'use client'

import Link from 'next/link'
import { useDeferredValue, useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import {
  AlertTriangle,
  ArrowLeft,
  ExternalLink,
  Link2,
  RefreshCcw,
  Search,
  ShieldCheck,
} from 'lucide-react'
import {
  Alert,
  AlertDescription,
  Badge,
  Button,
  Input,
  Skeleton,
} from '@kodi/ui'
import { useOrg } from '@/lib/org-context'
import { trpc } from '@/lib/trpc'
import { SettingsLayout } from '../../_components/settings-layout'
import {
  formatIntegrationDate,
  getIntegrationStatusTone,
} from '../_lib/integrations'

type ToolAccessCatalog = Awaited<
  ReturnType<typeof trpc.toolAccess.getCatalog.query>
>
type ToolAccessItem = ToolAccessCatalog['items'][number]

const attentionStatuses = new Set(['FAILED', 'EXPIRED'])

function getToolkitStatus(
  item: ToolAccessItem,
  catalog: ToolAccessCatalog | null
) {
  if (item.connection?.status === 'ACTIVE') return 'Connected'
  if (item.connection && attentionStatuses.has(item.connection.status)) {
    return 'Attention needed'
  }
  if (
    item.connection?.status === 'INITIATED' ||
    item.connection?.status === 'INITIALIZING'
  ) {
    return 'Connecting'
  }
  if (!catalog?.featureFlags.toolAccess) return 'Feature off'
  if (!catalog?.setup.apiConfigured) return 'Needs setup'
  if (item.authMode === 'no_auth') return 'No auth needed'
  if (item.authMode === 'custom' && !item.canConnect) return 'Needs auth config'
  return 'Not connected'
}

function getConnectButtonLabel(
  item: ToolAccessItem,
  catalog: ToolAccessCatalog | null
) {
  if (item.connection?.status === 'ACTIVE') return 'Disconnect'
  if (item.authMode === 'no_auth') return 'No account required'
  if (!catalog?.featureFlags.toolAccess) return 'Feature off'
  if (!catalog?.setup.apiConfigured) return 'Needs setup'
  if (!item.canConnect) return 'Needs auth config'
  return 'Connect'
}

function canRunConnect(
  item: ToolAccessItem,
  catalog: ToolAccessCatalog | null
) {
  if (item.connection?.status === 'ACTIVE') return true
  if (item.authMode === 'no_auth') return false
  if (!catalog?.featureFlags.toolAccess) return false
  if (!catalog?.setup.apiConfigured) return false
  return item.canConnect
}

function formatAuthMode(item: ToolAccessItem) {
  switch (item.authMode) {
    case 'custom':
      return 'Custom auth config'
    case 'managed':
      return 'Composio managed auth'
    case 'no_auth':
      return 'No auth'
    default:
      return 'Unknown auth'
  }
}

export default function ToolAccessIntegrationPage() {
  const searchParams = useSearchParams()
  const { activeOrg } = useOrg()
  const [catalog, setCatalog] = useState<ToolAccessCatalog | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [actionKey, setActionKey] = useState<string | null>(null)
  const deferredSearch = useDeferredValue(search)

  const callbackStatus = searchParams.get('connectionStatus')
  const callbackAppName = searchParams.get('appName')

  async function loadCatalog(orgId: string, searchValue: string) {
    const result = await trpc.toolAccess.getCatalog.query({
      orgId,
      search: searchValue.trim() || undefined,
      limit: 24,
    })
    setCatalog(result)
    return result
  }

  useEffect(() => {
    if (!activeOrg) {
      setCatalog(null)
      setLoading(false)
      return
    }

    const orgId = activeOrg.orgId
    let cancelled = false
    setLoading(true)
    setError(null)

    async function load() {
      try {
        const result = await trpc.toolAccess.getCatalog.query({
          orgId,
          search: deferredSearch.trim() || undefined,
          limit: 24,
        })

        if (cancelled) return
        setCatalog(result)
      } catch (err) {
        if (cancelled) return
        setError(
          err instanceof Error
            ? err.message
            : 'Failed to load tool access integrations.'
        )
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    void load()
    return () => {
      cancelled = true
    }
  }, [activeOrg?.orgId, deferredSearch])

  const callbackBanner = useMemo(() => {
    if (!callbackStatus) return null

    const normalized = callbackStatus.toLowerCase()
    const appLabel = callbackAppName ?? 'This account'

    if (normalized === 'active' || normalized === 'connected') {
      return {
        tone: 'success' as const,
        message: `${appLabel} is connected. Refresh the list if it does not appear right away.`,
      }
    }

    if (normalized === 'initiated' || normalized === 'initializing') {
      return {
        tone: 'warning' as const,
        message: `${appLabel} is still finishing setup in Composio.`,
      }
    }

    return {
      tone: 'error' as const,
      message: `${appLabel} did not finish connecting. Try again from this page.`,
    }
  }, [callbackAppName, callbackStatus])

  async function refreshCatalog() {
    if (!activeOrg) return
    setActionKey('refresh')
    setError(null)

    try {
      await loadCatalog(activeOrg.orgId, deferredSearch)
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'Failed to refresh tool access integrations.'
      )
    } finally {
      setActionKey(null)
    }
  }

  async function connectToolkit(toolkitSlug: string) {
    if (!activeOrg) return
    setActionKey(`connect:${toolkitSlug}`)
    setError(null)

    try {
      const result = await trpc.toolAccess.createConnectLink.mutate({
        orgId: activeOrg.orgId,
        toolkitSlug,
        returnPath: '/settings/integrations/tool-access',
      })

      if (!result.redirectUrl) {
        throw new Error('Composio did not return a redirect URL.')
      }

      window.location.assign(result.redirectUrl)
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'Failed to start the connection flow.'
      )
      setActionKey(null)
    }
  }

  async function disconnectToolkit(connectedAccountId: string) {
    if (!activeOrg) return
    setActionKey(`disconnect:${connectedAccountId}`)
    setError(null)

    try {
      await trpc.toolAccess.disconnect.mutate({
        orgId: activeOrg.orgId,
        connectedAccountId,
      })
      await refreshCatalog()
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Failed to disconnect account.'
      )
      setActionKey(null)
    }
  }

  if (!activeOrg) {
    return (
      <SettingsLayout>
        <div className="flex items-center justify-center py-20">
          <Skeleton className="h-6 w-6 rounded-full bg-zinc-700" />
        </div>
      </SettingsLayout>
    )
  }

  return (
    <SettingsLayout>
      <div className="mx-auto max-w-6xl space-y-6">
        <Button
          asChild
          variant="ghost"
          className="w-fit gap-2 px-0 text-zinc-400 hover:bg-transparent hover:text-white"
        >
          <Link href="/settings/integrations">
            <ArrowLeft size={16} />
            Back to integrations
          </Link>
        </Button>

        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div className="space-y-2">
            <div className="flex items-center gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-2xl border border-zinc-800 bg-zinc-950 text-zinc-200">
                <Link2 size={20} />
              </div>
              <div>
                <h1 className="text-2xl font-semibold tracking-tight text-white">
                  Tool Access
                </h1>
                <p className="text-sm text-zinc-400">
                  Search the Composio catalog and connect the accounts you want
                  Kodi to use in {activeOrg.orgName}.
                </p>
              </div>
            </div>
          </div>

          <div className="flex flex-col gap-3 sm:flex-row">
            <div className="relative min-w-[18rem]">
              <Search
                size={16}
                className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500"
              />
              <Input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search integrations"
                className="h-11 border-zinc-800 bg-zinc-900 pl-10 text-white placeholder:text-zinc-500 focus-visible:ring-sky-500"
              />
            </div>
            <Button
              onClick={() => void refreshCatalog()}
              variant="ghost"
              className="gap-2 border border-zinc-800 bg-zinc-950 text-zinc-300 hover:bg-zinc-900 hover:text-white"
              disabled={loading || actionKey === 'refresh'}
            >
              <RefreshCcw
                size={16}
                className={actionKey === 'refresh' ? 'animate-spin' : ''}
              />
              Refresh
            </Button>
          </div>
        </div>

        {callbackBanner && (
          <Alert
            className={
              callbackBanner.tone === 'success'
                ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-200'
                : callbackBanner.tone === 'warning'
                  ? 'border-amber-500/30 bg-amber-500/10 text-amber-100'
                  : 'border-red-500/30 bg-red-500/10 text-red-200'
            }
          >
            <AlertDescription>{callbackBanner.message}</AlertDescription>
          </Alert>
        )}

        {error && (
          <Alert className="border-red-500/30 bg-red-500/10 text-red-200">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {catalog && !catalog.featureFlags.toolAccess && !loading && (
          <Alert className="border-amber-500/30 bg-amber-500/10 text-amber-100">
            <AlertDescription>
              <code className="rounded bg-zinc-950 px-1 py-0.5 text-zinc-200">
                KODI_FEATURE_TOOL_ACCESS
              </code>{' '}
              is off right now, so this page is browse-only until the feature
              flag is enabled.
            </AlertDescription>
          </Alert>
        )}

        {catalog && !catalog.setup.apiConfigured && !loading && (
          <Alert className="border-amber-500/30 bg-amber-500/10 text-amber-100">
            <AlertDescription>
              Composio is not configured in this environment yet. Add{' '}
              {catalog.setup.missing.join(', ') || 'COMPOSIO_API_KEY'} to the
              API environment before testing connections.
            </AlertDescription>
          </Alert>
        )}

        {catalog?.syncError && !loading && (
          <Alert className="border-amber-500/30 bg-amber-500/10 text-amber-100">
            <AlertDescription>{catalog.syncError}</AlertDescription>
          </Alert>
        )}

        {loading ? (
          <div className="grid gap-4 md:grid-cols-3">
            {[0, 1, 2].map((item) => (
              <div
                key={item}
                className="rounded-3xl border border-zinc-800 bg-zinc-900/60 p-6"
              >
                <Skeleton className="h-6 w-32 bg-zinc-800" />
                <Skeleton className="mt-3 h-4 w-40 bg-zinc-800" />
                <Skeleton className="mt-8 h-10 w-full bg-zinc-800" />
              </div>
            ))}
          </div>
        ) : (
          <>
            <div className="grid gap-4 md:grid-cols-3">
              <div className="rounded-3xl border border-zinc-800 bg-zinc-900/60 p-5">
                <p className="text-xs uppercase tracking-[0.18em] text-zinc-500">
                  Active connections
                </p>
                <p className="mt-4 text-3xl font-semibold text-white">
                  {catalog?.summary.activeCount ?? 0}
                </p>
                <p className="mt-2 text-sm text-zinc-400">
                  Accounts currently ready for agent use.
                </p>
              </div>

              <div className="rounded-3xl border border-zinc-800 bg-zinc-900/60 p-5">
                <p className="text-xs uppercase tracking-[0.18em] text-zinc-500">
                  Needs attention
                </p>
                <p className="mt-4 text-3xl font-semibold text-white">
                  {catalog?.summary.attentionCount ?? 0}
                </p>
                <p className="mt-2 text-sm text-zinc-400">
                  Connections that expired or failed in Composio.
                </p>
              </div>

              <div className="rounded-3xl border border-zinc-800 bg-zinc-900/60 p-5">
                <p className="text-xs uppercase tracking-[0.18em] text-zinc-500">
                  Saved accounts
                </p>
                <p className="mt-4 text-3xl font-semibold text-white">
                  {catalog?.summary.totalCount ?? 0}
                </p>
                <p className="mt-2 text-sm text-zinc-400">
                  Persisted user-to-tool associations in Kodi.
                </p>
              </div>
            </div>

            {catalog && catalog.items.length === 0 ? (
              <div className="rounded-3xl border border-dashed border-zinc-800 bg-zinc-950/50 p-8 text-sm text-zinc-400">
                No Composio integrations match “{search}”.
              </div>
            ) : (
              <div className="grid gap-4 xl:grid-cols-2">
                {catalog?.items.map((item) => {
                  const status = getToolkitStatus(item, catalog)
                  const connectLabel = getConnectButtonLabel(item, catalog)
                  const canRunPrimaryAction = canRunConnect(item, catalog)
                  const isDisconnecting =
                    actionKey ===
                    `disconnect:${item.connection?.connectedAccountId}`
                  const isConnecting = actionKey === `connect:${item.slug}`

                  return (
                    <div
                      key={item.slug}
                      className="rounded-[1.75rem] border border-zinc-800 bg-[linear-gradient(180deg,rgba(24,24,27,0.96),rgba(16,16,20,0.98))] p-6"
                    >
                      <div className="flex h-full flex-col gap-6">
                        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                          <div className="space-y-3">
                            <div className="flex items-center gap-3">
                              <div className="flex h-11 w-11 items-center justify-center rounded-2xl border border-zinc-800 bg-zinc-950 text-zinc-200">
                                <span className="text-sm font-semibold uppercase tracking-wide">
                                  {item.name.slice(0, 2)}
                                </span>
                              </div>
                              <div>
                                <h2 className="text-lg font-medium text-white">
                                  {item.name}
                                </h2>
                                <p className="text-sm text-zinc-400">
                                  {item.slug}
                                </p>
                              </div>
                            </div>

                            <p className="max-w-xl text-sm leading-6 text-zinc-400">
                              {item.description ?? 'No description available.'}
                            </p>
                          </div>

                          <div className="flex flex-wrap gap-2">
                            <Badge className={getIntegrationStatusTone(status)}>
                              {status}
                            </Badge>
                            <Badge className="border-zinc-700 bg-zinc-950 text-zinc-300">
                              {formatAuthMode(item)}
                            </Badge>
                            <Badge className="border-zinc-700 bg-zinc-950 text-zinc-300">
                              {item.supportTier.replace('_', ' ')}
                            </Badge>
                          </div>
                        </div>

                        <div className="grid gap-3 sm:grid-cols-2">
                          <div className="rounded-2xl border border-zinc-800 bg-zinc-950/70 p-4">
                            <div className="flex items-center gap-2 text-sm font-medium text-white">
                              <ShieldCheck
                                size={16}
                                className="text-zinc-400"
                              />
                              Connection
                            </div>
                            <p className="mt-3 text-sm leading-6 text-zinc-400">
                              {item.connection
                                ? item.connection.externalUserEmail ||
                                  item.connection.connectedAccountLabel ||
                                  'Connected account on file.'
                                : item.authMode === 'no_auth'
                                  ? 'This toolkit does not require an account.'
                                  : 'No connected account yet.'}
                            </p>
                            {item.connection && (
                              <p className="mt-2 text-xs text-zinc-500">
                                Last synced{' '}
                                {formatIntegrationDate(
                                  item.connection.updatedAt
                                )}
                              </p>
                            )}
                          </div>

                          <div className="rounded-2xl border border-zinc-800 bg-zinc-950/70 p-4">
                            <div className="flex items-center gap-2 text-sm font-medium text-white">
                              <AlertTriangle
                                size={16}
                                className="text-zinc-400"
                              />
                              Catalog metadata
                            </div>
                            <p className="mt-3 text-sm leading-6 text-zinc-400">
                              {item.toolsCount} tools, {item.triggersCount}{' '}
                              triggers
                              {item.categories.length > 0
                                ? `, ${item.categories
                                    .slice(0, 2)
                                    .map((category) => category.name)
                                    .join(', ')}`
                                : ''}
                              .
                            </p>
                          </div>
                        </div>

                        {item.connection?.errorMessage && (
                          <Alert className="border-red-500/30 bg-red-500/10 text-red-200">
                            <AlertDescription>
                              {item.connection.errorMessage}
                            </AlertDescription>
                          </Alert>
                        )}

                        <div className="flex flex-wrap gap-2">
                          {item.connection?.status === 'ACTIVE' ? (
                            <Button
                              onClick={() =>
                                void disconnectToolkit(
                                  item.connection!.connectedAccountId
                                )
                              }
                              variant="outline"
                              className="border-red-500/30 bg-red-500/10 text-red-200 hover:bg-red-500/20 hover:text-red-100"
                              disabled={actionKey !== null}
                            >
                              {isDisconnecting
                                ? 'Disconnecting...'
                                : 'Disconnect'}
                            </Button>
                          ) : (
                            <Button
                              onClick={() => void connectToolkit(item.slug)}
                              className="gap-2 bg-sky-500 text-white hover:bg-sky-400"
                              disabled={
                                !canRunPrimaryAction || actionKey !== null
                              }
                            >
                              <Link2 size={16} />
                              {isConnecting ? 'Connecting...' : connectLabel}
                            </Button>
                          )}

                          {item.appUrl && (
                            <Button
                              asChild
                              variant="ghost"
                              className="gap-2 border border-zinc-800 bg-zinc-950 text-zinc-300 hover:bg-zinc-900 hover:text-white"
                            >
                              <a
                                href={item.appUrl}
                                target="_blank"
                                rel="noreferrer"
                              >
                                Open app
                                <ExternalLink size={16} />
                              </a>
                            </Button>
                          )}
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </>
        )}
      </div>
    </SettingsLayout>
  )
}
