'use client'

import { Suspense, useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { trpc } from '@/lib/trpc'
import {
  activityIcon,
  activityLabel,
  relativeTime,
} from '@/lib/activity-labels'
import {
  Alert,
  AlertDescription,
  Badge,
  Card,
  CardContent,
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

const delegationModes = ['Observe', 'Prepare', 'Approve', 'Execute']

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

  const latestActivity = useMemo(() => activities[0] ?? null, [activities])

  return (
    <div className="kodi-shell-bg min-h-full">
      <div className="mx-auto flex max-w-6xl flex-col gap-6 px-4 py-8">
        <section className="grid gap-6 lg:grid-cols-[minmax(0,1.08fr)_minmax(320px,0.92fr)]">
          <div className="kodi-panel overflow-hidden rounded-[2rem] p-6 lg:p-8">
            <Badge className="border-white/10 bg-white/8 text-[#f4f1e8]">
              Dashboard
            </Badge>

            <div className="mt-5 max-w-3xl space-y-4">
              <p className="kodi-kicker">Kodi control room</p>
              <h1 className="font-brand text-[clamp(2.5rem,5vw,4rem)] leading-[0.96] tracking-[-0.06em] text-white">
                Keep the room sharp, then keep the work moving.
              </h1>
              <p className="max-w-2xl text-base leading-8 text-[#c7d3d6]">
                {orgInfo
                  ? `${orgInfo.orgName} now has one place to review decisions, activity, and follow-through as Kodi takes on more of the operational load.`
                  : 'Kodi turns meetings and decisions into an operating picture the team can trust.'}
              </p>
            </div>

            <div className="mt-8 grid gap-3 sm:grid-cols-3">
              <div className="rounded-[1.4rem] border border-white/10 bg-black/12 p-4">
                <p className="kodi-kicker">Workspace</p>
                <p className="mt-3 text-xl text-white">
                  {orgInfo?.orgName ?? 'Loading workspace'}
                </p>
                <p className="mt-2 text-sm leading-6 text-[#9bb0b5]">
                  Shared AI teammate for meetings, approvals, and execution.
                </p>
              </div>
              <div className="rounded-[1.4rem] border border-white/10 bg-black/12 p-4">
                <p className="kodi-kicker">Activity</p>
                <p className="mt-3 text-3xl text-white">{activities.length}</p>
                <p className="mt-2 text-sm leading-6 text-[#9bb0b5]">
                  Recent workspace events visible in one operating stream.
                </p>
              </div>
              <div className="rounded-[1.4rem] border border-[#DFAE56]/18 bg-[linear-gradient(180deg,rgba(223,174,86,0.18),rgba(223,174,86,0.08))] p-4 text-[#223239]">
                <p className="text-[11px] uppercase tracking-[0.18em] text-[#7a6030]">
                  Latest signal
                </p>
                <p className="mt-3 text-sm leading-7">
                  {latestActivity
                    ? activityLabel(latestActivity)
                    : 'The workspace is ready for its first live decision, recap, or approval.'}
                </p>
              </div>
            </div>
          </div>

          <Card className="rounded-[2rem] border-white/10 bg-[linear-gradient(180deg,rgba(49,66,71,0.96),rgba(31,44,49,0.98))] shadow-[0_28px_70px_rgba(8,13,16,0.24)]">
            <CardContent className="p-6">
              <p className="kodi-kicker">Delegation ladder</p>
              <h2 className="mt-3 font-brand text-[2rem] tracking-[-0.05em] text-white">
                Give Kodi more work when the team is ready.
              </h2>
              <p className="mt-3 text-sm leading-7 text-[#c7d3d6]">
                The product should always make it obvious what Kodi is
                observing, what it is preparing, and what it can execute.
              </p>

              <div className="mt-6 grid gap-3">
                {delegationModes.map((mode, index) => (
                  <div
                    key={mode}
                    className={`rounded-[1.2rem] border px-4 py-4 ${
                      index === delegationModes.length - 1
                        ? 'border-[#DFAE56]/24 bg-[#DFAE56]/14 text-[#F5D18A]'
                        : 'border-white/10 bg-white/6 text-[#dce5e7]'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-3">
                      <p className="text-base">{mode}</p>
                      <span className="text-[11px] uppercase tracking-[0.18em]">
                        Level {index + 1}
                      </span>
                    </div>
                  </div>
                ))}
              </div>

              <div className="mt-6 rounded-[1.3rem] border border-white/10 bg-black/12 p-4">
                <p className="text-sm text-white">Brand behavior in product</p>
                <p className="mt-2 text-sm leading-7 text-[#9bb0b5]">
                  Calm surfaces, explicit status, and clear execution boundaries
                  matter as much as the agent intelligence itself.
                </p>
              </div>
            </CardContent>
          </Card>
        </section>

        {error && (
          <Alert className="border-[#D97A63]/30 bg-[#D97A63]/12 text-[#ffd8ce]">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        <section className="space-y-4">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="kodi-kicker">Workspace feed</p>
              <h2 className="font-brand text-[2rem] tracking-[-0.05em] text-[#223239]">
                Recent activity
              </h2>
              <p className="mt-1 text-sm leading-7 text-[#5d7379]">
                Events like invites, membership changes, approvals, and future
                execution traces should stay visible here.
              </p>
            </div>
            {orgInfo && (
              <Badge className="w-fit border-[#c9d2d4] bg-white/82 text-[#223239]">
                {orgInfo.role}
              </Badge>
            )}
          </div>

          {loading ? (
            <div className="space-y-3">
              {Array.from({ length: 4 }).map((_, index) => (
                <Card
                  key={index}
                  className="rounded-[1.6rem] border-white/10 bg-[rgba(40,55,60,0.78)]"
                >
                  <CardContent className="flex items-start gap-4 p-5">
                    <Skeleton className="h-10 w-10 rounded-[1rem] bg-white/10" />
                    <div className="flex-1 space-y-2">
                      <Skeleton className="h-4 w-48 bg-white/10" />
                      <Skeleton className="h-3 w-24 bg-white/10" />
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          ) : activities.length === 0 ? (
            <Card className="rounded-[1.8rem] border-dashed border-white/12 bg-[rgba(40,55,60,0.66)]">
              <CardContent className="flex flex-col items-center justify-center px-6 py-16 text-center">
                <div className="flex h-14 w-14 items-center justify-center rounded-full border border-[#DFAE56]/24 bg-[#DFAE56]/10 text-[#F0C570]">
                  <span className="text-xl">•</span>
                </div>
                <h3 className="mt-5 font-brand text-[1.8rem] tracking-[-0.05em] text-white">
                  No activity yet
                </h3>
                <p className="mt-3 max-w-xl text-sm leading-7 text-[#9bb0b5]">
                  Once the workspace starts inviting teammates, reviewing
                  approvals, or moving work through Kodi, that trace will show
                  up here.
                </p>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-3">
              {activities.map((item) => (
                <Card
                  key={item.id}
                  className="rounded-[1.6rem] border-white/10 bg-[linear-gradient(180deg,rgba(46,63,69,0.94),rgba(31,44,49,0.98))] transition hover:border-white/16"
                >
                  <CardContent className="flex items-start gap-4 p-5">
                    <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-[1rem] border border-white/10 bg-black/12 text-sm text-white">
                      {activityIcon(item.action)}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm leading-7 text-[#f2efe6]">
                        {activityLabel(item)}
                      </p>
                      <p className="mt-1 text-xs uppercase tracking-[0.16em] text-[#8ea3a8]">
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
    </div>
  )
}

export default function DashboardPage() {
  return (
    <Suspense
      fallback={
        <div className="kodi-shell-bg min-h-full px-4 py-8">
          <div className="mx-auto max-w-6xl space-y-3">
            <Skeleton className="h-10 w-64 bg-white/10" />
            <Skeleton className="h-40 rounded-[1.6rem] bg-white/10" />
            <Skeleton className="h-40 rounded-[1.6rem] bg-white/10" />
          </div>
        </div>
      }
    >
      <DashboardContent />
    </Suspense>
  )
}
