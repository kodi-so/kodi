'use client'

import { useEffect, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { trpc } from '@/lib/trpc'
import {
  activityLabel,
  activityIcon,
  relativeTime,
} from '@/lib/activity-labels'
import { Suspense } from 'react'
import {
  Alert,
  AlertDescription,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Skeleton,
} from '@kodi/ui'

type OrgInfo = {
  orgId: string
  orgName: string
  orgSlug: string
  role: 'owner' | 'member'
}

type ActivityItem = {
  id: string
  orgId: string
  userId: string | null
  action: string
  metadata?: unknown
  createdAt: Date | string
}

function DashboardContent() {
  const searchParams = useSearchParams()
  const orgIdParam = searchParams.get('org') ?? undefined

  const [orgInfo, setOrgInfo] = useState<OrgInfo | null>(null)
  const [activities, setActivities] = useState<ActivityItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    setLoading(true)
    setError(null)
    async function load() {
      try {
        const org = await trpc.org.getMyCurrent.query(
          orgIdParam ? { orgId: orgIdParam } : undefined
        )
        if (!org) {
          setLoading(false)
          return
        }
        setOrgInfo(org)
        const items = await trpc.org.getActivity.query({ orgId: org.orgId })
        setActivities(items)
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load activity')
      } finally {
        setLoading(false)
      }
    }
    void load()
  }, [orgIdParam])

  return (
    <div className="max-w-2xl mx-auto py-8 px-4">
      {/* Page header */}
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-white">Dashboard</h1>
        {orgInfo && (
          <p className="text-zinc-500 mt-1 text-sm">{orgInfo.orgName}</p>
        )}
      </div>

      {/* Activity feed */}
      <section>
        <h2 className="text-sm font-semibold text-zinc-400 uppercase tracking-wider mb-4">
          Activity
        </h2>

        {loading && (
          <div className="space-y-3">
            {[...Array(3)].map((_, i) => (
              <Card key={i} className="border-zinc-800 bg-zinc-900/50">
                <CardContent className="flex items-start gap-3 p-4">
                  <Skeleton className="h-8 w-8 rounded-lg bg-zinc-800 shrink-0" />
                  <div className="flex-1 space-y-2">
                    <Skeleton className="h-3 w-2/3 bg-zinc-800" />
                    <Skeleton className="h-2 w-1/4 bg-zinc-800" />
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        {error && (
          <Alert
            variant="destructive"
            className="border-red-500/20 bg-red-500/10 text-red-400"
          >
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {!loading && !error && activities.length === 0 && (
          <Card className="border-zinc-800 bg-zinc-900/50">
            <CardContent className="flex flex-col items-center justify-center py-16 text-center">
              <div className="w-12 h-12 rounded-2xl bg-zinc-800 border border-zinc-700 flex items-center justify-center text-xl mb-4">
                📋
              </div>
              <p className="text-zinc-400 font-medium">No activity yet</p>
              <p className="text-zinc-600 text-sm mt-1">
                Events like invites and member changes will appear here.
              </p>
            </CardContent>
          </Card>
        )}

        {!loading && !error && activities.length > 0 && (
          <div className="space-y-2 max-h-[480px] overflow-y-auto pr-1">
            {activities.map((item) => (
              <Card
                key={item.id}
                className="border-zinc-800 bg-zinc-900/50 transition-colors hover:border-zinc-700"
              >
                <CardContent className="flex items-start gap-3 p-4">
                  <div className="w-8 h-8 rounded-lg bg-zinc-800 border border-zinc-700 flex items-center justify-center text-sm shrink-0">
                    {activityIcon(item.action)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-zinc-200">
                      {activityLabel(item)}
                    </p>
                    <p className="text-xs text-zinc-500 mt-0.5">
                      {relativeTime(new Date(item.createdAt))}
                    </p>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </section>
    </div>
  )
}

export default function DashboardPage() {
  return (
    <Suspense
      fallback={
        <div className="max-w-2xl mx-auto py-8 px-4">
          <Skeleton className="mb-8 h-8 w-48 bg-zinc-800" />
          <div className="space-y-3">
            {[...Array(3)].map((_, i) => (
              <Card key={i} className="border-zinc-800 bg-zinc-900/50">
                <CardContent className="p-4">
                  <Skeleton className="h-8 bg-zinc-800" />
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      }
    >
      <DashboardContent />
    </Suspense>
  )
}
