'use client'

import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { Alert, AlertDescription } from '@kodi/ui/components/alert'
import { Skeleton } from '@kodi/ui/components/skeleton'
import { pageShellClass } from '@/lib/brand-styles'
import { useOrg } from '@/lib/org-context'
import { trpc } from '@/lib/trpc'
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
        <ApprovalsHeader />

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
          <ApprovalsLoading />
        ) : (
          <>
            <PendingApprovalsSection
              items={pendingItems}
              highlightedApprovalId={highlightedApprovalId}
              actionKey={actionKey}
              onDecide={decideApproval}
            />
            <RecentDecisionsSection items={recentItems} />
          </>
        )}
      </div>
    </div>
  )
}
