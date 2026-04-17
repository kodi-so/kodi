'use client'

import {
  ArrowUpRight,
  Check,
  CheckCircle2,
  ClipboardList,
  ExternalLink,
  FileText,
  Loader2,
  Pencil,
  RotateCcw,
  Send,
  X,
} from 'lucide-react'
import { Alert, AlertDescription } from '@kodi/ui/components/alert'
import { Badge } from '@kodi/ui/components/badge'
import { Button } from '@kodi/ui/components/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@kodi/ui/components/card'
import { Input } from '@kodi/ui/components/input'
import { Skeleton } from '@kodi/ui/components/skeleton'
import { Tooltip, TooltipContent, TooltipTrigger } from '@kodi/ui/components/tooltip'
import { SectionIcon } from '@/components/section-icon'
import type { MeetingArtifact, RecapTarget, SyncTarget, WorkItem } from './types'

export type PostMeetingReviewProps = {
  meeting: { id: string; status: string; title?: string | null }
  artifacts: MeetingArtifact[]
  workItems: WorkItem[]
  loading: boolean
  retrying: boolean
  editingWorkItemId: string | null
  editWorkItemTitle: string
  editWorkItemOwnerHint: string
  editWorkItemDueAt: string
  workItemSaving: string | null
  canRetry: boolean
  onRetry: () => void
  onStartEdit: (item: WorkItem) => void
  onCancelEdit: () => void
  onSaveEdit: (id: string) => void
  onEditTitleChange: (v: string) => void
  onEditOwnerHintChange: (v: string) => void
  onEditDueAtChange: (v: string) => void
  onApprove: (id: string) => void
  onReject: (id: string) => void
  syncingItem: { id: string; target: SyncTarget } | null
  onSync: (id: string, target: SyncTarget) => void
  syncError: string | null
  recapDelivering: boolean
  recapDeliverTarget: RecapTarget | null
  onDeliverRecap: (target: RecapTarget, channelId?: string) => void
  onOpenSlackModal: () => void
  hasSlackConnection: boolean
  hasZoomConnection: boolean
  recapDeliverError: string | null
  quietTextClass: string
  subtleTextClass: string
  dashedPanelClass: string
}

function workItemStatusTone(status: string) {
  switch (status) {
    case 'approved':
      return 'success' as const
    case 'cancelled':
      return 'destructive' as const
    case 'draft':
      return 'warning' as const
    case 'synced':
    case 'done':
      return 'info' as const
    case 'executing':
      return 'warning' as const
    default:
      return 'neutral' as const
  }
}

function workItemStatusLabel(status: string) {
  switch (status) {
    case 'draft':
      return 'Needs review'
    case 'approved':
      return 'Approved'
    case 'cancelled':
      return 'Rejected'
    case 'synced':
      return 'Synced'
    case 'executing':
      return 'Executing'
    case 'done':
      return 'Done'
    default:
      return status
  }
}

function workItemKindLabel(kind: string) {
  switch (kind) {
    case 'task':
      return 'Task'
    case 'ticket':
      return 'Ticket'
    case 'follow_up':
      return 'Follow-up'
    case 'goal':
      return 'Goal'
    case 'outcome':
      return 'Outcome'
    default:
      return kind
  }
}

function getArtifactMetaString(
  metadata: Record<string, unknown>,
  key: string
): string | null {
  const val = metadata[key]
  return typeof val === 'string' ? val : null
}

export function PostMeetingReview({
  meeting,
  artifacts,
  workItems,
  loading,
  retrying,
  editingWorkItemId,
  editWorkItemTitle,
  editWorkItemOwnerHint,
  editWorkItemDueAt,
  workItemSaving,
  canRetry,
  onRetry,
  onStartEdit,
  onCancelEdit,
  onSaveEdit,
  onEditTitleChange,
  onEditOwnerHintChange,
  onEditDueAtChange,
  onApprove,
  onReject,
  syncingItem,
  onSync,
  syncError,
  recapDelivering,
  recapDeliverTarget,
  onDeliverRecap,
  onOpenSlackModal,
  hasSlackConnection,
  hasZoomConnection,
  recapDeliverError,
  quietTextClass,
  subtleTextClass,
  dashedPanelClass,
}: PostMeetingReviewProps) {
  const isSummarizing = meeting.status === 'summarizing'

  const summaryArtifact = artifacts.find((a) => a.artifactType === 'summary')
  const decisionArtifact = artifacts.find(
    (a) => a.artifactType === 'decision_log'
  )

  const decisions: Array<{
    summary: string
    context: string | null
    madeBy: string | null
    confidence: number | null
    sourceEvidence: string[]
  }> = Array.isArray(decisionArtifact?.structuredData)
    ? (decisionArtifact.structuredData as Record<string, unknown>[])
        .map((d) => ({
          summary: typeof d.summary === 'string' ? d.summary : '',
          context: typeof d.context === 'string' ? d.context : null,
          madeBy: typeof d.madeBy === 'string' ? d.madeBy : null,
          confidence: typeof d.confidence === 'number' ? d.confidence : null,
          sourceEvidence: Array.isArray(d.sourceEvidence)
            ? (d.sourceEvidence as string[]).filter(
                (s) => typeof s === 'string'
              )
            : [],
        }))
        .filter((d) => d.summary)
    : []

  const activeWorkItems = workItems.filter((w) => w.status !== 'cancelled')
  const draftCount = workItems.filter((w) => w.status === 'draft').length

  return (
    <div className="space-y-4">
      {isSummarizing && (
        <div className="flex items-center gap-3 rounded-xl border border-border bg-secondary px-5 py-4">
          <Loader2
            size={16}
            className="shrink-0 animate-spin text-primary"
          />
          <p className="text-sm text-foreground">
            Kodi is generating the meeting recap — summary, decisions, and
            action items. This usually takes 15–30 seconds.
          </p>
        </div>
      )}

      <Card className="border-border shadow-sm">
        <CardHeader>
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-3">
              <SectionIcon icon={FileText} />
              <div>
                <CardTitle className="text-lg text-foreground">
                  Meeting recap
                </CardTitle>
                <CardDescription>
                  {isSummarizing
                    ? 'Kodi is generating the post-meeting package.'
                    : 'Summary and key decisions captured from this session.'}
                </CardDescription>
              </div>
            </div>

            {canRetry && !isSummarizing && (
              <Button
                variant="ghost"
                size="sm"
                onClick={onRetry}
                disabled={retrying}
                className="gap-1.5 text-muted-foreground hover:text-foreground"
              >
                <RotateCcw
                  size={13}
                  className={retrying ? 'animate-spin' : ''}
                />
                {retrying ? 'Retrying…' : 'Retry'}
              </Button>
            )}
          </div>
        </CardHeader>

        <CardContent className="space-y-5">
          {!isSummarizing &&
            !loading &&
            (hasSlackConnection || hasZoomConnection) && (
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <p className={`text-xs ${subtleTextClass}`}>
                  Deliver this recap to your team
                </p>
                <div className="flex flex-wrap gap-2">
                  {hasSlackConnection && (
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      disabled={recapDelivering}
                      onClick={onOpenSlackModal}
                      className="gap-1.5 text-xs"
                    >
                      {recapDelivering && recapDeliverTarget === 'slack' ? (
                        <Loader2 size={12} className="animate-spin" />
                      ) : (
                        <Send size={12} />
                      )}
                      {recapDelivering && recapDeliverTarget === 'slack'
                        ? 'Sending…'
                        : 'Send to Slack'}
                    </Button>
                  )}
                  {hasZoomConnection && (
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      disabled={recapDelivering}
                      onClick={() => onDeliverRecap('zoom')}
                      className="gap-1.5 text-xs"
                    >
                      {recapDelivering && recapDeliverTarget === 'zoom' ? (
                        <Loader2 size={12} className="animate-spin" />
                      ) : (
                        <Send size={12} />
                      )}
                      {recapDelivering && recapDeliverTarget === 'zoom'
                        ? 'Sending…'
                        : 'Zoom Team Chat'}
                    </Button>
                  )}
                </div>
              </div>
            )}
          {recapDeliverError && (
            <p className="rounded-lg bg-destructive/10 px-3 py-2 text-xs text-destructive">
              {recapDeliverError}
            </p>
          )}

          <div>
            <p
              className={`text-[11px] uppercase tracking-[0.2em] ${subtleTextClass}`}
            >
              Summary
            </p>

            {loading || isSummarizing ? (
              <div className="mt-3 space-y-2">
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-4 w-4/5" />
                <Skeleton className="h-4 w-3/5" />
              </div>
            ) : summaryArtifact?.content ? (
              <div className="mt-3 rounded-xl border border-border bg-secondary p-5">
                <p className="text-sm leading-7 text-foreground">
                  {summaryArtifact.content}
                </p>
                {Array.isArray(
                  (
                    summaryArtifact.structuredData as Record<
                      string,
                      unknown
                    > | null
                  )?.keyOutcomes
                ) && (
                  <div className="mt-4 space-y-1">
                    <p
                      className={`text-[11px] uppercase tracking-[0.2em] ${subtleTextClass}`}
                    >
                      Key outcomes
                    </p>
                    <ul className="mt-2 space-y-1">
                      {(
                        (
                          summaryArtifact.structuredData as Record<
                            string,
                            unknown
                          >
                        ).keyOutcomes as string[]
                      ).map((outcome) => (
                        <li
                          key={outcome}
                          className="flex items-start gap-2 text-sm text-foreground"
                        >
                          <CheckCircle2
                            size={14}
                            className="mt-0.5 shrink-0 text-brand-success"
                          />
                          {outcome}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            ) : (
              <div
                className={`mt-3 ${dashedPanelClass} rounded-xl p-4 text-sm ${quietTextClass}`}
              >
                {meeting.status === 'ended'
                  ? 'Summary was not generated for this meeting. Use the retry button to generate it.'
                  : 'Summary will appear here once Kodi finishes processing.'}
              </div>
            )}
          </div>

          <div>
            <p
              className={`text-[11px] uppercase tracking-[0.2em] ${subtleTextClass}`}
            >
              Decisions
            </p>

            {loading || isSummarizing ? (
              <div className="mt-3 space-y-2">
                <Skeleton className="h-12" />
                <Skeleton className="h-12" />
              </div>
            ) : decisions.length > 0 ? (
              <div className="mt-3 space-y-2">
                {decisions.map((decision, index) => (
                  <div
                    key={`decision-${index}`}
                    className="rounded-xl border border-border bg-secondary p-4"
                  >
                    <div className="flex items-start gap-2.5">
                      <CheckCircle2
                        size={15}
                        className="mt-0.5 shrink-0 text-brand-success"
                      />
                      <div className="min-w-0 flex-1 space-y-1">
                        <p className="text-sm text-foreground">
                          {decision.summary}
                        </p>
                        {decision.context && (
                          <p className={`text-xs leading-5 ${quietTextClass}`}>
                            {decision.context}
                          </p>
                        )}
                        <div
                          className={`flex flex-wrap items-center gap-2 text-xs ${subtleTextClass}`}
                        >
                          {decision.madeBy && (
                            <span>by {decision.madeBy}</span>
                          )}
                          {decision.confidence != null && (
                            <Badge variant="outline">
                              {Math.round(decision.confidence * 100)}% confident
                            </Badge>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : !loading ? (
              <div
                className={`mt-3 ${dashedPanelClass} rounded-xl p-4 text-sm ${quietTextClass}`}
              >
                No decisions were identified in this meeting.
              </div>
            ) : null}
          </div>
        </CardContent>
      </Card>

      <Card className="border-border shadow-sm">
        <CardHeader>
          <div className="flex items-center gap-3">
            <SectionIcon icon={ClipboardList} />
            <div>
              <CardTitle className="text-lg text-foreground">
                Action items
              </CardTitle>
              <CardDescription>
                {draftCount > 0
                  ? `${draftCount} item${draftCount === 1 ? '' : 's'} need${draftCount === 1 ? 's' : ''} review — approve to queue for follow-through or reject to dismiss.`
                  : 'Review and correct what Kodi extracted from the meeting.'}
              </CardDescription>
            </div>
          </div>
        </CardHeader>

        <CardContent>
          {loading || isSummarizing ? (
            <div className="space-y-3">
              <Skeleton className="h-16" />
              <Skeleton className="h-16" />
              <Skeleton className="h-16" />
            </div>
          ) : activeWorkItems.length === 0 &&
            workItems.filter((w) => w.status === 'cancelled').length === 0 ? (
            <div
              className={`${dashedPanelClass} rounded-xl p-5 text-sm ${quietTextClass}`}
            >
              {meeting.status === 'ended'
                ? 'No action items were generated. Use retry to regenerate the post-meeting package.'
                : 'Action items will appear here once the recap is ready.'}
            </div>
          ) : (
            <div className="space-y-3">
              {workItems.map((item) => {
                const isEditing = editingWorkItemId === item.id
                const isSaving = workItemSaving === item.id
                const meta =
                  item.metadata &&
                  typeof item.metadata === 'object' &&
                  !Array.isArray(item.metadata)
                    ? (item.metadata as Record<string, unknown>)
                    : {}
                const ownerHint = getArtifactMetaString(meta, 'ownerHint')
                const dueDateHint = getArtifactMetaString(meta, 'dueDateHint')
                const confidence =
                  typeof meta.confidence === 'number' ? meta.confidence : null

                return (
                  <div
                    key={item.id}
                    className={`rounded-xl border p-4 transition-colors ${
                      item.status === 'cancelled'
                        ? 'border-border bg-secondary opacity-50'
                        : item.status === 'approved'
                          ? 'border-brand-success/30 bg-secondary'
                          : 'border-border bg-secondary'
                    }`}
                  >
                    {isEditing ? (
                      <div className="space-y-3">
                        <div className="space-y-1.5">
                          <p
                            className={`text-[11px] uppercase tracking-[0.18em] ${subtleTextClass}`}
                          >
                            Title
                          </p>
                          <Input
                            value={editWorkItemTitle}
                            onChange={(e) => onEditTitleChange(e.target.value)}
                            className="h-9 text-sm"
                            autoFocus
                          />
                        </div>
                        <div className="grid gap-3 sm:grid-cols-2">
                          <div className="space-y-1.5">
                            <p
                              className={`text-[11px] uppercase tracking-[0.18em] ${subtleTextClass}`}
                            >
                              Owner
                            </p>
                            <Input
                              value={editWorkItemOwnerHint}
                              onChange={(e) =>
                                onEditOwnerHintChange(e.target.value)
                              }
                              placeholder="Name or team"
                              className="h-9 text-sm"
                            />
                          </div>
                          <div className="space-y-1.5">
                            <p
                              className={`text-[11px] uppercase tracking-[0.18em] ${subtleTextClass}`}
                            >
                              Due date
                            </p>
                            <Input
                              type="date"
                              value={editWorkItemDueAt}
                              onChange={(e) =>
                                onEditDueAtChange(e.target.value)
                              }
                              className="h-9 text-sm"
                            />
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <Button
                            size="sm"
                            onClick={() => onSaveEdit(item.id)}
                            disabled={isSaving || !editWorkItemTitle.trim()}
                            className="gap-1.5"
                          >
                            <Check size={13} />
                            {isSaving ? 'Saving…' : 'Save'}
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={onCancelEdit}
                            disabled={isSaving}
                          >
                            Cancel
                          </Button>
                        </div>
                      </div>
                    ) : (
                      <div className="flex items-start gap-3">
                        <div className="min-w-0 flex-1 space-y-2">
                          <div className="flex flex-wrap items-center gap-2">
                            <Badge variant={workItemStatusTone(item.status)}>
                              {workItemStatusLabel(item.status)}
                            </Badge>
                            <Badge variant="neutral">
                              {workItemKindLabel(item.kind)}
                            </Badge>
                            {confidence != null && (
                              <Badge variant="outline">
                                {Math.round(confidence * 100)}%
                              </Badge>
                            )}
                          </div>

                          <p className="text-sm font-medium text-foreground">
                            {item.title}
                          </p>

                          {item.description && (
                            <p
                              className={`text-sm leading-6 ${quietTextClass}`}
                            >
                              {item.description}
                            </p>
                          )}

                          <div
                            className={`flex flex-wrap items-center gap-3 text-xs ${subtleTextClass}`}
                          >
                            {ownerHint && <span>Owner: {ownerHint}</span>}
                            {item.dueAt && (
                              <span>
                                Due{' '}
                                {new Date(item.dueAt).toLocaleDateString([], {
                                  month: 'short',
                                  day: 'numeric',
                                  year: 'numeric',
                                })}
                              </span>
                            )}
                            {dueDateHint && !item.dueAt && (
                              <span className={quietTextClass}>
                                Suggested: {dueDateHint}
                              </span>
                            )}
                            {item.externalId && (
                              <span className="flex items-center gap-1 text-primary">
                                {item.externalSystem && (
                                  <span className="capitalize">
                                    {item.externalSystem}:
                                  </span>
                                )}
                                {getArtifactMetaString(
                                  meta,
                                  'externalUrl'
                                ) ? (
                                  <a
                                    href={
                                      getArtifactMetaString(
                                        meta,
                                        'externalUrl'
                                      )!
                                    }
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="flex items-center gap-0.5 hover:underline"
                                  >
                                    {item.externalId}
                                    <ArrowUpRight size={11} />
                                  </a>
                                ) : (
                                  item.externalId
                                )}
                              </span>
                            )}
                          </div>

                          {item.status === 'approved' && !item.externalId && (
                            <div className="flex flex-wrap items-center gap-1.5">
                              {syncError && syncingItem?.id === item.id && (
                                <p className="w-full text-xs text-destructive">
                                  {syncError}
                                </p>
                              )}
                              <Button
                                type="button"
                                size="sm"
                                variant="outline"
                                disabled={syncingItem !== null}
                                onClick={() => onSync(item.id, 'linear')}
                                className="h-7 gap-1 text-xs"
                              >
                                {syncingItem?.id === item.id &&
                                syncingItem.target === 'linear' ? (
                                  <Loader2
                                    size={11}
                                    className="animate-spin"
                                  />
                                ) : (
                                  <ExternalLink size={11} />
                                )}
                                Linear
                              </Button>
                              <Button
                                type="button"
                                size="sm"
                                variant="outline"
                                disabled={syncingItem !== null}
                                onClick={() => onSync(item.id, 'github')}
                                className="h-7 gap-1 text-xs"
                              >
                                {syncingItem?.id === item.id &&
                                syncingItem.target === 'github' ? (
                                  <Loader2
                                    size={11}
                                    className="animate-spin"
                                  />
                                ) : (
                                  <ExternalLink size={11} />
                                )}
                                GitHub
                              </Button>
                            </div>
                          )}
                        </div>

                        {item.status !== 'cancelled' && (
                          <div className="flex shrink-0 items-center gap-1">
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="icon"
                                  onClick={() => onStartEdit(item)}
                                  disabled={isSaving}
                                  className={`h-auto w-auto rounded-lg p-1.5 hover:bg-border/50 ${subtleTextClass}`}
                                >
                                  <Pencil size={13} />
                                </Button>
                              </TooltipTrigger>
                              <TooltipContent>Edit</TooltipContent>
                            </Tooltip>
                            {item.status === 'draft' && (
                              <>
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <Button
                                      type="button"
                                      variant="ghost"
                                      size="icon"
                                      onClick={() => onApprove(item.id)}
                                      disabled={isSaving}
                                      className="h-auto w-auto rounded-lg p-1.5 text-brand-success hover:bg-brand-success/10"
                                    >
                                      <Check size={13} />
                                    </Button>
                                  </TooltipTrigger>
                                  <TooltipContent>Approve</TooltipContent>
                                </Tooltip>
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <Button
                                      type="button"
                                      variant="ghost"
                                      size="icon"
                                      onClick={() => onReject(item.id)}
                                      disabled={isSaving}
                                      className="h-auto w-auto rounded-lg p-1.5 text-destructive hover:bg-destructive/10"
                                    >
                                      <X size={13} />
                                    </Button>
                                  </TooltipTrigger>
                                  <TooltipContent>Reject</TooltipContent>
                                </Tooltip>
                              </>
                            )}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )
              })}

              {workItems.some((w) => w.status === 'cancelled') && (
                <details className="group">
                  <summary
                    className={`cursor-pointer list-none text-xs marker:hidden ${subtleTextClass}`}
                  >
                    Show rejected items (
                    {workItems.filter((w) => w.status === 'cancelled').length})
                  </summary>
                  <div className="mt-2 space-y-2">
                    {workItems
                      .filter((w) => w.status === 'cancelled')
                      .map((item) => (
                        <div
                          key={item.id}
                          className="rounded-xl border border-border bg-secondary p-3 opacity-50"
                        >
                          <p
                            className={`text-sm line-through ${quietTextClass}`}
                          >
                            {item.title}
                          </p>
                        </div>
                      ))}
                  </div>
                </details>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
