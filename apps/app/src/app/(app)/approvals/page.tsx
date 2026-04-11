'use client'

import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { Alert, AlertDescription, Badge, Button, Skeleton, cn } from '@kodi/ui'
import { pageShellClass } from '@/lib/brand-styles'
import { useOrg } from '@/lib/org-context'
import { trpc } from '@/lib/trpc'

type ApprovalItem = Awaited<
  ReturnType<typeof trpc.approval.list.query>
>['items'][number]

function formatDate(value: Date | string | null | undefined) {
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

function getStatusTone(status: ApprovalItem['status']) {
  switch (status) {
    case 'pending':
      return 'warning' as const
    case 'approved':
      return 'success' as const
    case 'rejected':
      return 'destructive' as const
    case 'expired':
      return 'neutral' as const
    default:
      return 'neutral' as const
  }
}

function getExecutionTone(status: ApprovalItem['executionStatus']) {
  switch (status) {
    case 'succeeded':
      return 'success' as const
    case 'failed':
      return 'destructive' as const
    case 'running':
      return 'info' as const
    case 'cancelled':
      return 'neutral' as const
    case 'pending':
      return 'warning' as const
    default:
      return 'outline' as const
  }
}

function asRecord(value: unknown) {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null
}

function getPreviewSummary(item: ApprovalItem) {
  const preview = asRecord(item.previewPayload)
  const summary =
    preview && typeof preview.summary === 'string' ? preview.summary : null
  return summary ?? 'Review this external action before Kodi executes it.'
}

function getPreviewFields(item: ApprovalItem) {
  const preview = asRecord(item.previewPayload)
  const fieldPreview = preview?.fieldPreview

  if (!Array.isArray(fieldPreview)) {
    return []
  }

  return fieldPreview
    .map((entry) => {
      const record = asRecord(entry)
      if (!record) return null
      const label = typeof record.label === 'string' ? record.label : 'Field'
      const value =
        typeof record.value === 'string'
          ? record.value
          : JSON.stringify(record.value)
      return { label, value }
    })
    .filter(
      (entry): entry is { label: string; value: string } => entry !== null
    )
}

export default function ApprovalsPage() {
  const { activeOrg } = useOrg()
  const searchParams = useSearchParams()
  const highlightedApprovalId = searchParams.get('approvalRequestId')
  const [actionKey, setActionKey] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [successMessage, setSuccessMessage] = useState<string | null>(null)
  const [items, setItems] = useState<ApprovalItem[]>([])
  const [loading, setLoading] = useState(true)

  async function loadApprovals(orgId: string) {
    const result = await trpc.approval.list.query({
      orgId,
      limit: 100,
    })
    setItems(result.items)
    return result
  }

  useEffect(() => {
    if (!activeOrg) {
      setLoading(false)
      return
    }

    let cancelled = false
    setLoading(true)
    setError(null)

    void loadApprovals(activeOrg.orgId)
      .catch((nextError) => {
        if (cancelled) return
        setError(
          nextError instanceof Error
            ? nextError.message
            : 'Failed to load approval requests.'
        )
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [activeOrg?.orgId])

  const pendingItems = useMemo(
    () => items.filter((item) => item.status === 'pending'),
    [items]
  )
  const recentItems = useMemo(
    () => items.filter((item) => item.status !== 'pending'),
    [items]
  )

  async function decideApproval(
    approvalRequestId: string,
    decision: 'approved' | 'rejected'
  ) {
    if (!activeOrg) return
    setActionKey(`${decision}:${approvalRequestId}`)
    setError(null)
    setSuccessMessage(null)

    try {
      const result = await trpc.approval.decide.mutate({
        orgId: activeOrg.orgId,
        approvalRequestId,
        decision,
      })
      await loadApprovals(activeOrg.orgId)
      setSuccessMessage(result.message)
    } catch (nextError) {
      setError(
        nextError instanceof Error
          ? nextError.message
          : 'Failed to update the approval request.'
      )
    } finally {
      setActionKey(null)
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
        <div className="space-y-2">
          <p className="text-sm uppercase tracking-[0.18em] text-muted-foreground">
            Approvals
          </p>
          <h1 className="text-3xl font-semibold tracking-tight text-foreground">
            Review external actions before they run
          </h1>
          <p className="max-w-3xl text-sm leading-7 text-muted-foreground">
            Kodi routes policy-gated writes and administrative actions here so
            someone can review the exact payload before execution.
          </p>
        </div>

        {error && (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {successMessage && (
          <Alert variant="success">
            <AlertDescription>{successMessage}</AlertDescription>
          </Alert>
        )}

        {loading ? (
          <div className="space-y-4">
            <Skeleton className="h-40 rounded-[1.6rem]" />
            <Skeleton className="h-40 rounded-[1.6rem]" />
          </div>
        ) : (
          <>
            <section className="space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="text-xl font-semibold text-foreground">
                  Pending approvals
                </h2>
                <Badge variant="outline">{pendingItems.length} pending</Badge>
              </div>

              {pendingItems.length === 0 ? (
                <div className="rounded-[1.4rem] border border-dashed border-border bg-card p-6 text-sm text-muted-foreground">
                  Nothing is waiting for approval right now.
                </div>
              ) : (
                <div className="space-y-4">
                  {pendingItems.map((item) => {
                    const preview = asRecord(item.previewPayload)
                    const targetText =
                      preview && typeof preview.targetText === 'string'
                        ? preview.targetText
                        : null
                    const fields = getPreviewFields(item)
                    const isHighlighted = highlightedApprovalId === item.id

                    return (
                      <section
                        key={item.id}
                        className={cn(
                          'kodi-panel-surface rounded-[1.6rem] border p-6 shadow-brand-panel',
                          isHighlighted ? 'border-primary/45' : 'border-brand-line'
                        )}
                      >
                        <div className="flex flex-col gap-4">
                          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                            <div className="space-y-2">
                              <div className="flex flex-wrap items-center gap-2">
                                <Badge variant={getStatusTone(item.status)}>
                                  {item.status}
                                </Badge>
                                {item.toolkitSlug && (
                                  <Badge variant="outline">
                                    {item.toolkitSlug}
                                  </Badge>
                                )}
                                {item.actionCategory && (
                                  <Badge variant="outline">
                                    {item.actionCategory}
                                  </Badge>
                                )}
                              </div>
                              <h3 className="text-xl font-semibold text-foreground">
                                {preview && typeof preview.title === 'string'
                                  ? preview.title
                                  : (item.action ?? 'External action approval')}
                              </h3>
                              <p className="max-w-3xl text-sm leading-7 text-muted-foreground">
                                {getPreviewSummary(item)}
                              </p>
                            </div>

                            <div className="flex flex-wrap gap-2">
                              <Button
                                type="button"
                                variant="outline"
                                className="border-brand-danger text-brand-danger hover:bg-brand-danger-soft"
                                disabled={actionKey !== null}
                                onClick={() =>
                                  void decideApproval(item.id, 'rejected')
                                }
                              >
                                {actionKey === `rejected:${item.id}`
                                  ? 'Rejecting...'
                                  : 'Reject'}
                              </Button>
                              <Button
                                type="button"
                                className="bg-primary text-primary-foreground hover:bg-primary/90"
                                disabled={actionKey !== null}
                                onClick={() =>
                                  void decideApproval(item.id, 'approved')
                                }
                              >
                                {actionKey === `approved:${item.id}`
                                  ? 'Approving...'
                                  : 'Approve and run'}
                              </Button>
                            </div>
                          </div>

                          <div className="grid gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(18rem,1fr)]">
                            <div className="rounded-[1.2rem] border border-brand-line bg-secondary p-4">
                              <p className="text-sm font-medium text-foreground">
                                Requested action
                              </p>
                              <div className="mt-3 space-y-2 text-sm text-foreground">
                                <p>
                                  <span className="text-brand-subtle">Action:</span>{' '}
                                  {item.action ?? 'Unknown'}
                                </p>
                                {targetText && (
                                  <p>
                                    <span className="text-brand-subtle">
                                      Target:
                                    </span>{' '}
                                    {targetText}
                                  </p>
                                )}
                                <p>
                                  <span className="text-brand-subtle">
                                    Requested by:
                                  </span>{' '}
                                  {item.requestedByUser?.name ??
                                    item.requestedByUser?.email ??
                                    'Unknown'}
                                </p>
                                <p>
                                  <span className="text-brand-subtle">
                                    Created:
                                  </span>{' '}
                                  {formatDate(item.createdAt)}
                                </p>
                                {item.expiresAt && (
                                  <p>
                                    <span className="text-brand-subtle">
                                      Expires:
                                    </span>{' '}
                                    {formatDate(item.expiresAt)}
                                  </p>
                                )}
                              </div>
                            </div>

                            <div className="rounded-[1.2rem] border border-brand-line bg-brand-elevated p-4">
                              <p className="text-sm font-medium text-foreground">
                                Payload preview
                              </p>
                              {fields.length === 0 ? (
                                <p className="mt-3 text-sm leading-7 text-brand-quiet">
                                  No structured preview fields were extracted
                                  for this action.
                                </p>
                              ) : (
                                <div className="mt-3 space-y-3">
                                  {fields.map((field) => (
                                    <div key={`${item.id}:${field.label}`}>
                                      <p className="text-xs uppercase tracking-[0.16em] text-brand-subtle">
                                        {field.label}
                                      </p>
                                      <p className="mt-1 text-sm leading-6 text-foreground">
                                        {field.value}
                                      </p>
                                    </div>
                                  ))}
                                </div>
                              )}
                            </div>
                          </div>
                        </div>
                      </section>
                    )
                  })}
                </div>
              )}
            </section>

            <section className="space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="text-xl font-semibold text-foreground">
                  Recent decisions
                </h2>
                <Badge variant="neutral">
                  {recentItems.length} items
                </Badge>
              </div>

              {recentItems.length === 0 ? (
                <div className="rounded-[1.4rem] border border-dashed border-brand-line bg-brand-elevated p-6 text-sm text-brand-quiet">
                  No approvals have been decided yet.
                </div>
              ) : (
                <div className="space-y-3">
                  {recentItems.map((item) => (
                    <div
                      key={item.id}
                      className="rounded-[1.2rem] border border-brand-line bg-brand-elevated p-4"
                    >
                      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                        <div className="space-y-2">
                          <div className="flex flex-wrap items-center gap-2">
                            <Badge variant={getStatusTone(item.status)}>
                              {item.status}
                            </Badge>
                            {item.executionStatus && (
                              <Badge variant={getExecutionTone(item.executionStatus)}>
                                execution: {item.executionStatus}
                              </Badge>
                            )}
                            {item.toolkitSlug && (
                              <Badge variant="neutral">
                                {item.toolkitSlug}
                              </Badge>
                            )}
                          </div>
                          <p className="text-sm font-medium text-foreground">
                            {item.action ?? 'External action'}
                          </p>
                          <p className="text-sm text-brand-quiet">
                            {getPreviewSummary(item)}
                          </p>
                          {item.targetText && (
                            <p className="text-sm text-brand-subtle">
                              Target: {item.targetText}
                            </p>
                          )}
                          {typeof item.attemptCount === 'number' &&
                            item.attemptCount > 0 && (
                              <p className="text-sm text-brand-subtle">
                                Attempts: {item.attemptCount}
                              </p>
                            )}
                          {item.executionError && (
                            <p className="text-sm leading-6 text-brand-danger">
                              {item.executionError}
                            </p>
                          )}
                        </div>

                        <div className="text-sm text-brand-subtle">
                          {item.decidedAt
                            ? `Decided ${formatDate(item.decidedAt)}`
                            : `Created ${formatDate(item.createdAt)}`}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </section>
          </>
        )}
      </div>
    </div>
  )
}
