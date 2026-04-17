'use client'

import { Link2 } from 'lucide-react'
import { Button } from '@kodi/ui/components/button'
import {
  dashedPanelClass,
  quietTextClass,
} from '@/lib/brand-styles'
import { type ToolAccessToolkitDetail } from '../../_lib/tool-access-ui'
import { CollapsibleSection } from './collapsible-section'
import { ConnectionCard } from './connection-card'

export function IdentitiesSection({
  detail,
  visibleConnections,
  connectLabel,
  canRunPrimaryAction,
  actionKey,
  preferenceActionKey,
  expanded,
  onToggle,
  onConnect,
  onDisconnect,
  onRevalidate,
  onSelectPreferred,
  onClearPreferred,
}: {
  detail: ToolAccessToolkitDetail
  visibleConnections: ToolAccessToolkitDetail['connections']
  connectLabel: string
  canRunPrimaryAction: boolean
  actionKey: string | null
  preferenceActionKey: string | null
  expanded: boolean
  onToggle: () => void
  onConnect: () => void
  onDisconnect: (connectedAccountId: string) => void
  onRevalidate: (connectedAccountId: string) => void
  onSelectPreferred: (connectedAccountId: string) => void
  onClearPreferred: () => void
}) {
  return (
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
          variant: 'neutral',
        },
        ...(detail.selectedConnectedAccountId
          ? [
              {
                label: 'Preferred identity set',
                variant: 'success' as const,
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
              className="gap-2 border border-border bg-card text-muted-foreground hover:bg-secondary hover:text-foreground"
              disabled={preferenceActionKey !== null}
              onClick={onClearPreferred}
            >
              Use automatic selection
            </Button>
          )}
          <Button
            type="button"
            className="gap-2"
            disabled={!canRunPrimaryAction || actionKey !== null}
            onClick={onConnect}
          >
            <Link2 size={16} />
            {visibleConnections.length > 0
              ? 'Connect another identity'
              : connectLabel}
          </Button>
        </>
      }
      expanded={expanded}
      onToggle={onToggle}
    >
      {visibleConnections.length === 0 ? (
        <div
          className={`${dashedPanelClass} mt-4 rounded-lg p-5`}
        >
          <p className="text-sm font-medium text-foreground">
            No identities connected yet.
          </p>
          <p className={`mt-2 text-sm leading-7 ${quietTextClass}`}>
            Connect an account first so Kodi can scope runtime access
            to the right identity when it uses this integration.
          </p>
        </div>
      ) : (
        <div className="mt-4 space-y-3">
          {visibleConnections.map((connection) => (
            <ConnectionCard
              key={connection.connectedAccountId}
              connection={connection}
              actionKey={actionKey}
              preferenceActionKey={preferenceActionKey}
              onDisconnect={onDisconnect}
              onRevalidate={onRevalidate}
              onSelectPreferred={onSelectPreferred}
            />
          ))}
        </div>
      )}
    </CollapsibleSection>
  )
}
