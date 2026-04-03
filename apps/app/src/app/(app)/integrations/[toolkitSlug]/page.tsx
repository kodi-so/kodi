'use client'

import Link from 'next/link'
import { useParams, useSearchParams } from 'next/navigation'
import { useEffect, useMemo, useState } from 'react'
import {
  ArrowLeft,
  ChevronDown,
  ExternalLink,
  Link2,
  RefreshCcw,
  ShieldCheck,
} from 'lucide-react'
import { Alert, AlertDescription, Badge, Button, Skeleton, cn } from '@kodi/ui'
import { useOrg } from '@/lib/org-context'
import { trpc } from '@/lib/trpc'
import {
  canStartConnection,
  createPolicyDraft,
  formatAuthMode,
  formatIntegrationDate,
  formatScope,
  formatSupportTier,
  getCapabilitySummary,
  getConnectButtonLabel,
  getConnectionLabel,
  getPolicyState,
  getPrimaryDetailConnection,
  getStatusTone,
  getToolkitDetailStatus,
  getToolkitMonogram,
  isPolicyDraftDirty,
  type PolicyDraft,
  type ToolAccessToolkitDetail,
} from '../_lib/tool-access-ui'

function PolicyToggleRow({
  title,
  description,
  value,
  onToggle,
  trueLabel,
  falseLabel,
  disabled,
}: {
  title: string
  description: string
  value: boolean
  onToggle: () => void
  trueLabel: string
  falseLabel: string
  disabled?: boolean
}) {
  return (
    <div className="rounded-[1.2rem] border border-zinc-800 bg-zinc-950/70 p-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="space-y-1">
          <p className="text-sm font-medium text-white">{title}</p>
          <p className="text-sm leading-6 text-zinc-400">{description}</p>
        </div>

        <Button
          type="button"
          variant="ghost"
          className={cn(
            'w-full justify-center border sm:w-auto',
            value
              ? 'border-emerald-500/20 bg-emerald-500/10 text-emerald-300 hover:bg-emerald-500/20 hover:text-emerald-200'
              : 'border-zinc-800 bg-zinc-950 text-zinc-300 hover:bg-zinc-900 hover:text-white'
          )}
          disabled={disabled}
          onClick={onToggle}
        >
          {value ? trueLabel : falseLabel}
        </Button>
      </div>
    </div>
  )
}

function CollapsibleSection({
  title,
  description,
  badges = [],
  actions,
  expanded,
  onToggle,
  children,
}: {
  title: string
  description: string
  badges?: Array<{ label: string; className: string }>
  actions?: React.ReactNode
  expanded: boolean
  onToggle: () => void
  children: React.ReactNode
}) {
  return (
    <section className="rounded-[1.6rem] border border-zinc-800 bg-[linear-gradient(180deg,rgba(19,21,27,0.98),rgba(11,13,18,1))]">
      <div className="p-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="space-y-3">
            <button
              type="button"
              onClick={onToggle}
              className="group inline-flex items-center gap-3 text-left"
            >
              <div className="flex h-9 w-9 items-center justify-center rounded-full border border-zinc-800 bg-zinc-950 text-zinc-400 transition group-hover:border-zinc-700 group-hover:text-white">
                <ChevronDown
                  size={16}
                  className={cn(
                    'transition duration-200',
                    expanded ? 'rotate-0' : '-rotate-90'
                  )}
                />
              </div>
              <div className="space-y-1">
                <h2 className="text-xl font-semibold text-white">{title}</h2>
                <p className="text-sm text-zinc-400">{description}</p>
              </div>
            </button>

            {badges.length > 0 && (
              <div className="flex flex-wrap gap-2 pl-12">
                {badges.map((badge) => (
                  <Badge key={badge.label} className={badge.className}>
                    {badge.label}
                  </Badge>
                ))}
              </div>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-2 sm:justify-end">
            {actions}
            <Button
              type="button"
              variant="ghost"
              onClick={onToggle}
              className="border border-zinc-800 bg-zinc-950 text-zinc-300 hover:bg-zinc-900 hover:text-white"
            >
              {expanded ? 'Collapse' : 'Expand'}
            </Button>
          </div>
        </div>
      </div>

      <div
        className={cn(
          'grid transition-[grid-template-rows] duration-300 ease-out',
          expanded ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]'
        )}
      >
        <div className="overflow-hidden">
          <div className="border-t border-zinc-800 px-6 pb-6 pt-2">
            {children}
          </div>
        </div>
      </div>
    </section>
  )
}

export default function IntegrationDetailPage() {
  const params = useParams<{ toolkitSlug: string }>()
  const searchParams = useSearchParams()
  const { activeOrg } = useOrg()
  const toolkitSlug = decodeURIComponent(params.toolkitSlug)
  const [detail, setDetail] = useState<ToolAccessToolkitDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [actionKey, setActionKey] = useState<string | null>(null)
  const [preferenceActionKey, setPreferenceActionKey] = useState<string | null>(
    null
  )
  const [policyDraft, setPolicyDraft] = useState<PolicyDraft | null>(null)
  const [policySaving, setPolicySaving] = useState(false)
  const [identitiesExpanded, setIdentitiesExpanded] = useState(true)
  const [defaultsExpanded, setDefaultsExpanded] = useState(true)

  const callbackStatus = searchParams.get('connectionStatus')
  const callbackAppName = searchParams.get('appName')
  const isOwner = activeOrg?.role === 'owner'

  async function loadToolkitDetail(orgId: string) {
    const result = await trpc.toolAccess.getToolkitDetail.query({
      orgId,
      toolkitSlug,
    })

    setDetail(result)
    setPolicyDraft(createPolicyDraft(result.policy))
    return result
  }

  useEffect(() => {
    if (!activeOrg) {
      setDetail(null)
      setLoading(false)
      return
    }

    const orgId = activeOrg.orgId
    let cancelled = false
    setLoading(true)
    setError(null)

    async function load() {
      try {
        const result = await trpc.toolAccess.getToolkitDetail.query({
          orgId,
          toolkitSlug,
        })

        if (cancelled) return
        setDetail(result)
        setPolicyDraft(createPolicyDraft(result.policy))
      } catch (nextError) {
        if (cancelled) return
        setError(
          nextError instanceof Error
            ? nextError.message
            : 'Failed to load integration details.'
        )
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    void load()
    return () => {
      cancelled = true
    }
  }, [activeOrg?.orgId, toolkitSlug])

  const callbackBanner = useMemo(() => {
    if (!callbackStatus) return null

    const normalized = callbackStatus.toLowerCase()
    const appLabel = callbackAppName ?? 'This account'

    if (normalized === 'active' || normalized === 'connected') {
      return {
        tone: 'success' as const,
        message: `${appLabel} is connected and ready to use.`,
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

  const status = detail ? getToolkitDetailStatus(detail) : 'Loading'
  const primaryConnection = detail ? getPrimaryDetailConnection(detail) : null
  const policyState = detail ? getPolicyState(detail.policy) : null
  const visibleConnections =
    detail?.connections.filter(
      (connection) => connection.status !== 'INACTIVE'
    ) ?? []
  const connectLabel = detail
    ? visibleConnections.length > 0
      ? 'Connect another identity'
      : getConnectButtonLabel({
          status,
          authMode: detail.toolkit.authMode,
          canConnect: detail.toolkit.canConnect,
          featureEnabled: detail.featureFlags.toolAccess,
          apiConfigured: detail.setup.apiConfigured,
        })
    : 'Connect'
  const canRunPrimaryAction = detail
    ? canStartConnection({
        status,
        authMode: detail.toolkit.authMode,
        canConnect: detail.toolkit.canConnect,
        featureEnabled: detail.featureFlags.toolAccess,
        apiConfigured: detail.setup.apiConfigured,
      })
    : false
  const policyDirty = isPolicyDraftDirty(policyDraft, detail?.policy ?? null)

  async function refresh() {
    if (!activeOrg) return
    setActionKey('refresh')
    setError(null)

    try {
      await loadToolkitDetail(activeOrg.orgId)
    } catch (nextError) {
      setError(
        nextError instanceof Error
          ? nextError.message
          : 'Failed to refresh integration details.'
      )
    } finally {
      setActionKey(null)
    }
  }

  async function connectToolkit() {
    if (!activeOrg) return
    setActionKey(`connect:${toolkitSlug}`)
    setError(null)

    try {
      const result = await trpc.toolAccess.createConnectLink.mutate({
        orgId: activeOrg.orgId,
        toolkitSlug,
        returnPath: `/integrations/${encodeURIComponent(toolkitSlug)}`,
      })

      if (!result.redirectUrl) {
        throw new Error('Composio did not return a redirect URL.')
      }

      window.location.assign(result.redirectUrl)
    } catch (nextError) {
      setError(
        nextError instanceof Error
          ? nextError.message
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
      await loadToolkitDetail(activeOrg.orgId)
    } catch (nextError) {
      setError(
        nextError instanceof Error
          ? nextError.message
          : 'Failed to disconnect this account.'
      )
    } finally {
      setActionKey(null)
    }
  }

  async function revalidateConnection(connectedAccountId: string) {
    if (!activeOrg) return
    setActionKey(`revalidate:${connectedAccountId}`)
    setError(null)

    try {
      await trpc.toolAccess.revalidateConnection.mutate({
        orgId: activeOrg.orgId,
        connectedAccountId,
      })
      await loadToolkitDetail(activeOrg.orgId)
    } catch (nextError) {
      setError(
        nextError instanceof Error
          ? nextError.message
          : 'Failed to revalidate this connection.'
      )
    } finally {
      setActionKey(null)
    }
  }

  async function selectPreferredConnection(connectedAccountId: string | null) {
    if (!activeOrg) return
    setPreferenceActionKey(connectedAccountId ?? 'automatic')
    setError(null)

    try {
      await trpc.toolAccess.setPreferredConnection.mutate({
        orgId: activeOrg.orgId,
        toolkitSlug,
        connectedAccountId,
      })
      await loadToolkitDetail(activeOrg.orgId)
    } catch (nextError) {
      setError(
        nextError instanceof Error
          ? nextError.message
          : 'Failed to update the preferred identity.'
      )
    } finally {
      setPreferenceActionKey(null)
    }
  }

  async function savePolicy() {
    if (!activeOrg || !policyDraft) return
    setPolicySaving(true)
    setError(null)

    try {
      await trpc.toolAccess.updatePolicy.mutate({
        orgId: activeOrg.orgId,
        toolkitSlug,
        ...policyDraft,
      })
      await loadToolkitDetail(activeOrg.orgId)
    } catch (nextError) {
      setError(
        nextError instanceof Error
          ? nextError.message
          : 'Failed to save workspace defaults.'
      )
    } finally {
      setPolicySaving(false)
    }
  }

  function resetPolicyDraft() {
    if (!detail) return
    setPolicyDraft(createPolicyDraft(detail.policy))
  }

  if (!activeOrg) {
    return (
      <div className="flex min-h-full items-center justify-center p-6">
        <Skeleton className="h-6 w-6 rounded-full bg-zinc-700" />
      </div>
    )
  }

  return (
    <div className="min-h-full bg-[radial-gradient(circle_at_top_left,rgba(20,184,166,0.08),transparent_20%),linear-gradient(180deg,rgba(15,17,22,0.96),rgba(8,9,13,1))]">
      <div className="mx-auto flex max-w-6xl flex-col gap-6 px-4 py-8">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div className="space-y-3">
            <Button
              asChild
              variant="ghost"
              className="w-fit gap-2 px-0 text-zinc-400 hover:bg-transparent hover:text-white"
            >
              <Link href="/integrations">
                <ArrowLeft size={16} />
                Back to integrations
              </Link>
            </Button>

            {loading ? (
              <div className="space-y-2">
                <Skeleton className="h-4 w-28 bg-zinc-800" />
                <Skeleton className="h-10 w-56 bg-zinc-800" />
              </div>
            ) : detail ? (
              <div className="space-y-3">
                <div className="flex flex-wrap gap-2">
                  <Badge className={getStatusTone(status)}>{status}</Badge>
                  <Badge className="border-zinc-700 bg-zinc-950 text-zinc-300">
                    {formatSupportTier(detail.toolkit.supportTier)}
                  </Badge>
                  <Badge className="border-zinc-700 bg-zinc-950 text-zinc-300">
                    {formatAuthMode(detail.toolkit.authMode)}
                  </Badge>
                  {policyState && (
                    <Badge className={policyState.tone}>
                      {policyState.label}
                    </Badge>
                  )}
                </div>

                <div className="flex items-start gap-4">
                  <div className="flex h-14 w-14 flex-shrink-0 items-center justify-center rounded-[1.35rem] border border-zinc-800 bg-zinc-950 text-sm font-semibold uppercase tracking-[0.18em] text-zinc-200">
                    {getToolkitMonogram(detail.toolkit.name)}
                  </div>
                  <div className="space-y-2">
                    <h1 className="text-3xl font-semibold tracking-tight text-white">
                      {detail.toolkit.name}
                    </h1>
                    <p className="max-w-3xl text-sm leading-7 text-zinc-400">
                      {detail.toolkit.description ??
                        'No provider description is available yet for this integration.'}
                    </p>
                  </div>
                </div>
              </div>
            ) : (
              <div className="space-y-2">
                <p className="text-sm text-zinc-500">Integration detail</p>
                <h1 className="text-3xl font-semibold tracking-tight text-white">
                  Integration not found
                </h1>
              </div>
            )}
          </div>

          <div className="flex flex-wrap gap-2">
            <Button
              onClick={() => void refresh()}
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

            <Button
              asChild
              variant="ghost"
              className="gap-2 border border-zinc-800 bg-zinc-950 text-zinc-300 hover:bg-zinc-900 hover:text-white"
            >
              <Link href="/integrations/add">Browse catalog</Link>
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

        {loading ? (
          <div className="space-y-4">
            <Skeleton className="h-44 rounded-[1.6rem] bg-zinc-900/70" />
            <Skeleton className="h-72 rounded-[1.6rem] bg-zinc-900/70" />
            <Skeleton className="h-[28rem] rounded-[1.6rem] bg-zinc-900/70" />
          </div>
        ) : !detail ? (
          <div className="rounded-[1.6rem] border border-dashed border-zinc-800 bg-zinc-950/40 p-8">
            <p className="text-xl font-medium text-white">
              This integration could not be loaded.
            </p>
            <p className="mt-2 max-w-xl text-sm leading-7 text-zinc-400">
              Go back to the catalog and pick another integration, or refresh if
              the connection state just changed.
            </p>
          </div>
        ) : (
          <div className="space-y-6">
            <div className="space-y-6">
              <section className="rounded-[1.6rem] border border-zinc-800 bg-[linear-gradient(180deg,rgba(19,21,27,0.98),rgba(11,13,18,1))] p-6">
                <div className="flex flex-col gap-5 sm:flex-row sm:items-start sm:justify-between">
                  <div className="space-y-3">
                    <p className="text-xs uppercase tracking-[0.18em] text-zinc-500">
                      Overview
                    </p>
                    <div className="space-y-2">
                      <p className="text-sm font-medium text-white">
                        {primaryConnection
                          ? getConnectionLabel(primaryConnection)
                          : detail.toolkit.authMode === 'no_auth'
                            ? 'No connected identity required'
                            : 'No identity connected yet'}
                      </p>
                      <p className="text-sm leading-7 text-zinc-400">
                        {getCapabilitySummary(detail.toolkit)}.{' '}
                        {policyState?.detail}
                      </p>
                    </div>
                  </div>

                  <div className="flex flex-wrap gap-2">
                    {primaryConnection?.status === 'ACTIVE' ? (
                      <Button
                        onClick={() =>
                          void disconnectToolkit(
                            primaryConnection.connectedAccountId
                          )
                        }
                        variant="outline"
                        className="border-red-500/30 bg-red-500/10 text-red-200 hover:bg-red-500/20 hover:text-red-100"
                        disabled={actionKey !== null}
                      >
                        {actionKey ===
                        `disconnect:${primaryConnection.connectedAccountId}`
                          ? 'Disconnecting...'
                          : 'Disconnect'}
                      </Button>
                    ) : (
                      <Button
                        onClick={() => void connectToolkit()}
                        className="gap-2 bg-teal-500 text-zinc-950 hover:bg-teal-400"
                        disabled={!canRunPrimaryAction || actionKey !== null}
                      >
                        <Link2 size={16} />
                        {actionKey === `connect:${toolkitSlug}`
                          ? 'Connecting...'
                          : connectLabel}
                      </Button>
                    )}

                    {detail.toolkit.appUrl && (
                      <Button
                        asChild
                        variant="ghost"
                        className="gap-2 border border-zinc-800 bg-zinc-950 text-zinc-300 hover:bg-zinc-900 hover:text-white"
                      >
                        <a
                          href={detail.toolkit.appUrl}
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
              </section>

              <div className="flex flex-wrap justify-end gap-2">
                <Button
                  type="button"
                  variant="ghost"
                  className="border border-zinc-800 bg-zinc-950 text-zinc-300 hover:bg-zinc-900 hover:text-white"
                  onClick={() => {
                    setIdentitiesExpanded(true)
                    setDefaultsExpanded(true)
                  }}
                >
                  Expand all
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  className="border border-zinc-800 bg-zinc-950 text-zinc-300 hover:bg-zinc-900 hover:text-white"
                  onClick={() => {
                    setIdentitiesExpanded(false)
                    setDefaultsExpanded(false)
                  }}
                >
                  Collapse all
                </Button>
              </div>

              <CollapsibleSection
                title="Connected identities"
                description="Pick the identity Kodi should prefer when more than one is available."
                badges={[
                  {
                    label: `${detail.connectionSummary.activeCount} ${
                      detail.connectionSummary.activeCount === 1
                        ? 'active identity'
                        : 'active identities'
                    }`,
                    className: 'border-zinc-700 bg-zinc-900 text-zinc-300',
                  },
                  ...(detail.selectedConnectedAccountId
                    ? [
                        {
                          label: 'Preferred identity set',
                          className:
                            'border-emerald-500/20 bg-emerald-500/10 text-emerald-300',
                        },
                      ]
                    : []),
                ]}
                actions={
                  <>
                    {detail.selectedConnectedAccountId && (
                      <Button
                        type="button"
                        variant="ghost"
                        className="gap-2 border border-zinc-800 bg-zinc-950 text-zinc-300 hover:bg-zinc-900 hover:text-white"
                        disabled={preferenceActionKey !== null}
                        onClick={() => void selectPreferredConnection(null)}
                      >
                        Use automatic selection
                      </Button>
                    )}
                    <Button
                      type="button"
                      className="gap-2 bg-teal-500 text-zinc-950 hover:bg-teal-400"
                      disabled={!canRunPrimaryAction || actionKey !== null}
                      onClick={() => void connectToolkit()}
                    >
                      <Link2 size={16} />
                      {visibleConnections.length > 0
                        ? 'Connect another identity'
                        : connectLabel}
                    </Button>
                  </>
                }
                expanded={identitiesExpanded}
                onToggle={() => setIdentitiesExpanded((current) => !current)}
              >
                {visibleConnections.length === 0 ? (
                  <div className="mt-4 rounded-[1.2rem] border border-dashed border-zinc-800 bg-zinc-950/40 p-5">
                    <p className="text-sm font-medium text-white">
                      No identities connected yet.
                    </p>
                    <p className="mt-2 text-sm leading-7 text-zinc-400">
                      Connect an account first so Kodi can scope runtime access
                      to the right identity when it uses this integration.
                    </p>
                  </div>
                ) : (
                  <div className="mt-4 space-y-3">
                    {visibleConnections.map(
                      (
                        connection: ToolAccessToolkitDetail['connections'][number]
                      ) => {
                        const isDisconnecting =
                          actionKey ===
                          `disconnect:${connection.connectedAccountId}`
                        const isRevalidating =
                          actionKey ===
                          `revalidate:${connection.connectedAccountId}`
                        const isSelecting =
                          preferenceActionKey === connection.connectedAccountId

                        return (
                          <div
                            key={connection.connectedAccountId}
                            className={cn(
                              'rounded-[1.2rem] border p-4',
                              connection.isPreferred
                                ? 'border-emerald-500/20 bg-emerald-500/10'
                                : 'border-zinc-800 bg-zinc-950/70'
                            )}
                          >
                            <div className="flex flex-col gap-4">
                              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                                <div className="space-y-2">
                                  <div className="flex flex-wrap items-center gap-2">
                                    <p className="text-sm font-medium text-white">
                                      {getConnectionLabel(connection)}
                                    </p>
                                    <Badge
                                      className={getStatusTone(
                                        connection.status
                                      )}
                                    >
                                      {connection.status}
                                    </Badge>
                                    {connection.isPreferred && (
                                      <Badge className="border-emerald-500/20 bg-emerald-500/10 text-emerald-300">
                                        Preferred
                                      </Badge>
                                    )}
                                  </div>

                                  <div className="flex flex-wrap gap-3 text-xs text-zinc-500">
                                    {connection.lastValidatedAt && (
                                      <span>
                                        Validated{' '}
                                        {formatIntegrationDate(
                                          connection.lastValidatedAt
                                        )}
                                      </span>
                                    )}
                                    {connection.updatedAt && (
                                      <span>
                                        Updated{' '}
                                        {formatIntegrationDate(
                                          connection.updatedAt
                                        )}
                                      </span>
                                    )}
                                  </div>
                                </div>

                                <div className="flex flex-wrap gap-2">
                                  {connection.status !== 'ACTIVE' && (
                                    <Button
                                      type="button"
                                      variant="ghost"
                                      className="border border-zinc-800 bg-zinc-950 text-zinc-300 hover:bg-zinc-900 hover:text-white"
                                      disabled={actionKey !== null}
                                      onClick={() =>
                                        void revalidateConnection(
                                          connection.connectedAccountId
                                        )
                                      }
                                    >
                                      {isRevalidating
                                        ? 'Revalidating...'
                                        : 'Revalidate'}
                                    </Button>
                                  )}

                                  {!connection.isPreferred &&
                                    connection.status !== 'INACTIVE' && (
                                      <Button
                                        type="button"
                                        variant="ghost"
                                        className="border border-zinc-800 bg-zinc-950 text-zinc-300 hover:bg-zinc-900 hover:text-white"
                                        disabled={preferenceActionKey !== null}
                                        onClick={() =>
                                          void selectPreferredConnection(
                                            connection.connectedAccountId
                                          )
                                        }
                                      >
                                        {isSelecting
                                          ? 'Saving...'
                                          : 'Prefer this identity'}
                                      </Button>
                                    )}

                                  <Button
                                    type="button"
                                    variant="outline"
                                    className="border-red-500/30 bg-red-500/10 text-red-200 hover:bg-red-500/20 hover:text-red-100"
                                    disabled={actionKey !== null}
                                    onClick={() =>
                                      void disconnectToolkit(
                                        connection.connectedAccountId
                                      )
                                    }
                                  >
                                    {isDisconnecting
                                      ? 'Disconnecting...'
                                      : 'Disconnect'}
                                  </Button>
                                </div>
                              </div>

                              {connection.scopes.length > 0 && (
                                <div className="flex flex-wrap gap-2">
                                  {connection.scopes
                                    .slice(0, 8)
                                    .map((scope: string) => (
                                      <Badge
                                        key={scope}
                                        className="max-w-full border-zinc-700 bg-zinc-900 text-zinc-300"
                                      >
                                        {formatScope(scope)}
                                      </Badge>
                                    ))}
                                  {connection.scopes.length > 8 && (
                                    <Badge className="border-zinc-700 bg-zinc-900 text-zinc-300">
                                      +{connection.scopes.length - 8} more
                                      scopes
                                    </Badge>
                                  )}
                                </div>
                              )}

                              {connection.errorMessage && (
                                <Alert className="border-red-500/30 bg-red-500/10 text-red-200">
                                  <AlertDescription>
                                    {connection.errorMessage}
                                  </AlertDescription>
                                </Alert>
                              )}
                            </div>
                          </div>
                        )
                      }
                    )}
                  </div>
                )}
              </CollapsibleSection>

              <CollapsibleSection
                title="Workspace defaults"
                description={
                  isOwner
                    ? 'Set the workspace defaults Kodi should respect whenever this integration is available.'
                    : 'You can review the current workspace defaults here. Only owners can change them.'
                }
                badges={[
                  {
                    label: policyState?.label ?? 'Policy',
                    className:
                      policyState?.tone ??
                      'border-zinc-700 bg-zinc-900 text-zinc-300',
                  },
                  {
                    label: `${detail.connectionSummary.activeCount} ${
                      detail.connectionSummary.activeCount === 1
                        ? 'active identity'
                        : 'active identities'
                    }`,
                    className: 'border-zinc-700 bg-zinc-900 text-zinc-300',
                  },
                ]}
                actions={
                  <div className="flex items-center gap-2 text-sm text-zinc-400">
                    <ShieldCheck size={16} className="text-zinc-500" />
                    {isOwner ? 'Owner controls' : 'View only'}
                  </div>
                }
                expanded={defaultsExpanded}
                onToggle={() => setDefaultsExpanded((current) => !current)}
              >
                {isOwner && policyDraft ? (
                  <div className="mt-4 space-y-3">
                    <PolicyToggleRow
                      title="Workspace access"
                      description="Turn this integration on or off for the workspace."
                      value={policyDraft.enabled}
                      onToggle={() =>
                        setPolicyDraft((current) =>
                          current
                            ? {
                                ...current,
                                enabled: !current.enabled,
                              }
                            : current
                        )
                      }
                      trueLabel="Enabled"
                      falseLabel="Disabled"
                      disabled={policySaving}
                    />
                    <PolicyToggleRow
                      title="Chat reads"
                      description="Allow Kodi to read from this integration during chat."
                      value={policyDraft.chatReadsEnabled}
                      onToggle={() =>
                        setPolicyDraft((current) =>
                          current
                            ? {
                                ...current,
                                chatReadsEnabled: !current.chatReadsEnabled,
                              }
                            : current
                        )
                      }
                      trueLabel="Allowed"
                      falseLabel="Blocked"
                      disabled={policySaving}
                    />
                    <PolicyToggleRow
                      title="Meeting reads"
                      description="Allow this integration to be read during meeting workflows."
                      value={policyDraft.meetingReadsEnabled}
                      onToggle={() =>
                        setPolicyDraft((current) =>
                          current
                            ? {
                                ...current,
                                meetingReadsEnabled:
                                  !current.meetingReadsEnabled,
                              }
                            : current
                        )
                      }
                      trueLabel="Allowed"
                      falseLabel="Blocked"
                      disabled={policySaving}
                    />
                    <PolicyToggleRow
                      title="Draft support"
                      description="Allow Kodi to prepare drafts before a write is executed."
                      value={policyDraft.draftsEnabled}
                      onToggle={() =>
                        setPolicyDraft((current) =>
                          current
                            ? {
                                ...current,
                                draftsEnabled: !current.draftsEnabled,
                              }
                            : current
                        )
                      }
                      trueLabel="On"
                      falseLabel="Off"
                      disabled={policySaving}
                    />
                    <PolicyToggleRow
                      title="Approval for writes"
                      description="Keep writes behind approval before they execute."
                      value={policyDraft.writesRequireApproval}
                      onToggle={() =>
                        setPolicyDraft((current) =>
                          current
                            ? {
                                ...current,
                                writesRequireApproval:
                                  !current.writesRequireApproval,
                              }
                            : current
                        )
                      }
                      trueLabel="Required"
                      falseLabel="Direct"
                      disabled={policySaving}
                    />
                    <PolicyToggleRow
                      title="Admin actions"
                      description="Allow high-risk administrative actions for this integration."
                      value={policyDraft.adminActionsEnabled}
                      onToggle={() =>
                        setPolicyDraft((current) =>
                          current
                            ? {
                                ...current,
                                adminActionsEnabled:
                                  !current.adminActionsEnabled,
                              }
                            : current
                        )
                      }
                      trueLabel="Enabled"
                      falseLabel="Disabled"
                      disabled={policySaving}
                    />

                    <div className="flex flex-wrap gap-2 border-t border-zinc-800 pt-4">
                      <Button
                        onClick={() => void savePolicy()}
                        className="bg-teal-500 text-zinc-950 hover:bg-teal-400"
                        disabled={!policyDirty || policySaving}
                      >
                        {policySaving ? 'Saving...' : 'Save defaults'}
                      </Button>
                      <Button
                        onClick={resetPolicyDraft}
                        variant="ghost"
                        className="border border-zinc-800 bg-zinc-950 text-zinc-300 hover:bg-zinc-900 hover:text-white"
                        disabled={!policyDirty || policySaving}
                      >
                        Reset
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div className="mt-4 rounded-[1.2rem] border border-zinc-800 bg-zinc-950/70 p-5">
                    <p className="text-sm font-medium text-white">
                      Workspace policy is view-only here.
                    </p>
                    <p className="mt-2 text-sm leading-7 text-zinc-400">
                      Owners can change defaults for chat reads, meeting reads,
                      drafts, approval gating, and administrative actions.
                    </p>
                  </div>
                )}
              </CollapsibleSection>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
