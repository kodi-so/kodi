'use client'

import { useEffect, useState } from 'react'
import { useOrg } from '@/lib/org-context'
import { pageShellClass } from '@/lib/brand-styles'
import { trpc } from '@/lib/trpc'
import { ProvisionStatus } from './_components/provision-status'
import { Skeleton } from '@kodi/ui'

type StatusData = {
  id: string
  status:
    | 'pending'
    | 'installing'
    | 'running'
    | 'error'
    | 'suspended'
    | 'deleting'
    | 'deleted'
  hostname: string | null
  ipAddress: string | null
  errorMessage: string | null
  lastHealthCheck: Date | null
}

export default function ProvisionPage() {
  const { activeOrg } = useOrg()
  const [initialData, setInitialData] = useState<StatusData | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!activeOrg) return
    setLoading(true)
    setInitialData(null)

    trpc.instance.getStatus
      .query({ orgId: activeOrg.orgId })
      .then((data) => {
        setInitialData(data as StatusData | null)
      })
      .catch(() => {
        setInitialData(null)
      })
      .finally(() => setLoading(false))
  }, [activeOrg?.orgId])

  if (!activeOrg) {
    return (
      <div className="flex min-h-full items-center justify-center p-6 text-sm text-brand-quiet">
        Select a team to manage your agent.
      </div>
    )
  }

  if (loading) {
    return (
      <div className="flex min-h-full items-center justify-center p-6">
        <Skeleton className="h-6 w-6 rounded-full bg-brand-muted" />
      </div>
    )
  }

  return (
    <div className={`${pageShellClass} flex min-h-full items-center justify-center p-6`}>
      <ProvisionStatus orgId={activeOrg.orgId} initialData={initialData} />
    </div>
  )
}
