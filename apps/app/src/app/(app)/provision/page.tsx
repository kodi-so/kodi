'use client'

import { useEffect, useState } from 'react'
import { useOrg } from '@/lib/org-context'
import { trpc } from '@/lib/trpc'
import { ProvisionStatus } from './_components/provision-status'

type StatusData = {
  id: string
  status: 'pending' | 'installing' | 'running' | 'error' | 'suspended' | 'deleting' | 'deleted'
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
      <div className="flex items-center justify-center min-h-full p-6 text-zinc-500 text-sm">
        Select a team to manage your agent.
      </div>
    )
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-full p-6">
        <div className="w-6 h-6 rounded-full border-2 border-indigo-400 border-t-transparent animate-spin" />
      </div>
    )
  }

  return (
    <div className="flex items-center justify-center min-h-full p-6">
      <ProvisionStatus orgId={activeOrg.orgId} initialData={initialData} />
    </div>
  )
}
