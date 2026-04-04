'use client'

import { Suspense, useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import {
  Alert,
  AlertDescription,
  Badge,
  Card,
  CardContent,
  Skeleton,
} from '@kodi/ui'
import { trpc } from '@/lib/trpc'
import {
  activityIcon,
  activityLabel,
  relativeTime,
} from '@/lib/activity-labels'

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
          setOrgInfo(null)
          setActivities([])
          setLoading(false)
          return
        }

        setOrgInfo(org)
        const items = await trpc.org.getActivity.query({ orgId: org.orgId })
        setActivities(items)
      } catch (loadError) {
        setError(
          loadError instanceof Error
            ? loadError.message
            : 'We could not load the dashboard.'
        )
      } finally {
        setLoading(false)
      }
    }

    void load()
  }, [orgIdParam])

  const newestActivity = useMemo(() => activities[0] ?? null, [activities])

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-4 py-8 sm:px-6">
      <header className="space-y-3">
        <Badge variant="outline" className="w-fit">
          Dashboard
        </Badge>
        <div className="space-y-2">
          <h1 className="text-3xl tracking-tight text-foreground">
            {orgInfo ? orgInfo.orgName : 'Your workspace'}
          </h1>
          <p className="max-w-2xl text-base text-muted-foreground">
            See the latest activity and keep track of what changed.
          </p>
        </div>
      </header>

      {loading ? (
        <>
          <div className="grid gap-4 md:grid-cols-3">
            {Array.from({ length: 3 }).map((_, index) => (
              <Card key={index}>
                <CardContent className="space-y-3 p-5">
                  <Skeleton className="h-4 w-20" />
                  <Skeleton className="h-8 w-28" />
                </CardContent>
              </Card>
            ))}
          </div>

          <Card>
            <CardContent className="space-y-4 p-5">
              {Array.from({ length: 4 }).map((_, index) => (
                <div key={index} className="space-y-2">
                  <Skeleton className="h-4 w-3/4" />
                  <Skeleton className="h-3 w-24" />
                </div>
              ))}
            </CardContent>
          </Card>
        </>
      ) : null}

      {error ? (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}

      {!loading && !error ? (
        <>
          <section className="grid gap-4 md:grid-cols-3">
            <Card>
              <CardContent className="space-y-2 p-5">
                <p className="text-sm text-muted-foreground">Workspace</p>
                <p className="text-xl text-foreground">
                  {orgInfo?.orgName ?? 'Not available'}
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="space-y-2 p-5">
                <p className="text-sm text-muted-foreground">Role</p>
                <p className="text-xl capitalize text-foreground">
                  {orgInfo?.role ?? 'Not available'}
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="space-y-2 p-5">
                <p className="text-sm text-muted-foreground">Latest activity</p>
                <p className="text-xl text-foreground">
                  {newestActivity
                    ? relativeTime(new Date(newestActivity.createdAt))
                    : 'No activity yet'}
                </p>
              </CardContent>
            </Card>
          </section>

          <section className="space-y-4">
            <div className="space-y-1">
              <h2 className="text-xl text-foreground">Recent activity</h2>
              <p className="text-sm text-muted-foreground">
                New invites, membership changes, and workspace events appear
                here.
              </p>
            </div>

            {activities.length === 0 ? (
              <Card>
                <CardContent className="space-y-2 p-6">
                  <p className="text-base text-foreground">No activity yet</p>
                  <p className="text-sm text-muted-foreground">
                    Activity will show up here once your workspace starts
                    moving.
                  </p>
                </CardContent>
              </Card>
            ) : (
              <div className="space-y-3">
                {activities.map((item) => (
                  <Card key={item.id}>
                    <CardContent className="flex items-start gap-4 p-5">
                      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-secondary text-base text-foreground">
                        {activityIcon(item.action)}
                      </div>
                      <div className="min-w-0 flex-1 space-y-1">
                        <p className="text-sm leading-6 text-foreground">
                          {activityLabel(item)}
                        </p>
                        <p className="text-sm text-muted-foreground">
                          {relativeTime(new Date(item.createdAt))}
                        </p>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </section>
        </>
      ) : null}
    </div>
  )
}

export default function DashboardPage() {
  return (
    <Suspense
      fallback={
        <div className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-4 py-8 sm:px-6">
          <Skeleton className="h-8 w-40" />
          <div className="grid gap-4 md:grid-cols-3">
            {Array.from({ length: 3 }).map((_, index) => (
              <Skeleton key={index} className="h-28 rounded-2xl" />
            ))}
          </div>
        </div>
      }
    >
      <DashboardContent />
    </Suspense>
  )
}
