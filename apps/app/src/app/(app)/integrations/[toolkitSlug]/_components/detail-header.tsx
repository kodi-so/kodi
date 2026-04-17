import Link from 'next/link'
import { ArrowLeft, RefreshCcw } from 'lucide-react'
import { Badge, Button, Skeleton } from '@kodi/ui'
import {
  quietTextClass,
  subtleTextClass,
  type BrandBadgeTone,
} from '@/lib/brand-styles'
import {
  formatAuthMode,
  formatSupportTier,
  getStatusTone,
  type ToolAccessToolkitDetail,
} from '../../_lib/tool-access-ui'
import { ToolkitLogo } from '../../_components/toolkit-logo'

export function DetailHeader({
  loading,
  detail,
  status,
  policyState,
  actionKey,
  onRefresh,
}: {
  loading: boolean
  detail: ToolAccessToolkitDetail | null
  status: string
  policyState: { label: string; tone: BrandBadgeTone; detail: string } | null
  actionKey: string | null
  onRefresh: () => void
}) {
  return (
    <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div className="space-y-3">
        <Button
          asChild
          variant="ghost"
          className="w-fit gap-2 px-0 text-brand-quiet hover:bg-transparent hover:text-foreground"
        >
          <Link href="/integrations">
            <ArrowLeft size={16} />
            Back to integrations
          </Link>
        </Button>

        {loading ? (
          <div className="space-y-2">
            <Skeleton className="h-4 w-28 bg-brand-muted" />
            <Skeleton className="h-10 w-56 bg-brand-muted" />
          </div>
        ) : detail ? (
          <div className="space-y-3">
            <div className="flex flex-wrap gap-2">
              <Badge variant={getStatusTone(status)}>{status}</Badge>
              <Badge variant="neutral">
                {formatSupportTier(detail.toolkit.supportTier)}
              </Badge>
              <Badge variant="neutral">
                {formatAuthMode(detail.toolkit.authMode)}
              </Badge>
              {policyState && (
                <Badge variant={policyState.tone}>
                  {policyState.label}
                </Badge>
              )}
            </div>

            <div className="flex items-start gap-4">
              <ToolkitLogo
                name={detail.toolkit.name}
                logoUrl={detail.toolkit.logo}
                className="h-14 w-14 flex-shrink-0 rounded-[1.35rem] border-brand-line bg-brand-elevated"
                imageClassName="p-3"
              />
              <div className="space-y-2">
                <h1 className="text-3xl font-semibold tracking-tight text-foreground">
                  {detail.toolkit.name}
                </h1>
                <p
                  className={`max-w-3xl text-sm leading-7 ${quietTextClass}`}
                >
                  {detail.toolkit.description ??
                    'No provider description is available yet for this integration.'}
                </p>
              </div>
            </div>
          </div>
        ) : (
          <div className="space-y-2">
            <p className={`text-sm ${subtleTextClass}`}>
              Integration detail
            </p>
            <h1 className="text-3xl font-semibold tracking-tight text-foreground">
              Integration not found
            </h1>
          </div>
        )}
      </div>

      <div className="flex flex-wrap gap-2">
        <Button
          onClick={onRefresh}
          variant="ghost"
          className="gap-2 border border-brand-line bg-brand-elevated text-brand-quiet hover:bg-secondary hover:text-foreground"
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
          className="gap-2 border border-brand-line bg-brand-elevated text-brand-quiet hover:bg-secondary hover:text-foreground"
        >
          <Link href="/integrations/add">Browse catalog</Link>
        </Button>
      </div>
    </div>
  )
}
