'use client'

import { useParams, useSearchParams } from 'next/navigation'
import { useEffect, useMemo, useState } from 'react'
import { Alert, AlertDescription, Skeleton } from '@kodi/ui'
import { useOrg } from '@/lib/org-context'
import { trpc } from '@/lib/trpc'
import { pageShellClass } from '@/lib/brand-styles'
import {
  canStartConnection,
  createPolicyDraft,
  getConnectButtonLabel,
  getPolicyState,
  getPrimaryDetailConnection,
  getToolkitDetailStatus,
  isPolicyDraftDirty,
  type PolicyDraft,
  type ToolAccessToolkitDetail,
} from '../_lib/tool-access-ui'
import { DetailHeader } from './_components/detail-header'
import { OverviewSection } from './_components/overview-section'
import { ExpandCollapseControls } from './_components/expand-collapse-controls'
import { IdentitiesSection } from './_components/identities-section'
import { WorkspaceDefaultsSection } from './_components/workspace-defaults-section'
import {
  DetailLoadingSkeleton,
  DetailNotFound,
} from './_components/detail-loading-skeleton'

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
  const [defaultChannel, setDefaultChannel] = useState<string | null>(null)
  const [channelDraft, setChannelDraft] = useState('')
  const [channelSaving, setChannelSaving] = useState(false)
  const [channelSaved, setChannelSaved] = useState(false)

  const callbackStatus = searchParams.get('connectionStatus')
  const callbackAppName = searchParams.get('appName')
  const isOwner = activeOrg?.role === 'owner'

  async function loadToolkitDetail(orgId: string) {
    const [result, defaults] = await Promise.all([
      trpc.toolAccess.getToolkitDetail.query({ orgId, toolkitSlug }),
      toolkitSlug === 'slack'
        ? trpc.toolAccess.getToolkitDefaults.query({ orgId, toolkitSlug })
        : Promise.resolve(null),
    ])

    setDetail(result)
    setPolicyDraft(createPolicyDraft(result.policy))
    if (defaults !== null) {
      setDefaultChannel(defaults.defaultChannel)
      setChannelDraft(defaults.defaultChannel ?? '')
    }
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
        const [result, defaults] = await Promise.all([
          trpc.toolAccess.getToolkitDetail.query({ orgId, toolkitSlug }),
          toolkitSlug === 'slack'
            ? trpc.toolAccess.getToolkitDefaults.query({ orgId, toolkitSlug })
            : Promise.resolve(null),
        ])

        if (cancelled) return
        setDetail(result)
        setPolicyDraft(createPolicyDraft(result.policy))
        if (defaults !== null) {
          setDefaultChannel(defaults.defaultChannel)
          setChannelDraft(defaults.defaultChannel ?? '')
        }
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
      tone: 'destructive' as const,
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

  async function saveDefaultChannel() {
    if (!activeOrg) return
    setChannelSaving(true)
    setChannelSaved(false)
    setError(null)

    try {
      const result = await trpc.toolAccess.setDefaultChannel.mutate({
        orgId: activeOrg.orgId,
        toolkitSlug,
        channel: channelDraft.trim(),
      })
      setDefaultChannel(result.defaultChannel)
      setChannelDraft(result.defaultChannel ?? '')
      setChannelSaved(true)
      setTimeout(() => setChannelSaved(false), 2000)
    } catch (nextError) {
      setError(
        nextError instanceof Error
          ? nextError.message
          : 'Failed to save default channel.'
      )
    } finally {
      setChannelSaving(false)
    }
  }

  if (!activeOrg) {
    return (
      <div className="flex min-h-full items-center justify-center p-6">
        <Skeleton className="h-6 w-6 rounded-full bg-brand-muted" />
      </div>
    )
  }

  return (
    <div className={pageShellClass}>
      <div className="mx-auto flex max-w-6xl flex-col gap-6 px-4 py-8">
        <DetailHeader
          loading={loading}
          detail={detail}
          status={status}
          policyState={policyState}
          actionKey={actionKey}
          onRefresh={() => void refresh()}
        />

        {callbackBanner && (
          <Alert variant={callbackBanner.tone}>
            <AlertDescription>{callbackBanner.message}</AlertDescription>
          </Alert>
        )}

        {error && (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {loading ? (
          <DetailLoadingSkeleton />
        ) : !detail ? (
          <DetailNotFound />
        ) : (
          <div className="space-y-6">
            <div className="space-y-6">
              <OverviewSection
                detail={detail}
                primaryConnection={primaryConnection}
                policyState={policyState}
                actionKey={actionKey}
                toolkitSlug={toolkitSlug}
                connectLabel={connectLabel}
                canRunPrimaryAction={canRunPrimaryAction}
                onConnect={() => void connectToolkit()}
                onDisconnect={(id) => void disconnectToolkit(id)}
              />

              <ExpandCollapseControls
                onExpandAll={() => {
                  setIdentitiesExpanded(true)
                  setDefaultsExpanded(true)
                }}
                onCollapseAll={() => {
                  setIdentitiesExpanded(false)
                  setDefaultsExpanded(false)
                }}
              />

              <IdentitiesSection
                detail={detail}
                visibleConnections={visibleConnections}
                connectLabel={connectLabel}
                canRunPrimaryAction={canRunPrimaryAction}
                actionKey={actionKey}
                preferenceActionKey={preferenceActionKey}
                expanded={identitiesExpanded}
                onToggle={() => setIdentitiesExpanded((current) => !current)}
                onConnect={() => void connectToolkit()}
                onDisconnect={(id) => void disconnectToolkit(id)}
                onRevalidate={(id) => void revalidateConnection(id)}
                onSelectPreferred={(id) => void selectPreferredConnection(id)}
                onClearPreferred={() => void selectPreferredConnection(null)}
              />

              <WorkspaceDefaultsSection
                detail={detail}
                isOwner={isOwner}
                policyState={policyState}
                policyDraft={policyDraft}
                policyDirty={policyDirty}
                policySaving={policySaving}
                toolkitSlug={toolkitSlug}
                channelDraft={channelDraft}
                defaultChannel={defaultChannel}
                channelSaving={channelSaving}
                channelSaved={channelSaved}
                expanded={defaultsExpanded}
                onToggle={() => setDefaultsExpanded((current) => !current)}
                onPolicyDraftChange={setPolicyDraft}
                onSavePolicy={() => void savePolicy()}
                onResetPolicy={resetPolicyDraft}
                onChannelDraftChange={setChannelDraft}
                onSaveChannel={() => void saveDefaultChannel()}
                onClearChannel={() => setChannelDraft('')}
              />
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
