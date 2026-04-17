'use client'

import { ExternalLink, Link2 } from 'lucide-react'
import { Button } from '@kodi/ui/components/button'
import {
  heroPanelClass,
  quietTextClass,
  subtleTextClass,
  type BrandBadgeTone,
} from '@/lib/brand-styles'
import {
  getCapabilitySummary,
  getConnectionLabel,
  type ToolAccessToolkitDetail,
} from '../../_lib/tool-access-ui'

export function OverviewSection({
  detail,
  primaryConnection,
  policyState,
  actionKey,
  toolkitSlug,
  connectLabel,
  canRunPrimaryAction,
  onConnect,
  onDisconnect,
}: {
  detail: ToolAccessToolkitDetail
  primaryConnection: ToolAccessToolkitDetail['connections'][number] | null
  policyState: { label: string; tone: BrandBadgeTone; detail: string } | null
  actionKey: string | null
  toolkitSlug: string
  connectLabel: string
  canRunPrimaryAction: boolean
  onConnect: () => void
  onDisconnect: (connectedAccountId: string) => void
}) {
  return (
    <section className={`${heroPanelClass} rounded-xl p-6`}>
      <div className="flex flex-col gap-5 sm:flex-row sm:items-start sm:justify-between">
        <div className="space-y-3">
          <p
            className={`text-xs uppercase tracking-[0.18em] ${subtleTextClass}`}
          >
            Overview
          </p>
          <div className="space-y-2">
            <p className="text-sm font-medium text-foreground">
              {primaryConnection
                ? getConnectionLabel(primaryConnection)
                : detail.toolkit.authMode === 'no_auth'
                  ? 'No connected identity required'
                  : 'No identity connected yet'}
            </p>
            <p className={`text-sm leading-7 ${quietTextClass}`}>
              {getCapabilitySummary(detail.toolkit)}.{' '}
              {policyState?.detail}
            </p>
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          {primaryConnection?.status === 'ACTIVE' ? (
            <Button
              onClick={() =>
                void onDisconnect(
                  primaryConnection.connectedAccountId
                )
              }
              variant="destructive"
              disabled={actionKey !== null}
            >
              {actionKey ===
              `disconnect:${primaryConnection.connectedAccountId}`
                ? 'Disconnecting...'
                : 'Disconnect'}
            </Button>
          ) : (
            <Button
              onClick={onConnect}
              className="gap-2"
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
              className="gap-2 border border-border bg-card text-muted-foreground hover:bg-secondary hover:text-foreground"
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
  )
}
