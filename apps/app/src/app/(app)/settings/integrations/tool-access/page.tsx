'use client'

import Link from 'next/link'
import { useDeferredValue, useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import {
  AlertTriangle,
  ArrowLeft,
  BadgeCheck,
  ExternalLink,
  KeyRound,
  Layers3,
  Link2,
  RefreshCcw,
  Search,
  ShieldCheck,
  Sparkles,
  Workflow,
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
type ToolAccessFilter = 'all' | 'priority' | 'connected' | 'attention' | 'setup'
type ToolkitSection = {
  key: string
  title: string
  description: string
  items: ToolAccessItem[]
}

const attentionStatuses = new Set(['FAILED', 'EXPIRED'])

const filterLabels: Record<ToolAccessFilter, string> = {
  all: 'All',
  priority: 'First wave',
  connected: 'Connected',
  attention: 'Needs attention',
  setup: 'Needs setup',
}

function getToolkitMonogram(name: string) {
  const letters = name
    .split(/[\s_-]+/)
    .map((part) => part[0])
    .filter(Boolean)
    .slice(0, 2)
    .join('')

  return letters.toUpperCase() || name.slice(0, 2).toUpperCase()
}

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
      return 'Custom auth'
    case 'managed':
      return 'Managed auth'
    case 'no_auth':
      return 'No auth'
    default:
      return 'Unknown auth'
  }
}

function formatSupportTier(item: ToolAccessItem) {
  switch (item.supportTier) {
    case 'tier_1':
      return 'First wave'
    case 'tier_2':
      return 'Expanded'
    default:
      return 'Catalog'
  }
}

function formatScope(scope: string) {
  const withoutOrigin = scope.replace(/^https?:\/\/[^/]+\//, '')
  if (withoutOrigin.length <= 26) return withoutOrigin
  return `${withoutOrigin.slice(0, 26)}…`
}

function getCapabilitySummary(item: ToolAccessItem) {
  const inventory =
    item.triggersCount > 0
      ? `${item.toolsCount} tools and ${item.triggersCount} triggers`
      : `${item.toolsCount} tools`

  if (item.categories.length === 0) {
    return `${inventory} surfaced through the Composio catalog.`
  }

  return `${inventory} across ${item.categories
    .slice(0, 3)
    .map((category) => category.name)
    .join(', ')}.`
}

function matchesFilter(
  item: ToolAccessItem,
  filter: ToolAccessFilter,
  catalog: ToolAccessCatalog | null
) {
  const status = getToolkitStatus(item, catalog)

  switch (filter) {
    case 'priority':
      return item.supportTier === 'tier_1'
    case 'connected':
      return item.connection?.status === 'ACTIVE'
    case 'attention':
      return (
        item.connection !== null &&
        attentionStatuses.has(item.connection.status)
      )
    case 'setup':
      return (
        status === 'Needs setup' ||
        status === 'Needs auth config' ||
        status === 'Feature off'
      )
    default:
      return true
  }
}

function getStatusRank(
  item: ToolAccessItem,
  catalog: ToolAccessCatalog | null
) {
  switch (getToolkitStatus(item, catalog)) {
    case 'Connected':
      return 0
    case 'Attention needed':
      return 1
    case 'Connecting':
      return 2
    case 'Not connected':
      return 3
    case 'No auth needed':
      return 4
    case 'Needs auth config':
      return 5
    case 'Needs setup':
      return 6
    case 'Feature off':
      return 7
    default:
      return 8
  }
}

function sortItems(items: ToolAccessItem[], catalog: ToolAccessCatalog | null) {
  return [...items].sort((left, right) => {
    const rank = getStatusRank(left, catalog) - getStatusRank(right, catalog)
    if (rank !== 0) return rank
    return left.name.localeCompare(right.name)
  })
}

function buildSections(
  items: ToolAccessItem[],
  filter: ToolAccessFilter
): ToolkitSection[] {
  if (filter !== 'all') {
    const descriptions: Record<ToolAccessFilter, string> = {
      all: '',
      priority: 'The curated launch set Kodi should feel strongest on first.',
      connected: 'Accounts that are already healthy enough for agent use.',
      attention:
        'Connections that need review before they should be trusted again.',
      setup:
        'Toolkits blocked on environment setup, auth config, or feature gating.',
    }

    return items.length === 0
      ? []
      : [
          {
            key: filter,
            title: filterLabels[filter],
            description: descriptions[filter],
            items,
          },
        ]
  }

  const attention = items.filter(
    (item) =>
      item.connection?.status && attentionStatuses.has(item.connection.status)
  )
  const priority = items.filter(
    (item) =>
      item.supportTier === 'tier_1' &&
      !attention.some((candidate) => candidate.slug === item.slug)
  )
  const catalog = items.filter(
    (item) =>
      item.supportTier !== 'tier_1' &&
      !attention.some((candidate) => candidate.slug === item.slug)
  )

  return [
    {
      key: 'attention',
      title: 'Needs attention',
      description: 'Fix these accounts first so the runtime stays trustworthy.',
      items: attention,
    },
    {
      key: 'priority',
      title: 'First-wave tools',
      description:
        'The curated launch set for meetings, follow-through, and team execution.',
      items: priority,
    },
    {
      key: 'catalog',
      title: 'More from Composio',
      description:
        'The broader integration catalog stays discoverable, but support depth varies.',
      items: catalog,
    },
  ].filter((section) => section.items.length > 0)
}

function getHeroState(catalog: ToolAccessCatalog | null) {
  if (!catalog) {
    return {
      label: 'Loading catalog',
      tone: 'border-zinc-700 bg-zinc-900 text-zinc-300',
      detail:
        'Fetching the latest connected-account state from Kodi and Composio.',
    }
  }

  if (!catalog.setup.apiConfigured) {
    return {
      label: 'Needs API setup',
      tone: 'border-amber-500/20 bg-amber-500/10 text-amber-200',
      detail: 'Composio is not configured in this environment yet.',
    }
  }

  if (!catalog.featureFlags.toolAccess) {
    return {
      label: 'Browse only',
      tone: 'border-amber-500/20 bg-amber-500/10 text-amber-200',
      detail:
        'The feature flag is off, so users can browse but not connect from this page.',
    }
  }

  if (catalog.summary.attentionCount > 0) {
    return {
      label: 'Review connections',
      tone: 'border-red-500/20 bg-red-500/10 text-red-200',
      detail:
        'Some accounts expired or failed and should be checked before use.',
    }
  }

  if (catalog.summary.activeCount > 0) {
    return {
      label: 'Ready for agent use',
      tone: 'border-emerald-500/20 bg-emerald-500/10 text-emerald-300',
      detail:
        'Healthy accounts are on file and ready for later runtime scoping.',
    }
  }

  return {
    label: 'Ready to connect',
    tone: 'border-sky-500/20 bg-sky-500/10 text-sky-200',
    detail:
      'Browse the first-wave catalog and start linking the accounts you rely on.',
  }
}

function ToolkitCard({
  item,
  catalog,
  actionKey,
  onConnect,
  onDisconnect,
}: {
  item: ToolAccessItem
  catalog: ToolAccessCatalog | null
  actionKey: string | null
  onConnect: (toolkitSlug: string) => Promise<void>
  onDisconnect: (connectedAccountId: string) => Promise<void>
}) {
  const status = getToolkitStatus(item, catalog)
  const connectLabel = getConnectButtonLabel(item, catalog)
  const canRunPrimaryAction = canRunConnect(item, catalog)
  const isDisconnecting =
    actionKey === `disconnect:${item.connection?.connectedAccountId}`
  const isConnecting = actionKey === `connect:${item.slug}`
  const scopePreview = item.connection?.scopes.slice(0, 3) ?? []
  const remainingScopes = Math.max(
    (item.connection?.scopes.length ?? 0) - scopePreview.length,
    0
  )

  return (
    <article className="group overflow-hidden rounded-[1.75rem] border border-zinc-800 bg-[linear-gradient(180deg,rgba(21,23,31,0.98),rgba(10,11,17,1))] p-6 transition hover:-translate-y-0.5 hover:border-zinc-700">
      <div className="flex flex-col gap-6">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
          <div className="space-y-4">
            <div className="flex items-start gap-4">
              <div className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-2xl border border-zinc-800 bg-[linear-gradient(180deg,rgba(55,65,81,0.22),rgba(24,24,27,0.92))] text-sm font-semibold uppercase tracking-[0.18em] text-zinc-200">
                {getToolkitMonogram(item.name)}
              </div>
              <div className="space-y-2">
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="text-lg font-medium text-white">
                    {item.name}
                  </h2>
                  <Badge className={getIntegrationStatusTone(status)}>
                    {status}
                  </Badge>
                </div>
                <div className="flex flex-wrap gap-2 text-xs text-zinc-500">
                  <span>{item.slug}</span>
                  {item.categories.slice(0, 2).map((category) => (
                    <span key={category.slug}>{category.name}</span>
                  ))}
                </div>
              </div>
            </div>

            <p className="max-w-2xl text-sm leading-7 text-zinc-400">
              {item.description ??
                'No provider description is available yet for this toolkit.'}
            </p>
          </div>

          <div className="flex flex-wrap gap-2 xl:max-w-[14rem] xl:justify-end">
            <Badge className="border-zinc-700 bg-zinc-950 text-zinc-300">
              {formatSupportTier(item)}
            </Badge>
            <Badge className="border-zinc-700 bg-zinc-950 text-zinc-300">
              {formatAuthMode(item)}
            </Badge>
          </div>
        </div>

        <div className="grid gap-3 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,0.85fr)]">
          <div className="rounded-[1.25rem] border border-zinc-800 bg-zinc-950/70 p-4">
            <div className="flex items-center gap-2 text-sm font-medium text-white">
              <ShieldCheck size={16} className="text-zinc-400" />
              Identity and access
            </div>
            <p className="mt-3 text-sm leading-6 text-zinc-300">
              {item.connection
                ? item.connection.externalUserEmail ||
                  item.connection.connectedAccountLabel ||
                  'A connected identity is already on file for this toolkit.'
                : item.authMode === 'no_auth'
                  ? 'This toolkit does not require a connected account.'
                  : 'No connected identity yet. Link an account before Kodi can use it later.'}
            </p>

            <div className="mt-3 flex flex-wrap gap-2">
              {item.connectionCount > 1 && (
                <Badge className="border-zinc-700 bg-zinc-900 text-zinc-300">
                  {item.connectionCount} identities on file
                </Badge>
              )}
              {scopePreview.map((scope) => (
                <Badge
                  key={scope}
                  className="max-w-full border-zinc-700 bg-zinc-900 text-zinc-300"
                >
                  {formatScope(scope)}
                </Badge>
              ))}
              {remainingScopes > 0 && (
                <Badge className="border-zinc-700 bg-zinc-900 text-zinc-300">
                  +{remainingScopes} more scopes
                </Badge>
              )}
            </div>

            {(item.connection?.lastValidatedAt ||
              item.connection?.updatedAt) && (
              <div className="mt-3 flex flex-wrap gap-4 text-xs text-zinc-500">
                {item.connection?.lastValidatedAt && (
                  <span>
                    Validated{' '}
                    {formatIntegrationDate(item.connection.lastValidatedAt)}
                  </span>
                )}
                {item.connection?.updatedAt && (
                  <span>
                    Updated {formatIntegrationDate(item.connection.updatedAt)}
                  </span>
                )}
              </div>
            )}
          </div>

          <div className="rounded-[1.25rem] border border-zinc-800 bg-zinc-950/70 p-4">
            <div className="flex items-center gap-2 text-sm font-medium text-white">
              <Layers3 size={16} className="text-zinc-400" />
              What Kodi sees
            </div>
            <p className="mt-3 text-sm leading-6 text-zinc-300">
              {getCapabilitySummary(item)}
            </p>
            <div className="mt-3 flex flex-wrap gap-2 text-xs text-zinc-400">
              <span className="rounded-full border border-zinc-800 bg-zinc-900 px-2.5 py-1">
                {item.toolsCount} tools
              </span>
              <span className="rounded-full border border-zinc-800 bg-zinc-900 px-2.5 py-1">
                {item.triggersCount} triggers
              </span>
              {item.categories.slice(0, 3).map((category) => (
                <span
                  key={category.slug}
                  className="rounded-full border border-zinc-800 bg-zinc-900 px-2.5 py-1"
                >
                  {category.name}
                </span>
              ))}
            </div>
          </div>
        </div>

        {item.connection?.errorMessage && (
          <Alert className="border-red-500/30 bg-red-500/10 text-red-200">
            <AlertDescription>{item.connection.errorMessage}</AlertDescription>
          </Alert>
        )}

        <div className="flex flex-col gap-3 border-t border-zinc-800/80 pt-4 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-xs leading-6 text-zinc-500">
            {item.connection
              ? 'Kodi stores the connected account state locally for future policy and runtime decisions.'
              : 'Connections start in Kodi now and are scoped more tightly at runtime later.'}
          </p>

          <div className="flex flex-wrap gap-2">
            {item.connection?.status === 'ACTIVE' ? (
              <Button
                onClick={() =>
                  void onDisconnect(item.connection!.connectedAccountId)
                }
                variant="outline"
                className="border-red-500/30 bg-red-500/10 text-red-200 hover:bg-red-500/20 hover:text-red-100"
                disabled={actionKey !== null}
              >
                {isDisconnecting ? 'Disconnecting...' : 'Disconnect'}
              </Button>
            ) : (
              <Button
                onClick={() => void onConnect(item.slug)}
                className="gap-2 bg-sky-500 text-white hover:bg-sky-400"
                disabled={!canRunPrimaryAction || actionKey !== null}
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
                <a href={item.appUrl} target="_blank" rel="noreferrer">
                  Open app
                  <ExternalLink size={16} />
                </a>
              </Button>
            )}
          </div>
        </div>
      </div>
    </article>
  )
}

export default function ToolAccessIntegrationPage() {
  const searchParams = useSearchParams()
  const { activeOrg } = useOrg()
  const [catalog, setCatalog] = useState<ToolAccessCatalog | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState<ToolAccessFilter>('all')
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
        message: `${appLabel} is connected. Refresh the page if the status does not appear immediately.`,
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

  const filteredItems = useMemo(() => {
    const items = catalog?.items ?? []
    return sortItems(
      items.filter((item) => matchesFilter(item, filter, catalog)),
      catalog
    )
  }, [catalog, filter])

  const sections = useMemo(
    () => buildSections(filteredItems, filter),
    [filteredItems, filter]
  )

  const heroState = useMemo(() => getHeroState(catalog), [catalog])

  const filterCounts = useMemo(() => {
    const items = catalog?.items ?? []

    return {
      all: items.length,
      priority: items.filter((item) => matchesFilter(item, 'priority', catalog))
        .length,
      connected: items.filter((item) =>
        matchesFilter(item, 'connected', catalog)
      ).length,
      attention: items.filter((item) =>
        matchesFilter(item, 'attention', catalog)
      ).length,
      setup: items.filter((item) => matchesFilter(item, 'setup', catalog))
        .length,
    }
  }, [catalog])

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
      <div className="mx-auto max-w-6xl space-y-6 pb-8">
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

        <section className="overflow-hidden rounded-[2rem] border border-zinc-800 bg-[radial-gradient(circle_at_top_left,rgba(70,124,120,0.22),transparent_38%),linear-gradient(180deg,rgba(22,24,31,0.98),rgba(10,11,16,1))]">
          <div className="grid gap-6 p-6 lg:grid-cols-[minmax(0,1.15fr)_minmax(18rem,0.85fr)] lg:p-8">
            <div className="space-y-5">
              <div className="flex flex-wrap gap-2">
                <Badge className={heroState.tone}>{heroState.label}</Badge>
                <Badge className="border-zinc-700 bg-zinc-950 text-zinc-300">
                  {activeOrg.orgName}
                </Badge>
                <Badge className="border-zinc-700 bg-zinc-950 text-zinc-300 capitalize">
                  {activeOrg.role}
                </Badge>
              </div>

              <div className="space-y-3">
                <p className="text-xs uppercase tracking-[0.22em] text-zinc-500">
                  Connection manager
                </p>
                <h1 className="max-w-3xl text-3xl font-semibold tracking-tight text-white sm:text-[2.35rem]">
                  Connect the tools your agent can act through.
                </h1>
                <p className="max-w-2xl text-sm leading-7 text-zinc-300">
                  Search the Composio catalog, link the identities you actually
                  use, and keep a clean line between discovery, connection
                  state, and later runtime access for {activeOrg.orgName}.
                </p>
              </div>

              <p className="max-w-2xl text-sm text-zinc-400">
                {heroState.detail}
              </p>

              <div className="flex flex-wrap gap-3 text-sm text-zinc-300">
                <div className="flex items-center gap-2 rounded-full border border-zinc-800 bg-zinc-950/70 px-3 py-2">
                  <ShieldCheck size={15} className="text-emerald-300" />
                  User accounts stay user-scoped
                </div>
                <div className="flex items-center gap-2 rounded-full border border-zinc-800 bg-zinc-950/70 px-3 py-2">
                  <Workflow size={15} className="text-sky-300" />
                  Runtime access stays request-scoped
                </div>
                <div className="flex items-center gap-2 rounded-full border border-zinc-800 bg-zinc-950/70 px-3 py-2">
                  <KeyRound size={15} className="text-amber-300" />
                  Org policy comes next in Phase 2
                </div>
              </div>
            </div>

            <div className="grid gap-3">
              <div className="rounded-[1.5rem] border border-zinc-800 bg-zinc-950/75 p-5">
                <div className="flex items-center justify-between gap-3">
                  <p className="text-xs uppercase tracking-[0.18em] text-zinc-500">
                    Workspace readiness
                  </p>
                  <Badge className="border-zinc-700 bg-zinc-900 text-zinc-300">
                    {catalog?.summary.activeCount ?? 0} active
                  </Badge>
                </div>

                <div className="mt-4 space-y-3 text-sm">
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-zinc-400">Connected now</span>
                    <span className="font-medium text-white">
                      {catalog?.summary.activeCount ?? 0}
                    </span>
                  </div>
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-zinc-400">Needs attention</span>
                    <span className="font-medium text-white">
                      {catalog?.summary.attentionCount ?? 0}
                    </span>
                  </div>
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-zinc-400">Saved identities</span>
                    <span className="font-medium text-white">
                      {catalog?.summary.totalCount ?? 0}
                    </span>
                  </div>
                </div>
              </div>

              <div className="rounded-[1.5rem] border border-zinc-800 bg-zinc-950/75 p-5">
                <p className="text-xs uppercase tracking-[0.18em] text-zinc-500">
                  Environment
                </p>

                <div className="mt-4 space-y-3 text-sm text-zinc-300">
                  <div className="flex items-start gap-2">
                    <BadgeCheck size={16} className="mt-0.5 text-zinc-500" />
                    <div>
                      <p className="text-white">Feature gate</p>
                      <p className="text-zinc-400">
                        {catalog?.featureFlags.toolAccess
                          ? 'Enabled for real connections.'
                          : 'Off right now, so this page is browse-only.'}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-start gap-2">
                    <Sparkles size={16} className="mt-0.5 text-zinc-500" />
                    <div>
                      <p className="text-white">Composio API</p>
                      <p className="text-zinc-400">
                        {catalog?.setup.apiConfigured
                          ? 'Configured and ready to return the live catalog.'
                          : 'Missing required API environment variables.'}
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

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
              is off right now, so users can browse the catalog but cannot start
              new connections from this environment.
            </AlertDescription>
          </Alert>
        )}

        {catalog?.syncError && !loading && (
          <Alert className="border-amber-500/30 bg-amber-500/10 text-amber-100">
            <AlertDescription>{catalog.syncError}</AlertDescription>
          </Alert>
        )}

        <section className="rounded-[1.75rem] border border-zinc-800 bg-[linear-gradient(180deg,rgba(18,20,28,0.96),rgba(11,12,18,0.98))] p-4 sm:p-5">
          <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
            <div className="space-y-1">
              <p className="text-sm font-medium text-white">
                Browse and filter the catalog
              </p>
              <p className="text-sm text-zinc-400">
                {filterCounts[filter]} results for{' '}
                {filterLabels[filter].toLowerCase()}
                {deferredSearch ? ` matching “${deferredSearch}”` : ''}.
              </p>
            </div>

            <div className="flex w-full flex-col gap-3 xl:max-w-3xl">
              <div className="flex flex-col gap-3 sm:flex-row">
                <div className="relative flex-1">
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

              <div className="flex flex-wrap gap-2">
                {(Object.keys(filterLabels) as ToolAccessFilter[]).map(
                  (value) => (
                    <button
                      key={value}
                      onClick={() => setFilter(value)}
                      className={`rounded-full border px-3 py-2 text-sm transition ${
                        filter === value
                          ? 'border-zinc-600 bg-zinc-100 text-zinc-950'
                          : 'border-zinc-800 bg-zinc-950 text-zinc-300 hover:border-zinc-700 hover:text-white'
                      }`}
                    >
                      {filterLabels[value]}{' '}
                      <span
                        className={
                          filter === value ? 'text-zinc-600' : 'text-zinc-500'
                        }
                      >
                        {filterCounts[value]}
                      </span>
                    </button>
                  )
                )}
              </div>
            </div>
          </div>
        </section>

        {loading ? (
          <div className="grid gap-4 xl:grid-cols-2">
            {[0, 1, 2, 3].map((item) => (
              <div
                key={item}
                className="rounded-[1.75rem] border border-zinc-800 bg-zinc-900/60 p-6"
              >
                <Skeleton className="h-6 w-40 bg-zinc-800" />
                <Skeleton className="mt-3 h-4 w-48 bg-zinc-800" />
                <Skeleton className="mt-6 h-24 w-full bg-zinc-800" />
                <Skeleton className="mt-3 h-10 w-40 bg-zinc-800" />
              </div>
            ))}
          </div>
        ) : catalog && !catalog.setup.apiConfigured ? (
          <section className="rounded-[1.75rem] border border-zinc-800 bg-[linear-gradient(180deg,rgba(33,25,12,0.55),rgba(15,12,7,0.98))] p-6 sm:p-7">
            <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
              <div className="space-y-4">
                <p className="text-xs uppercase tracking-[0.22em] text-amber-200/70">
                  Environment setup
                </p>
                <div className="space-y-2">
                  <h2 className="text-2xl font-medium text-white">
                    Composio is not configured in this environment yet.
                  </h2>
                  <p className="max-w-2xl text-sm leading-7 text-amber-50/80">
                    Add the missing API variables below, then refresh this page.
                    The connection manager is ready, but the live catalog cannot
                    load until Composio is available to the API process.
                  </p>
                </div>

                <div className="flex flex-wrap gap-2">
                  {(catalog.setup.missing.length > 0
                    ? catalog.setup.missing
                    : ['COMPOSIO_API_KEY']
                  ).map((name) => (
                    <code
                      key={name}
                      className="rounded-full border border-amber-400/20 bg-black/20 px-3 py-1.5 text-xs text-amber-100"
                    >
                      {name}
                    </code>
                  ))}
                </div>
              </div>

              <div className="rounded-[1.5rem] border border-amber-400/10 bg-black/15 p-5">
                <p className="text-sm font-medium text-white">Next steps</p>
                <div className="mt-4 space-y-3 text-sm text-amber-50/80">
                  <p>1. Add the missing values to `apps/api/.env`.</p>
                  <p>2. Restart the API so env validation re-runs.</p>
                  <p>3. Refresh this page to load the live toolkit catalog.</p>
                </div>
              </div>
            </div>
          </section>
        ) : filteredItems.length === 0 ? (
          <section className="rounded-[1.75rem] border border-dashed border-zinc-800 bg-zinc-950/40 p-8 text-sm text-zinc-400">
            <p className="text-base font-medium text-white">
              No matching tools.
            </p>
            <p className="mt-2 max-w-xl leading-7">
              Nothing matches the current search and filter combination. Try a
              broader search, switch back to the full catalog, or refresh if you
              just completed a connection flow.
            </p>
          </section>
        ) : (
          <div className="space-y-8">
            {sections.map((section) => (
              <section key={section.key} className="space-y-4">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
                  <div className="space-y-1">
                    <h2 className="text-lg font-medium text-white">
                      {section.title}
                    </h2>
                    <p className="text-sm text-zinc-400">
                      {section.description}
                    </p>
                  </div>
                  <Badge className="w-fit border-zinc-700 bg-zinc-950 text-zinc-300">
                    {section.items.length} tools
                  </Badge>
                </div>

                <div className="grid gap-4 xl:grid-cols-2">
                  {section.items.map((item) => (
                    <ToolkitCard
                      key={item.slug}
                      item={item}
                      catalog={catalog}
                      actionKey={actionKey}
                      onConnect={connectToolkit}
                      onDisconnect={disconnectToolkit}
                    />
                  ))}
                </div>
              </section>
            ))}
          </div>
        )}
      </div>
    </SettingsLayout>
  )
}
