'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useEffect, useState, useTransition } from 'react'
import {
  ArrowRight,
  ExternalLink,
  Link2,
  RefreshCcw,
  Sparkles,
  Video,
} from 'lucide-react'
import {
  Alert,
  AlertDescription,
  Badge,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Input,
  Label,
  Skeleton,
} from '@kodi/ui'
import { useOrg } from '@/lib/org-context'
import { trpc } from '@/lib/trpc'

type MeetingListItem = Awaited<ReturnType<typeof trpc.meeting.list.query>>

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

function statusTone(status: string) {
  switch (status) {
    case 'listening':
      return 'border-emerald-500/30 bg-emerald-500/15 text-emerald-300'
    case 'admitted':
      return 'border-cyan-500/30 bg-cyan-500/15 text-cyan-200'
    case 'processing':
      return 'border-indigo-500/30 bg-indigo-500/15 text-indigo-200'
    case 'joining':
    case 'scheduled':
    case 'preparing':
      return 'border-amber-500/30 bg-amber-500/15 text-amber-200'
    case 'ended':
      return 'border-zinc-700 bg-zinc-800 text-zinc-300'
    case 'failed':
      return 'border-red-500/30 bg-red-500/15 text-red-200'
    default:
      return 'border-zinc-700 bg-zinc-800 text-zinc-300'
  }
}

function statusLabel(status: string) {
  switch (status) {
    case 'listening':
      return 'Live'
    case 'admitted':
      return 'Admitted'
    case 'processing':
      return 'Summarizing'
    case 'preparing':
      return 'Preparing'
    case 'joining':
      return 'Joining'
    case 'ended':
      return 'Ended'
    case 'failed':
      return 'Needs attention'
    default:
      return status
  }
}

function meetingSnapshot(meeting: MeetingListItem[number]) {
  if (meeting.liveSummary) return meeting.liveSummary

  switch (meeting.status) {
    case 'joining':
    case 'preparing':
      return 'Kodi is on the way into the call.'
    case 'admitted':
      return 'Kodi reached the meeting and is waiting for the call to begin.'
    case 'listening':
      return 'Transcript and live meeting context are flowing now.'
    case 'processing':
      return 'Meeting intelligence is turning the call into notes and actions.'
    case 'failed':
      return 'This meeting hit a provider issue and may need another attempt.'
    case 'ended':
      return 'This session has ended.'
    default:
      return 'Open the meeting to see transcript, summary, and state.'
  }
}

export default function MeetingsPage() {
  const router = useRouter()
  const { activeOrg } = useOrg()
  const [meetings, setMeetings] = useState<MeetingListItem>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [meetingUrl, setMeetingUrl] = useState('')
  const [title, setTitle] = useState('')
  const [isStarting, startStartTransition] = useTransition()
  const [isRefreshing, startRefreshTransition] = useTransition()

  useEffect(() => {
    if (!activeOrg) {
      setMeetings([])
      setLoading(false)
      return
    }

    const orgId = activeOrg.orgId
    let cancelled = false
    setLoading(true)
    setError(null)

    async function load() {
      try {
        const meetingItems = await trpc.meeting.list.query({ orgId, limit: 20 })
        if (cancelled) return
        setMeetings(meetingItems)
      } catch (err) {
        if (cancelled) return
        setError(
          err instanceof Error
            ? err.message
            : 'Failed to load meetings.'
        )
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    void load()
    return () => {
      cancelled = true
    }
  }, [activeOrg?.orgId])

  async function refresh() {
    if (!activeOrg) return

    startRefreshTransition(() => {
      void (async () => {
        try {
          const meetingItems = await trpc.meeting.list.query({
            orgId: activeOrg.orgId,
            limit: 20,
          })
          setMeetings(meetingItems)
          setError(null)
        } catch (err) {
          setError(
            err instanceof Error ? err.message : 'Failed to refresh meetings.'
          )
        }
      })()
    })
  }

  async function startMeeting() {
    if (!activeOrg) return

    startStartTransition(() => {
      void (async () => {
        try {
          const result = await trpc.meeting.joinByUrl.mutate({
            orgId: activeOrg.orgId,
            meetingUrl: meetingUrl.trim(),
            title: title.trim() || undefined,
          })

          setError(null)
          setMeetingUrl('')
          setTitle('')
          router.push(`/meetings/${result.meetingSessionId}`)
        } catch (err) {
          setError(
            err instanceof Error
              ? err.message
              : 'Failed to start the meeting bot.'
          )
        }
      })()
    })
  }

  if (!activeOrg) {
    return (
      <div className="flex min-h-full items-center justify-center p-6 text-sm text-zinc-500">
        Select a workspace to work with meetings.
      </div>
    )
  }

  return (
    <div className="min-h-full bg-[radial-gradient(circle_at_top_left,_rgba(84,103,255,0.08),_transparent_32%),radial-gradient(circle_at_bottom_right,_rgba(16,185,129,0.08),_transparent_30%),linear-gradient(180deg,_rgba(18,18,22,0.45),_rgba(8,8,12,0.98))]">
      <div className="mx-auto flex max-w-6xl flex-col gap-8 px-4 py-8">
        <section className="overflow-hidden rounded-[2rem] border border-zinc-800 bg-[linear-gradient(180deg,_rgba(17,18,22,0.96),_rgba(9,10,13,0.94))] shadow-2xl shadow-black/20">
          <div className="grid gap-8 px-6 py-6 lg:grid-cols-[1.05fr_0.95fr] lg:px-8 lg:py-8">
            <div className="space-y-5">
              <Badge className="w-fit border-zinc-700 bg-zinc-900 text-zinc-300">
                Meeting intelligence
              </Badge>
              <div className="space-y-3">
                <h1 className="max-w-xl text-4xl font-semibold tracking-tight text-white">
                  Bring Kodi into a live Google Meet in one step.
                </h1>
                <p className="max-w-2xl text-sm leading-7 text-zinc-400">
                  Start with a Meet link, then let Kodi join, listen, and turn
                  the conversation into a usable summary. The list below stays
                  focused on the sessions your team actually cares about.
                </p>
              </div>

              <div className="flex flex-wrap gap-3 text-sm text-zinc-400">
                <div className="rounded-full border border-zinc-800 bg-zinc-950/60 px-3 py-1.5">
                  Google Meet first
                </div>
                <div className="rounded-full border border-zinc-800 bg-zinc-950/60 px-3 py-1.5">
                  Transcript in app
                </div>
                <div className="rounded-full border border-zinc-800 bg-zinc-950/60 px-3 py-1.5">
                  Live summary in workspace
                </div>
              </div>
            </div>

            <div className="rounded-[1.75rem] border border-zinc-800 bg-zinc-950/70 p-5">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-xs uppercase tracking-[0.18em] text-zinc-500">
                    Start a session
                  </p>
                  <h2 className="mt-3 text-xl font-semibold text-white">
                    Paste a Meet link
                  </h2>
                  <p className="mt-2 text-sm leading-6 text-zinc-400">
                    Kodi will request to join the meeting right away. Admit the
                    bot in Meet, then watch transcript and summary fill in on
                    the meeting page.
                  </p>
                </div>

                <div className="hidden h-11 w-11 items-center justify-center rounded-[1.15rem] border border-zinc-800 bg-zinc-900 text-zinc-200 sm:flex">
                  <Video size={18} />
                </div>
              </div>

              <div className="mt-6 space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="meeting-url" className="text-zinc-300">
                    Google Meet URL
                  </Label>
                  <Input
                    id="meeting-url"
                    value={meetingUrl}
                    onChange={(event) => setMeetingUrl(event.target.value)}
                    placeholder="https://meet.google.com/abc-defg-hij"
                    className="h-11 border-zinc-800 bg-zinc-900 text-zinc-100 placeholder:text-zinc-500"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="meeting-title" className="text-zinc-300">
                    Title
                  </Label>
                  <Input
                    id="meeting-title"
                    value={title}
                    onChange={(event) => setTitle(event.target.value)}
                    placeholder="Weekly product sync"
                    className="h-11 border-zinc-800 bg-zinc-900 text-zinc-100 placeholder:text-zinc-500"
                  />
                </div>

                <div className="flex flex-col gap-3 pt-2 sm:flex-row sm:items-center">
                  <Button
                    onClick={() => void startMeeting()}
                    disabled={isStarting || meetingUrl.trim().length === 0}
                    className="gap-2 bg-emerald-500 text-zinc-950 hover:bg-emerald-400"
                  >
                    <Sparkles size={16} />
                    {isStarting ? 'Starting Kodi…' : 'Start meeting bot'}
                  </Button>
                  <Button
                    asChild
                    variant="ghost"
                    className="gap-2 border border-zinc-800 bg-zinc-900 text-zinc-300 hover:bg-zinc-800 hover:text-white"
                  >
                    <Link href="/settings/integrations">
                      <Link2 size={16} />
                      Integrations
                    </Link>
                  </Button>
                </div>

                <p className="text-xs leading-5 text-zinc-500">
                  Google Meet only for now. Invite-by-email and automatic join
                  rules come next.
                </p>
              </div>
            </div>
          </div>
        </section>

        {error && (
          <Alert className="border-red-500/30 bg-red-500/10 text-red-200">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        <section className="space-y-4">
          <div className="flex items-end justify-between gap-4">
            <div>
              <h2 className="text-2xl font-semibold tracking-tight text-white">
                Recent meetings
              </h2>
              <p className="mt-1 text-sm text-zinc-400">
                The sessions where transcript, summary, and follow-through are
                already taking shape.
              </p>
            </div>

            <Button
              onClick={() => void refresh()}
              variant="ghost"
              className="gap-2 border border-zinc-800 bg-zinc-900 text-zinc-300 hover:bg-zinc-800 hover:text-white"
              disabled={isRefreshing}
            >
              <RefreshCcw
                size={16}
                className={isRefreshing ? 'animate-spin' : ''}
              />
              Refresh
            </Button>
          </div>

          {loading ? (
            <div className="grid gap-4 lg:grid-cols-2">
              {Array.from({ length: 4 }).map((_, index) => (
                <Card key={index} className="border-zinc-800 bg-zinc-900/60">
                  <CardContent className="space-y-4 p-5">
                    <Skeleton className="h-4 w-32 bg-zinc-800" />
                    <Skeleton className="h-10 bg-zinc-800" />
                    <Skeleton className="h-4 w-48 bg-zinc-800" />
                  </CardContent>
                </Card>
              ))}
            </div>
          ) : meetings.length === 0 ? (
            <Card className="border-zinc-800 bg-zinc-900/60">
              <CardContent className="flex flex-col gap-4 p-8">
                <div className="flex h-12 w-12 items-center justify-center rounded-[1.15rem] border border-zinc-800 bg-zinc-950 text-zinc-300">
                  <Video size={18} />
                </div>
                <div>
                  <h3 className="text-lg font-medium text-white">
                    No meetings yet
                  </h3>
                  <p className="mt-2 max-w-xl text-sm leading-6 text-zinc-400">
                    Start with a Meet link above. Once Kodi joins, this list
                    will become your running record of live context, transcript,
                    and summaries.
                  </p>
                </div>
              </CardContent>
            </Card>
          ) : (
            <div className="grid gap-4 lg:grid-cols-2">
              {meetings.map((meeting) => (
                <Link
                  key={meeting.id}
                  href={`/meetings/${meeting.id}`}
                  className="group rounded-[1.75rem] border border-zinc-800 bg-[linear-gradient(180deg,_rgba(19,19,23,0.94),_rgba(10,10,14,0.9))] p-5 transition hover:border-zinc-700 hover:bg-zinc-900/90"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-lg font-medium text-white">
                        {meeting.title ?? 'Untitled meeting'}
                      </p>
                      <p className="mt-2 text-sm text-zinc-500">
                        Started {formatDate(meeting.actualStartAt ?? meeting.createdAt)}
                      </p>
                    </div>
                    <Badge className={statusTone(meeting.status)}>
                      {statusLabel(meeting.status)}
                    </Badge>
                  </div>

                  <p className="mt-5 line-clamp-3 text-sm leading-6 text-zinc-300">
                    {meetingSnapshot(meeting)}
                  </p>

                  <div className="mt-6 flex items-center justify-between gap-3 text-sm">
                    <span className="text-zinc-500">
                      Updated {formatDate(meeting.updatedAt)}
                    </span>
                    <span className="inline-flex items-center gap-2 text-zinc-200 transition group-hover:translate-x-0.5">
                      Open meeting
                      <ArrowRight size={15} />
                    </span>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </section>

        <section className="grid gap-4 lg:grid-cols-3">
          <Card className="border-zinc-800 bg-zinc-900/60">
            <CardHeader>
              <CardTitle className="text-lg text-white">What matters here</CardTitle>
              <CardDescription className="text-zinc-400">
                Meetings should help a team move from conversation to action.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3 text-sm leading-6 text-zinc-300">
              <p>Transcript gives the raw truth of what was said.</p>
              <p>Summary compresses the meeting into something reusable.</p>
              <p>Everything else should support those two outcomes.</p>
            </CardContent>
          </Card>

          <Card className="border-zinc-800 bg-zinc-900/60">
            <CardHeader>
              <CardTitle className="text-lg text-white">Current scope</CardTitle>
              <CardDescription className="text-zinc-400">
                The cleanest path we validated in dev.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3 text-sm leading-6 text-zinc-300">
              <p>Paste a Google Meet URL.</p>
              <p>Admit Kodi into the call.</p>
              <p>Read transcript and summary on the meeting page.</p>
            </CardContent>
          </Card>

          <Card className="border-zinc-800 bg-zinc-900/60">
            <CardHeader>
              <CardTitle className="text-lg text-white">What’s next</CardTitle>
              <CardDescription className="text-zinc-400">
                The roadmap now shifts from proof to product.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3 text-sm leading-6 text-zinc-300">
              <p>Invite-by-email setup.</p>
              <p>Automatic meeting discovery.</p>
              <p>Cleaner outputs review for decisions and tasks.</p>
              <Link
                href="/settings/integrations"
                className="inline-flex items-center gap-2 text-zinc-100 transition hover:text-white"
              >
                Review integrations
                <ExternalLink size={14} />
              </Link>
            </CardContent>
          </Card>
        </section>
      </div>
    </div>
  )
}
