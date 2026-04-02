'use client'

import Link from 'next/link'
import { useDeferredValue, useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import {
  ArrowLeft,
  BadgeCheck,
  ExternalLink,
  KeyRound,
  Layers3,
  Link2,
  LockKeyhole,
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
  cn,
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
type ToolAccessToolkitDetail = Awaited<
  ReturnType<typeof trpc.toolAccess.getToolkitDetail.query>
>
type ToolAccessFilter = 'all' | 'priority' | 'connected' | 'attention' | 'setup'
type ToolkitSection = {
  key: string
  title: string
  description: string
  items: ToolAccessItem[]
}
type PolicyDraft = Pick<
  ToolAccessToolkitDetail['policy'],
  | 'enabled'
  | 'chatReadsEnabled'
  | 'meetingReadsEnabled'
  | 'draftsEnabled'
  | 'writesRequireApproval'
  | 'adminActionsEnabled'
>

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

function getPolicyState(policy: ToolAccessItem['policy']) {
  if (!policy.enabled) {
    return {
      label: 'Workspace blocked',
      tone: 'border-red-500/20 bg-red-500/10 text-red-200',
      detail:
        'This toolkit is disabled for the workspace, even if a user has connected it.',
    }
  }

  if (!policy.chatReadsEnabled || !policy.meetingReadsEnabled) {
    return {
      label: 'Limited reads',
      tone: 'border-amber-500/20 bg-amber-500/10 text-amber-100',
      detail:
        'Some read contexts are disabled, so availability will depend on where Kodi is acting.',
    }
  }

  if (policy.adminActionsEnabled) {
    return {
      label: 'Admin enabled',
      tone: 'border-red-500/20 bg-red-500/10 text-red-200',
      detail:
        'Admin-class actions are enabled for this toolkit and should be treated carefully.',
    }
  }

  if (policy.writesRequireApproval) {
    return {
      label: 'Writes reviewed',
      tone: 'border-sky-500/20 bg-sky-500/10 text-sky-200',
      detail: 'Writes stay guarded by approval before execution.',
    }
  }

  return {
    label: 'Direct writes allowed',
    tone: 'border-emerald-500/20 bg-emerald-500/10 text-emerald-300',
    detail:
      'Writes can proceed without approval once runtime enforcement is wired in later phases.',
  }
}

function getToolkitStatus(
  item: ToolAccessItem,
  catalog: ToolAccessCatalog | null
) {
  if (!catalog?.featureFlags.toolAccess) return 'Feature off'
  if (!catalog?.setup.apiConfigured) return 'Needs setup'
  if (!item.policy.enabled) return 'Blocked by workspace'
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

function formatAuthMode(item: Pick<ToolAccessItem, 'authMode'>) {
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

function formatSupportTier(item: Pick<ToolAccessItem, 'supportTier'>) {
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
  if (withoutOrigin.length <= 28) return withoutOrigin
  return `${withoutOrigin.slice(0, 28)}…`
}

function getCapabilitySummary(
  item:
    | ToolAccessItem
    | ToolAccessToolkitDetail['toolkit']
    | {
        toolsCount: number
        triggersCount: number
        categories: Array<{ slug: string; name: string }>
      }
) {
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

function createPolicyDraft(
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

function isPolicyDraftDirty(
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
        status === 'Feature off' ||
        status === 'Blocked by workspace'
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
    case 'Blocked by workspace':
      return 0
    case 'Connected':
      return 1
    case 'Attention needed':
      return 2
    case 'Connecting':
      return 3
    case 'Not connected':
      return 4
    case 'No auth needed':
      return 5
    case 'Needs auth config':
      return 6
    case 'Needs setup':
      return 7
    case 'Feature off':
      return 8
    default:
      return 9
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
        'Toolkits blocked on workspace policy, environment setup, or auth config.',
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

  const blocked = items.filter((item) => !item.policy.enabled)
  const attention = items.filter(
    (item) =>
      item.connection?.status && attentionStatuses.has(item.connection.status)
  )
  const priority = items.filter(
    (item) =>
      item.supportTier === 'tier_1' &&
      !blocked.some((candidate) => candidate.slug === item.slug) &&
      !attention.some((candidate) => candidate.slug === item.slug)
  )
  const catalog = items.filter(
    (item) =>
      item.supportTier !== 'tier_1' &&
      !blocked.some((candidate) => candidate.slug === item.slug) &&
      !attention.some((candidate) => candidate.slug === item.slug)
  )

  return [
    {
      key: 'blocked',
      title: 'Blocked or governed',
      description:
        'These tools need a policy or connection decision before they will behave predictably.',
      items: blocked,
    },
    {
      key: 'attention',
      title: 'Needs attention',
      description: 'Fix these accounts first so the runtime stays trustworthy.',
      items: attention.filter(
        (item) => !blocked.some((candidate) => candidate.slug === item.slug)
      ),
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

  const blockedCount = catalog.items.filter(
    (item) => !item.policy.enabled
  ).length

  if (blockedCount > 0) {
    return {
      label: 'Policy review needed',
      tone: 'border-red-500/20 bg-red-500/10 text-red-200',
      detail:
        'Some tools are already connected but blocked or constrained at the workspace level.',
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
    <div className="rounded-2xl border border-zinc-800 bg-zinc-950/70 p-4">
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

function ToolkitCard({
  item,
  catalog,
  actionKey,
  isSelected,
  onInspect,
  onConnect,
  onDisconnect,
}: {
  item: ToolAccessItem
  catalog: ToolAccessCatalog | null
  actionKey: string | null
  isSelected: boolean
  onInspect: (toolkitSlug: string) => void
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
  const policyState = getPolicyState(item.policy)

  return (
    <article
      className={cn(
        'group overflow-hidden rounded-[1.75rem] border bg-[linear-gradient(180deg,rgba(21,23,31,0.98),rgba(10,11,17,1))] p-6 transition hover:-translate-y-0.5',
        isSelected
          ? 'border-sky-400/40 shadow-[0_0_0_1px_rgba(56,189,248,0.18)]'
          : 'border-zinc-800 hover:border-zinc-700'
      )}
    >
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

          <div className="flex flex-wrap gap-2 xl:max-w-[16rem] xl:justify-end">
            <Badge className={policyState.tone}>{policyState.label}</Badge>
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
              {item.connection?.selectionMode === 'preferred' && (
                <Badge className="border-emerald-500/20 bg-emerald-500/10 text-emerald-300">
                  Preferred identity
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
            <p className="mt-3 text-xs leading-6 text-zinc-500">
              {policyState.detail}
            </p>
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
            <Button
              type="button"
              variant="ghost"
              className="gap-2 border border-zinc-800 bg-zinc-950 text-zinc-300 hover:bg-zinc-900 hover:text-white"
              onClick={() => onInspect(item.slug)}
            >
              Review details
            </Button>

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

function ToolAccessDetailPanel({
  catalog,
  selectedItem,
  detail,
  loading,
  error,
  isOwner,
  actionKey,
  preferenceActionKey,
  policyDraft,
  policySaving,
  onConnect,
  onDisconnect,
  onSelectConnection,
  onPolicyDraftChange,
  onSavePolicy,
  onResetPolicy,
}: {
  catalog: ToolAccessCatalog | null
  selectedItem: ToolAccessItem | null
  detail: ToolAccessToolkitDetail | null
  loading: boolean
  error: string | null
  isOwner: boolean
  actionKey: string | null
  preferenceActionKey: string | null
  policyDraft: PolicyDraft | null
  policySaving: boolean
  onConnect: (toolkitSlug: string) => Promise<void>
  onDisconnect: (connectedAccountId: string) => Promise<void>
  onSelectConnection: (
    toolkitSlug: string,
    connectedAccountId: string | null
  ) => Promise<void>
  onPolicyDraftChange: (draft: PolicyDraft) => void
  onSavePolicy: (toolkitSlug: string) => Promise<void>
  onResetPolicy: () => void
}) {
  if (!selectedItem) {
    return (
      <div className="rounded-[1.75rem] border border-zinc-800 bg-[linear-gradient(180deg,rgba(18,20,28,0.96),rgba(11,12,18,0.98))] p-6">
        <p className="text-sm font-medium text-white">Toolkit detail</p>
        <p className="mt-3 text-sm leading-7 text-zinc-400">
          Pick a toolkit from the catalog to inspect its identities, granted
          scopes, connection health, and workspace policy.
        </p>
      </div>
    )
  }

  const status = getToolkitStatus(selectedItem, catalog)
  const connectLabel =
    selectedItem.connectionCount > 0
      ? 'Connect another identity'
      : getConnectButtonLabel(selectedItem, catalog)
  const canRunPrimaryAction = canRunConnect(selectedItem, catalog)
  const policyState = getPolicyState(selectedItem.policy)
  const policyDirty = isPolicyDraftDirty(policyDraft, detail?.policy ?? null)
  const automaticCandidateId =
    !detail?.selectedConnectedAccountId && detail?.connections.length
      ? detail.connections[0]?.connectedAccountId
      : null

  return (
    <div
      id="tool-access-detail"
      className="space-y-4 rounded-[1.75rem] border border-zinc-800 bg-[linear-gradient(180deg,rgba(18,20,28,0.98),rgba(11,12,18,1))] p-5 xl:sticky xl:top-6"
    >
      <div className="space-y-3">
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-2xl border border-zinc-800 bg-zinc-950 text-zinc-200">
            <span className="text-sm font-semibold uppercase tracking-[0.18em]">
              {getToolkitMonogram(selectedItem.name)}
            </span>
          </div>
          <div className="min-w-0">
            <p className="text-xs uppercase tracking-[0.18em] text-zinc-500">
              Toolkit detail
            </p>
            <h2 className="truncate text-lg font-medium text-white">
              {selectedItem.name}
            </h2>
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          <Badge className={getIntegrationStatusTone(status)}>{status}</Badge>
          <Badge className={policyState.tone}>{policyState.label}</Badge>
          <Badge className="border-zinc-700 bg-zinc-950 text-zinc-300">
            {formatSupportTier(selectedItem)}
          </Badge>
        </div>

        <p className="text-sm leading-7 text-zinc-400">
          {detail?.toolkit.description ?? selectedItem.description ?? ''}
        </p>
      </div>

      {loading ? (
        <div className="space-y-3">
          <Skeleton className="h-6 w-40 bg-zinc-800" />
          <Skeleton className="h-20 w-full bg-zinc-800" />
          <Skeleton className="h-20 w-full bg-zinc-800" />
          <Skeleton className="h-28 w-full bg-zinc-800" />
        </div>
      ) : error ? (
        <Alert className="border-red-500/30 bg-red-500/10 text-red-200">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : !detail ? null : (
        <>
          <div className="rounded-[1.25rem] border border-zinc-800 bg-zinc-950/70 p-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <p className="text-xs uppercase tracking-[0.18em] text-zinc-500">
                  Catalog capability
                </p>
                <p className="mt-2 text-sm leading-6 text-zinc-300">
                  {getCapabilitySummary(detail.toolkit)}
                </p>
              </div>
              <div>
                <p className="text-xs uppercase tracking-[0.18em] text-zinc-500">
                  Current selection
                </p>
                <p className="mt-2 text-sm leading-6 text-zinc-300">
                  {detail.selectedConnectedAccountId
                    ? 'Kodi will prefer the selected identity for this toolkit later.'
                    : detail.connections.length > 0
                      ? 'Kodi is in automatic mode and will choose the healthiest available account.'
                      : 'No account is connected yet for this toolkit.'}
                </p>
              </div>
            </div>
          </div>

          {detail.syncError && (
            <Alert className="border-amber-500/30 bg-amber-500/10 text-amber-100">
              <AlertDescription>{detail.syncError}</AlertDescription>
            </Alert>
          )}

          <section className="space-y-3">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-sm font-medium text-white">
                  Connected identities
                </p>
                <p className="text-sm text-zinc-400">
                  Pick the identity Kodi should prefer when more than one is
                  available.
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                {detail.selectedConnectedAccountId && (
                  <Button
                    type="button"
                    variant="ghost"
                    className="gap-2 border border-zinc-800 bg-zinc-950 text-zinc-300 hover:bg-zinc-900 hover:text-white"
                    disabled={preferenceActionKey !== null}
                    onClick={() =>
                      void onSelectConnection(detail.toolkit.slug, null)
                    }
                  >
                    Use automatic selection
                  </Button>
                )}
                <Button
                  type="button"
                  className="gap-2 bg-sky-500 text-white hover:bg-sky-400"
                  disabled={!canRunPrimaryAction || actionKey !== null}
                  onClick={() => void onConnect(detail.toolkit.slug)}
                >
                  <Link2 size={16} />
                  {connectLabel}
                </Button>
              </div>
            </div>

            {detail.connections.length === 0 ? (
              <div className="rounded-[1.25rem] border border-dashed border-zinc-800 bg-zinc-950/40 p-5">
                <p className="text-sm font-medium text-white">
                  No identities connected yet.
                </p>
                <p className="mt-2 text-sm leading-7 text-zinc-400">
                  Connect an account first so Kodi can later scope runtime tool
                  access to the right identity.
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                {detail.connections.map((connection) => {
                  const canPrefer = connection.status !== 'INACTIVE'
                  const isDisconnecting =
                    actionKey === `disconnect:${connection.connectedAccountId}`
                  const isSelecting =
                    preferenceActionKey === connection.connectedAccountId
                  const isAutomaticCandidate =
                    automaticCandidateId === connection.connectedAccountId

                  return (
                    <div
                      key={connection.connectedAccountId}
                      className={cn(
                        'rounded-[1.25rem] border p-4',
                        connection.isPreferred
                          ? 'border-emerald-500/25 bg-emerald-500/10'
                          : isAutomaticCandidate
                            ? 'border-sky-500/20 bg-sky-500/10'
                            : 'border-zinc-800 bg-zinc-950/70'
                      )}
                    >
                      <div className="flex flex-col gap-4">
                        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                          <div className="space-y-2">
                            <div className="flex flex-wrap items-center gap-2">
                              <p className="text-sm font-medium text-white">
                                {connection.externalUserEmail ||
                                  connection.connectedAccountLabel ||
                                  'Connected account'}
                              </p>
                              <Badge
                                className={getIntegrationStatusTone(
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
                              {!connection.isPreferred &&
                                isAutomaticCandidate && (
                                  <Badge className="border-sky-500/20 bg-sky-500/10 text-sky-200">
                                    Automatic candidate
                                  </Badge>
                                )}
                            </div>

                            <div className="flex flex-wrap gap-3 text-xs text-zinc-500">
                              {connection.connectedAccountLabel && (
                                <span>{connection.connectedAccountLabel}</span>
                              )}
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
                                  {formatIntegrationDate(connection.updatedAt)}
                                </span>
                              )}
                            </div>
                          </div>

                          <div className="flex flex-wrap gap-2">
                            {!connection.isPreferred && canPrefer && (
                              <Button
                                type="button"
                                variant="ghost"
                                className="gap-2 border border-zinc-800 bg-zinc-950 text-zinc-300 hover:bg-zinc-900 hover:text-white"
                                disabled={preferenceActionKey !== null}
                                onClick={() =>
                                  void onSelectConnection(
                                    detail.toolkit.slug,
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
                                void onDisconnect(connection.connectedAccountId)
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
                            {connection.scopes.slice(0, 6).map((scope) => (
                              <Badge
                                key={scope}
                                className="border-zinc-700 bg-zinc-900 text-zinc-300"
                              >
                                {formatScope(scope)}
                              </Badge>
                            ))}
                            {connection.scopes.length > 6 && (
                              <Badge className="border-zinc-700 bg-zinc-900 text-zinc-300">
                                +{connection.scopes.length - 6} more scopes
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
                })}
              </div>
            )}
          </section>

          <section className="space-y-3">
            <div className="flex items-center gap-2">
              <LockKeyhole size={16} className="text-zinc-400" />
              <p className="text-sm font-medium text-white">Workspace policy</p>
            </div>

            <p className="text-sm leading-7 text-zinc-400">
              {isOwner
                ? 'Owners decide whether this toolkit is available, which read contexts are allowed, and whether writes need approval by default.'
                : 'This is the workspace default policy. Owners can change it from this page.'}
            </p>

            {policyDraft && (
              <div className="space-y-3">
                <PolicyToggleRow
                  title="Toolkit enabled"
                  description="When disabled, Kodi should not use this toolkit even if users have connected it."
                  value={policyDraft.enabled}
                  trueLabel="Enabled"
                  falseLabel="Blocked"
                  disabled={!isOwner || policySaving}
                  onToggle={() =>
                    onPolicyDraftChange({
                      ...policyDraft,
                      enabled: !policyDraft.enabled,
                    })
                  }
                />

                <PolicyToggleRow
                  title="Chat reads"
                  description="Allow read-class actions from chat and general task flows."
                  value={policyDraft.chatReadsEnabled}
                  trueLabel="Allowed"
                  falseLabel="Off"
                  disabled={!isOwner || policySaving || !policyDraft.enabled}
                  onToggle={() =>
                    onPolicyDraftChange({
                      ...policyDraft,
                      chatReadsEnabled: !policyDraft.chatReadsEnabled,
                    })
                  }
                />

                <PolicyToggleRow
                  title="Meeting reads"
                  description="Allow meeting-time reads so Kodi can consult this tool while following calls."
                  value={policyDraft.meetingReadsEnabled}
                  trueLabel="Allowed"
                  falseLabel="Off"
                  disabled={!isOwner || policySaving || !policyDraft.enabled}
                  onToggle={() =>
                    onPolicyDraftChange({
                      ...policyDraft,
                      meetingReadsEnabled: !policyDraft.meetingReadsEnabled,
                    })
                  }
                />

                <PolicyToggleRow
                  title="Draft creation"
                  description="Allow Kodi to prepare drafts without making an external side effect."
                  value={policyDraft.draftsEnabled}
                  trueLabel="Allowed"
                  falseLabel="Off"
                  disabled={!isOwner || policySaving || !policyDraft.enabled}
                  onToggle={() =>
                    onPolicyDraftChange({
                      ...policyDraft,
                      draftsEnabled: !policyDraft.draftsEnabled,
                    })
                  }
                />

                <PolicyToggleRow
                  title="External writes"
                  description="Keep write-class actions behind approval unless your workspace explicitly wants direct execution."
                  value={policyDraft.writesRequireApproval}
                  trueLabel="Approval required"
                  falseLabel="Direct writes"
                  disabled={!isOwner || policySaving || !policyDraft.enabled}
                  onToggle={() =>
                    onPolicyDraftChange({
                      ...policyDraft,
                      writesRequireApproval: !policyDraft.writesRequireApproval,
                    })
                  }
                />

                <PolicyToggleRow
                  title="Admin actions"
                  description="Reserve high-risk admin actions for the rare cases where the workspace intentionally opts in."
                  value={policyDraft.adminActionsEnabled}
                  trueLabel="Enabled"
                  falseLabel="Disabled"
                  disabled={!isOwner || policySaving || !policyDraft.enabled}
                  onToggle={() =>
                    onPolicyDraftChange({
                      ...policyDraft,
                      adminActionsEnabled: !policyDraft.adminActionsEnabled,
                    })
                  }
                />
              </div>
            )}

            {isOwner ? (
              <div className="flex flex-wrap gap-2 pt-1">
                <Button
                  type="button"
                  className="bg-sky-500 text-white hover:bg-sky-400"
                  disabled={!policyDirty || policySaving}
                  onClick={() => void onSavePolicy(detail.toolkit.slug)}
                >
                  {policySaving ? 'Saving policy...' : 'Save policy'}
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  className="border border-zinc-800 bg-zinc-950 text-zinc-300 hover:bg-zinc-900 hover:text-white"
                  disabled={!policyDirty || policySaving}
                  onClick={onResetPolicy}
                >
                  Reset changes
                </Button>
              </div>
            ) : (
              <div className="rounded-2xl border border-zinc-800 bg-zinc-950/70 p-4 text-sm leading-7 text-zinc-400">
                Only workspace owners can update these defaults. Members can
                still connect their own accounts and see the current policy
                state from this page.
              </div>
            )}
          </section>

          <div className="flex flex-wrap gap-2 border-t border-zinc-800/80 pt-4">
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
            <Button
              type="button"
              variant="ghost"
              className="gap-2 border border-zinc-800 bg-zinc-950 text-zinc-300 hover:bg-zinc-900 hover:text-white"
              onClick={() => void onConnect(detail.toolkit.slug)}
              disabled={!canRunPrimaryAction || actionKey !== null}
            >
              <Link2 size={16} />
              Connect another identity
            </Button>
          </div>
        </>
      )}
    </div>
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
  const [selectedToolkitSlug, setSelectedToolkitSlug] = useState<string | null>(
    searchParams.get('toolkit')
  )
  const [detail, setDetail] = useState<ToolAccessToolkitDetail | null>(null)
  const [detailLoading, setDetailLoading] = useState(false)
  const [detailError, setDetailError] = useState<string | null>(null)
  const [preferenceActionKey, setPreferenceActionKey] = useState<string | null>(
    null
  )
  const [policyDraft, setPolicyDraft] = useState<PolicyDraft | null>(null)
  const [policySaving, setPolicySaving] = useState(false)
  const deferredSearch = useDeferredValue(search)

  const callbackStatus = searchParams.get('connectionStatus')
  const callbackAppName = searchParams.get('appName')
  const callbackToolkit = searchParams.get('toolkit')
  const isOwner = activeOrg?.role === 'owner'

  async function loadCatalog(orgId: string, searchValue: string) {
    const result = await trpc.toolAccess.getCatalog.query({
      orgId,
      search: searchValue.trim() || undefined,
      limit: 24,
    })
    setCatalog(result)
    return result
  }

  async function loadToolkitDetail(orgId: string, toolkitSlug: string) {
    const result = await trpc.toolAccess.getToolkitDetail.query({
      orgId,
      toolkitSlug,
    })

    setDetail(result)
    setPolicyDraft(createPolicyDraft(result.policy))
    return result
  }

  useEffect(() => {
    if (!callbackToolkit) return
    setSelectedToolkitSlug(callbackToolkit)
  }, [callbackToolkit])

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

  const selectedItem = useMemo(
    () =>
      catalog?.items.find((item) => item.slug === selectedToolkitSlug) ?? null,
    [catalog, selectedToolkitSlug]
  )

  useEffect(() => {
    if (loading) return

    if (!catalog || catalog.items.length === 0) {
      setSelectedToolkitSlug(null)
      setDetail(null)
      setPolicyDraft(null)
      return
    }

    if (
      selectedToolkitSlug &&
      catalog.items.some((item) => item.slug === selectedToolkitSlug)
    ) {
      return
    }

    setSelectedToolkitSlug(catalog.items[0]?.slug ?? null)
  }, [catalog, loading, selectedToolkitSlug])

  useEffect(() => {
    if (!activeOrg || !selectedToolkitSlug || loading) {
      if (!selectedToolkitSlug) {
        setDetail(null)
        setPolicyDraft(null)
        setDetailError(null)
      }
      return
    }

    if (!catalog?.setup.apiConfigured) {
      setDetail(null)
      setPolicyDraft(null)
      setDetailError(null)
      return
    }

    const orgId = activeOrg.orgId
    const toolkitSlug = selectedToolkitSlug
    let cancelled = false
    setDetailLoading(true)
    setDetailError(null)

    async function load() {
      try {
        const result = await trpc.toolAccess.getToolkitDetail.query({
          orgId,
          toolkitSlug,
        })

        if (cancelled) return
        setDetail(result)
        setPolicyDraft(createPolicyDraft(result.policy))
      } catch (err) {
        if (cancelled) return
        setDetail(null)
        setPolicyDraft(null)
        setDetailError(
          err instanceof Error ? err.message : 'Failed to load toolkit details.'
        )
      } finally {
        if (!cancelled) setDetailLoading(false)
      }
    }

    void load()
    return () => {
      cancelled = true
    }
  }, [
    activeOrg?.orgId,
    catalog?.setup.apiConfigured,
    loading,
    selectedToolkitSlug,
  ])

  async function refreshAll(toolkitSlugOverride?: string | null) {
    if (!activeOrg) return

    const nextSelectedToolkit = toolkitSlugOverride ?? selectedToolkitSlug
    setActionKey('refresh')
    setError(null)

    try {
      await loadCatalog(activeOrg.orgId, deferredSearch)
      if (nextSelectedToolkit && catalog?.setup.apiConfigured !== false) {
        await loadToolkitDetail(activeOrg.orgId, nextSelectedToolkit)
      }
      setDetailError(null)
    } catch (err) {
      const message =
        err instanceof Error
          ? err.message
          : 'Failed to refresh tool access integrations.'
      setError(message)
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
        returnPath: `/settings/integrations/tool-access?toolkit=${encodeURIComponent(toolkitSlug)}`,
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
    setDetailError(null)

    try {
      await trpc.toolAccess.disconnect.mutate({
        orgId: activeOrg.orgId,
        connectedAccountId,
      })
      await refreshAll(selectedToolkitSlug)
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Failed to disconnect account.'
      )
      setActionKey(null)
    }
  }

  async function selectPreferredConnection(
    toolkitSlug: string,
    connectedAccountId: string | null
  ) {
    if (!activeOrg) return
    setPreferenceActionKey(connectedAccountId ?? 'automatic')
    setError(null)
    setDetailError(null)

    try {
      await trpc.toolAccess.setPreferredConnection.mutate({
        orgId: activeOrg.orgId,
        toolkitSlug,
        connectedAccountId,
      })
      await refreshAll(toolkitSlug)
    } catch (err) {
      const message =
        err instanceof Error
          ? err.message
          : 'Failed to update the preferred account.'
      setDetailError(message)
    } finally {
      setPreferenceActionKey(null)
    }
  }

  async function savePolicy(toolkitSlug: string) {
    if (!activeOrg || !policyDraft) return
    setPolicySaving(true)
    setError(null)
    setDetailError(null)

    try {
      await trpc.toolAccess.updatePolicy.mutate({
        orgId: activeOrg.orgId,
        toolkitSlug,
        ...policyDraft,
      })
      await refreshAll(toolkitSlug)
    } catch (err) {
      const message =
        err instanceof Error ? err.message : 'Failed to save toolkit policy.'
      setDetailError(message)
    } finally {
      setPolicySaving(false)
    }
  }

  function handleInspect(toolkitSlug: string) {
    setSelectedToolkitSlug(toolkitSlug)
    const detailElement = document.getElementById('tool-access-detail')
    detailElement?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  function resetPolicyDraft() {
    if (!detail) return
    setPolicyDraft(createPolicyDraft(detail.policy))
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
      <div className="mx-auto max-w-7xl space-y-6 pb-8">
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
                  state, identity preference, and workspace policy for{' '}
                  {activeOrg.orgName}.
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
                  Owners define workspace defaults here
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
                  <div className="flex items-start gap-2">
                    <LockKeyhole size={16} className="mt-0.5 text-zinc-500" />
                    <div>
                      <p className="text-white">Policy surface</p>
                      <p className="text-zinc-400">
                        {isOwner
                          ? 'This workspace can change tool defaults directly from the detail panel.'
                          : 'Workspace policy is visible here even when you cannot change it.'}
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
                  onClick={() => void refreshAll()}
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
                      className={cn(
                        'rounded-full border px-3 py-2 text-sm transition',
                        filter === value
                          ? 'border-zinc-600 bg-zinc-100 text-zinc-950'
                          : 'border-zinc-800 bg-zinc-950 text-zinc-300 hover:border-zinc-700 hover:text-white'
                      )}
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
          <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_23rem]">
            <div className="space-y-4">
              {[0, 1, 2].map((item) => (
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
            <Skeleton className="min-h-[28rem] rounded-[1.75rem] bg-zinc-900/70" />
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
          <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_25rem]">
            <aside className="order-1 xl:order-2">
              <ToolAccessDetailPanel
                catalog={catalog}
                selectedItem={selectedItem}
                detail={detail}
                loading={detailLoading}
                error={detailError}
                isOwner={isOwner}
                actionKey={actionKey}
                preferenceActionKey={preferenceActionKey}
                policyDraft={policyDraft}
                policySaving={policySaving}
                onConnect={connectToolkit}
                onDisconnect={disconnectToolkit}
                onSelectConnection={selectPreferredConnection}
                onPolicyDraftChange={setPolicyDraft}
                onSavePolicy={savePolicy}
                onResetPolicy={resetPolicyDraft}
              />
            </aside>

            <div className="order-2 space-y-8 xl:order-1">
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

                  <div className="grid gap-4">
                    {section.items.map((item) => (
                      <ToolkitCard
                        key={item.slug}
                        item={item}
                        catalog={catalog}
                        actionKey={actionKey}
                        isSelected={selectedToolkitSlug === item.slug}
                        onInspect={handleInspect}
                        onConnect={connectToolkit}
                        onDisconnect={disconnectToolkit}
                      />
                    ))}
                  </div>
                </section>
              ))}
            </div>
          </div>
        )}
      </div>
    </SettingsLayout>
  )
}
