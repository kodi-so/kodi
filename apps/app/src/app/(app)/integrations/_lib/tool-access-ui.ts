'use client'

import { trpc } from '@/lib/trpc'
import type { BrandBadgeTone } from '@/lib/brand-styles'

export type ToolAccessCatalog = Awaited<
  ReturnType<typeof trpc.toolAccess.getCatalog.query>
>

export type ToolAccessItem = ToolAccessCatalog['items'][number]

export type ToolAccessToolkitDetail = Awaited<
  ReturnType<typeof trpc.toolAccess.getToolkitDetail.query>
>

export type ZoomInstallStatus = Awaited<
  ReturnType<typeof trpc.zoom.getInstallStatus.query>
>

export type PolicyDraft = Pick<
  ToolAccessToolkitDetail['policy'],
  | 'enabled'
  | 'chatReadsEnabled'
  | 'meetingReadsEnabled'
  | 'draftsEnabled'
  | 'writesRequireApproval'
  | 'adminActionsEnabled'
>

export const attentionStatuses = new Set(['FAILED', 'EXPIRED'])

export function formatIntegrationDate(value: Date | string | null | undefined) {
  if (!value) return 'Not available'

  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return 'Not available'

  return parsed.toLocaleString([], {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
}

export function getStatusTone(status: string): BrandBadgeTone {
  const normalized = status.trim().toLowerCase()

  if (normalized === 'connected' || normalized.endsWith(' connected')) {
    return 'success'
  }

  if (normalized.includes('ready') || normalized.includes('browse')) {
    return 'info'
  }

  if (normalized.includes('connecting')) {
    return 'info'
  }

  if (normalized.includes('needs') || normalized.includes('blocked')) {
    return 'warning'
  }

  if (normalized.includes('attention') || normalized.includes('error')) {
    return 'destructive'
  }

  return 'neutral'
}

export function getToolkitMonogram(name: string) {
  const letters = name
    .split(/[\s_-]+/)
    .map((part) => part[0])
    .filter(Boolean)
    .slice(0, 2)
    .join('')

  return letters.toUpperCase() || name.slice(0, 2).toUpperCase()
}

export function formatAuthMode(mode: string) {
  switch (mode) {
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

export function formatSupportTier(tier: string) {
  switch (tier) {
    case 'tier_1':
      return 'First wave'
    case 'tier_2':
      return 'Expanded'
    default:
      return 'Catalog'
  }
}

export function getZoomStatus(installStatus: ZoomInstallStatus | null) {
  const installation = installStatus?.installation ?? null

  if (installation?.status === 'active') return 'Connected'
  if (!installStatus?.featureFlags.zoomCopilot) return 'Feature off'
  if (!installStatus?.setup.configured) return 'Needs setup'
  if (installation?.status === 'error') return 'Attention needed'
  return 'Not connected'
}

export function getZoomSignedInBotStatus(installStatus: ZoomInstallStatus | null) {
  const installation = installStatus?.installation ?? null

  if (!installation) return 'Not connected'
  if (installStatus?.signedInBotsReady) return 'Signed-in bot ready'
  if (installation.status === 'active') return 'Needs ZAK scope'
  if (installation.status === 'error') return 'Attention needed'
  return 'Not connected'
}

function evaluateToolkitStatus(params: {
  featureEnabled: boolean
  apiConfigured: boolean
  policyEnabled: boolean
  authMode: string
  canConnect: boolean
  connectionStatus: string | null
}) {
  if (!params.featureEnabled) return 'Feature off'
  if (!params.apiConfigured) return 'Needs setup'
  if (!params.policyEnabled) return 'Blocked by workspace'
  if (params.connectionStatus === 'ACTIVE') return 'Connected'
  if (
    params.connectionStatus &&
    attentionStatuses.has(params.connectionStatus)
  ) {
    return 'Attention needed'
  }
  if (
    params.connectionStatus === 'INITIATED' ||
    params.connectionStatus === 'INITIALIZING'
  ) {
    return 'Connecting'
  }
  if (params.authMode === 'no_auth') return 'No auth needed'
  if (params.authMode === 'custom' && !params.canConnect) {
    return 'Needs auth config'
  }
  return 'Not connected'
}

export function getToolkitCatalogStatus(
  item: ToolAccessItem,
  catalog: ToolAccessCatalog | null
) {
  return evaluateToolkitStatus({
    featureEnabled: Boolean(catalog?.featureFlags.toolAccess),
    apiConfigured: Boolean(catalog?.setup.apiConfigured),
    policyEnabled: item.policy.enabled,
    authMode: item.authMode,
    canConnect: item.canConnect,
    connectionStatus: item.connection?.status ?? null,
  })
}

export function getPrimaryDetailConnection(detail: ToolAccessToolkitDetail) {
  return (
    detail.connections.find((connection) => connection.status !== 'INACTIVE') ??
    null
  )
}

export function getToolkitDetailStatus(detail: ToolAccessToolkitDetail) {
  const primaryConnection = getPrimaryDetailConnection(detail)

  return evaluateToolkitStatus({
    featureEnabled: Boolean(detail.featureFlags.toolAccess),
    apiConfigured: Boolean(detail.setup.apiConfigured),
    policyEnabled: detail.policy.enabled,
    authMode: detail.toolkit.authMode,
    canConnect: detail.toolkit.canConnect,
    connectionStatus: primaryConnection?.status ?? null,
  })
}

export function getConnectButtonLabel(params: {
  status: string
  authMode: string
  canConnect: boolean
  featureEnabled: boolean
  apiConfigured: boolean
}) {
  if (params.status === 'Connected') return 'Disconnect'
  if (params.authMode === 'no_auth') return 'No account required'
  if (!params.featureEnabled) return 'Feature off'
  if (!params.apiConfigured) return 'Needs setup'
  if (!params.canConnect) return 'Needs auth config'
  return 'Connect'
}

export function canStartConnection(params: {
  status: string
  authMode: string
  canConnect: boolean
  featureEnabled: boolean
  apiConfigured: boolean
}) {
  if (params.status === 'Connected') return true
  if (params.authMode === 'no_auth') return false
  if (!params.featureEnabled) return false
  if (!params.apiConfigured) return false
  return params.canConnect
}

export function getCapabilitySummary(params: {
  toolsCount: number
  triggersCount: number
  categories: Array<{ slug: string; name: string }>
}) {
  const inventory =
    params.triggersCount > 0
      ? `${params.toolsCount} tools and ${params.triggersCount} triggers`
      : `${params.toolsCount} tools`

  if (params.categories.length === 0) {
    return inventory
  }

  return `${inventory} across ${params.categories
    .slice(0, 3)
    .map((category) => category.name)
    .join(', ')}`
}

export function formatScope(scope: string) {
  const withoutOrigin = scope.replace(/^https?:\/\/[^/]+\//, '')
  if (withoutOrigin.length <= 28) return withoutOrigin
  return `${withoutOrigin.slice(0, 28)}…`
}

export function createPolicyDraft(
  policy: ToolAccessToolkitDetail['policy'] | ToolAccessItem['policy']
): PolicyDraft {
  return {
    enabled: policy.enabled,
    chatReadsEnabled: policy.chatReadsEnabled,
    meetingReadsEnabled: policy.meetingReadsEnabled,
    draftsEnabled: policy.draftsEnabled,
    writesRequireApproval: policy.writesRequireApproval,
    adminActionsEnabled: policy.adminActionsEnabled,
  }
}

export function isPolicyDraftDirty(
  draft: PolicyDraft | null,
  policy: ToolAccessToolkitDetail['policy'] | null
) {
  if (!draft || !policy) return false

  return (
    draft.enabled !== policy.enabled ||
    draft.chatReadsEnabled !== policy.chatReadsEnabled ||
    draft.meetingReadsEnabled !== policy.meetingReadsEnabled ||
    draft.draftsEnabled !== policy.draftsEnabled ||
    draft.writesRequireApproval !== policy.writesRequireApproval ||
    draft.adminActionsEnabled !== policy.adminActionsEnabled
  )
}

export function getPolicyState(policy: {
  enabled: boolean
  chatReadsEnabled: boolean
  meetingReadsEnabled: boolean
  writesRequireApproval: boolean
  adminActionsEnabled: boolean
}) {
  if (!policy.enabled) {
    return {
      label: 'Workspace blocked',
      tone: 'destructive' as const,
      detail:
        'This integration is disabled for the workspace even if an account is connected.',
    }
  }

  if (!policy.chatReadsEnabled || !policy.meetingReadsEnabled) {
    return {
      label: 'Limited reads',
      tone: 'warning' as const,
      detail:
        'Some read contexts are disabled, so availability depends on where Kodi is acting.',
    }
  }

  if (policy.adminActionsEnabled) {
    return {
      label: 'Admin enabled',
      tone: 'destructive' as const,
      detail:
        'Administrative actions are enabled and should be treated carefully.',
    }
  }

  if (policy.writesRequireApproval) {
    return {
      label: 'Writes reviewed',
      tone: 'info' as const,
      detail: 'Writes stay behind approval before execution.',
    }
  }

  return {
    label: 'Direct writes allowed',
    tone: 'success' as const,
    detail: 'Writes can proceed directly once the runtime supports them.',
  }
}

export function getConnectionLabel(
  connection:
    | ToolAccessItem['connection']
    | ToolAccessToolkitDetail['connections'][number]
    | null
) {
  if (!connection) return null

  return (
    connection.externalUserEmail ||
    connection.connectedAccountLabel ||
    'Connected account'
  )
}

export function getCatalogCardMeta(item: ToolAccessItem) {
  if (item.connection) {
    return getConnectionLabel(item.connection)
  }

  if (item.categories.length > 0) {
    return item.categories
      .slice(0, 2)
      .map((category) => category.name)
      .join(' · ')
  }

  return formatAuthMode(item.authMode)
}

export function getCatalogCardNote(item: ToolAccessItem) {
  if (item.connection?.lastValidatedAt) {
    return `Validated ${formatIntegrationDate(item.connection.lastValidatedAt)}`
  }

  if (item.connection?.errorMessage) {
    return item.connection.errorMessage
  }

  if (item.connectionCount > 1) {
    return `${item.connectionCount} identities on file`
  }

  return `${getCapabilitySummary(item)} · ${formatSupportTier(item.supportTier)}`
}

export function getStatusRank(status: string) {
  switch (status) {
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
    case 'Blocked by workspace':
      return 7
    case 'Feature off':
      return 8
    default:
      return 9
  }
}
