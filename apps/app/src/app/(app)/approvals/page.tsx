'use client'

import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { Alert, AlertDescription } from '@kodi/ui/components/alert'
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@kodi/ui/components/tabs'
import { pageShellClass } from '@/lib/brand-styles'
import { useOrg } from '@/lib/org-context'
import { trpc } from '@/lib/trpc'
import { useAsyncResource } from '@/lib/use-async-resource'
import { PageLoader, RefreshingIndicator } from '@/components/loading'
import type { ApprovalItem } from './_components/utils'
import { ApprovalsHeader } from './_components/approvals-header'
import { ApprovalsLoading } from './_components/approvals-loading'
import { PendingApprovalsSection } from './_components/pending-approvals-section'
import { RecentDecisionsSection } from './_components/recent-decisions-section'

export default function ApprovalsPage() {
  const { activeOrg } = useOrg()
  const searchParams = useSearchParams()
  const highlightedApprovalId = searchParams.get('approvalRequestId')
  const [actionKey, setActionKey] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [successMessage, setSuccessMessage] = useState<string | null>(null)
  const [tab, setTab] = useState<'pending' | 'history'>('pending')

  const orgId = activeOrg?.orgId ?? null

  const {
    data,
    error: fetchError,
    isInitialLoading,
    isRefreshing,
    refresh: reloadApprovals,
  } = useAsyncResource<{ items: ApprovalItem[] }>(
    () => trpc.approval.list.query({ orgId: orgId!, limit: 100 }),
    [orgId],
    { enabled: orgId !== null }
  )

  const items = data?.items ?? []
  const displayError = error ?? fetchError

  const pendingItems = useMemo(
    () => items.filter((item) => item.status === 'pending'),
    [items]
  )
  const recentItems = useMemo(
    () => items.filter((item) => item.status !== 'pending'),
    [items]
  )

  useEffect(() => {
    if (!highlightedApprovalId) return
    const target = items.find((item) => item.id === highlightedApprovalId)
    if (target && target.status !== 'pending') setTab('history')
  }, [highlightedApprovalId, items])

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
      await reloadApprovals()
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
    return <PageLoader />
  }

  return (
    <div className={pageShellClass}>
      <div className="mx-auto flex max-w-4xl flex-col gap-6 px-4 pb-8">
        <ApprovalsHeader />

        {displayError && (
          <Alert variant="destructive">
            <AlertDescription>{displayError}</AlertDescription>
          </Alert>
        )}

        {successMessage && (
          <Alert variant="success">
            <AlertDescription>{successMessage}</AlertDescription>
          </Alert>
        )}

        <RefreshingIndicator active={isRefreshing} className="-mt-2" />

        {isInitialLoading ? (
          <ApprovalsLoading />
        ) : (
          <Tabs
            value={tab}
            onValueChange={(value) => setTab(value as 'pending' | 'history')}
            className="flex flex-col gap-4"
          >
            <TabsList className="self-start">
              <TabsTrigger value="pending" className="gap-2">
                Pending
                {pendingItems.length > 0 && (
                  <span className="inline-flex h-5 min-w-[1.25rem] items-center justify-center rounded-full bg-primary/10 px-1.5 text-xs font-medium text-primary">
                    {pendingItems.length}
                  </span>
                )}
              </TabsTrigger>
              <TabsTrigger value="history">History</TabsTrigger>
            </TabsList>

            <TabsContent value="pending" className="mt-0">
              <PendingApprovalsSection
                items={pendingItems}
                highlightedApprovalId={highlightedApprovalId}
                actionKey={actionKey}
                onDecide={decideApproval}
              />
            </TabsContent>
            <TabsContent value="history" className="mt-0">
              <RecentDecisionsSection items={recentItems} />
            </TabsContent>
          </Tabs>
        )}
      </div>
    </div>
  )
}
