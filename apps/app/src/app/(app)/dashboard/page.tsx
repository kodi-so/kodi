'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  ArrowRight,
  Clock3,
  MessageSquareText,
  Sparkles,
  Wand2,
} from 'lucide-react'
import { Button, Card, CardContent, Skeleton, Textarea } from '@kodi/ui'
import { trpc } from '@/lib/trpc'
import { useOrg } from '@/lib/org-context'
import { activityLabel, relativeTime } from '@/lib/activity-labels'

type ActivityItem = {
  id: string
  orgId: string
  userId: string | null
  action: string
  metadata?: unknown
  createdAt: Date | string
}

type ChatHistoryItem = {
  id: string
  role: 'user' | 'assistant'
  content: string
  createdAt: Date | string
}

type ThreadPreview = {
  id: string
  title: string
  preview: string
  createdAt: Date | string
}

const starterPrompts = [
  'Summarize what moved this week and what needs attention next.',
  'Turn our open decisions into owners, deadlines, and follow-up tasks.',
  'What blockers are showing up across meetings, chat, and tickets?',
]

function trimSentence(value: string, limit: number) {
  if (value.length <= limit) return value
  return `${value.slice(0, limit).trimEnd()}...`
}

function buildRecentThreads(history: ChatHistoryItem[]) {
  const threads: ThreadPreview[] = []

  for (let index = history.length - 1; index >= 0; index -= 1) {
    const item = history[index]
    if (!item || item.role !== 'user') continue

    const reply =
      history[index + 1]?.role === 'assistant' ? history[index + 1] : null

    threads.push({
      id: item.id,
      title: trimSentence(item.content, 72),
      preview: trimSentence(reply?.content ?? item.content, 110),
      createdAt: item.createdAt,
    })

    if (threads.length === 4) break
  }

  return threads
}

export default function DashboardPage() {
  const router = useRouter()
  const { activeOrg } = useOrg()
  const [activities, setActivities] = useState<ActivityItem[]>([])
  const [recentThreads, setRecentThreads] = useState<ThreadPreview[]>([])
  const [draft, setDraft] = useState('')
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!activeOrg) {
      setLoading(false)
      setActivities([])
      setRecentThreads([])
      return
    }

    let cancelled = false
    const activeOrgId = activeOrg.orgId
    setLoading(true)
    setError(null)

    async function load() {
      try {
        const [activityRows, historyRows] = await Promise.all([
          trpc.org.getActivity.query({ orgId: activeOrgId, limit: 6 }),
          trpc.chat.getHistory.query({ orgId: activeOrgId, limit: 24 }),
        ])

        if (cancelled) return

        setActivities(activityRows as ActivityItem[])
        setRecentThreads(buildRecentThreads(historyRows as ChatHistoryItem[]))
      } catch (loadError) {
        if (cancelled) return
        setError(
          loadError instanceof Error
            ? loadError.message
            : 'We could not load this workspace yet.'
        )
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    void load()

    return () => {
      cancelled = true
    }
  }, [activeOrg])

  function openChat(prompt: string) {
    const trimmed = prompt.trim()
    if (!trimmed) return

    setSubmitting(true)
    router.push(`/chat?prompt=${encodeURIComponent(trimmed)}`)
  }

  if (!activeOrg && !loading) {
    return (
      <div className="mx-auto flex min-h-screen w-full max-w-4xl items-center justify-center px-4 py-16 sm:px-6">
        <Card className="w-full max-w-2xl bg-card/80">
          <CardContent className="space-y-3 p-8">
            <p className="text-sm uppercase tracking-[0.18em] text-muted-foreground">
              Workspace
            </p>
            <h1 className="text-3xl tracking-[-0.04em]">
              Pick a workspace to start a conversation.
            </h1>
            <p className="max-w-xl text-base leading-7 text-muted-foreground">
              Once a workspace is active, Kodi can answer questions, capture
              follow-up, and keep the work moving from one place.
            </p>
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="mx-auto flex w-full max-w-7xl flex-col gap-10 px-4 py-8 sm:px-6 lg:px-8">
      <section className="grid gap-6 lg:grid-cols-[minmax(0,1.25fr)_320px]">
        <div className="rounded-[2rem] border border-border/80 bg-[linear-gradient(180deg,rgba(255,255,255,0.9),rgba(249,244,234,0.96))] p-6 shadow-soft sm:p-8">
          <div className="flex flex-wrap items-center gap-3">
            <div className="inline-flex items-center gap-2 rounded-full border border-border/80 bg-card/80 px-3 py-1 text-sm text-muted-foreground">
              <Sparkles size={14} className="text-primary" />
              Assistant desk
            </div>
            <div className="inline-flex items-center gap-2 rounded-full border border-border/80 bg-background/80 px-3 py-1 text-sm text-muted-foreground">
              <Clock3 size={14} />
              {activeOrg?.orgName ?? 'Workspace'}
            </div>
          </div>

          <div className="mt-6 max-w-3xl space-y-4">
            <h1 className="text-4xl tracking-[-0.06em] sm:text-5xl">
              What should Kodi move forward?
            </h1>
            <p className="text-lg leading-8 text-muted-foreground">
              Ask a question, hand over a task, or drop in a fuzzy problem. Kodi
              will open the thread and keep the follow-through moving in chat.
            </p>
          </div>

          <div className="mt-8 rounded-[1.6rem] border border-border/80 bg-card/82 p-4 sm:p-5">
            <Textarea
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              placeholder="Ask about blockers, decisions, follow-up, customer context, or what should happen next."
              rows={4}
              className="min-h-[144px] border-0 bg-transparent px-0 py-0 text-base leading-7 shadow-none focus-visible:ring-0 focus-visible:ring-offset-0"
            />

            <div className="mt-4 flex flex-col gap-3 border-t border-border/70 pt-4 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-sm text-muted-foreground">
                Clean brief in. Thread underway.
              </p>
              <Button
                onClick={() => openChat(draft)}
                size="lg"
                className="gap-2"
                disabled={!draft.trim() || submitting}
              >
                Start thread
                <ArrowRight size={16} />
              </Button>
            </div>
          </div>

          <div className="mt-5 flex flex-wrap gap-2">
            {starterPrompts.map((prompt) => (
              <button
                key={prompt}
                onClick={() => setDraft(prompt)}
                className="rounded-full border border-border/80 bg-card/76 px-3 py-2 text-left text-sm text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
              >
                {prompt}
              </button>
            ))}
          </div>
        </div>

        <div className="space-y-4">
          <Card className="bg-card/84">
            <CardContent className="space-y-4 p-6">
              <div className="flex items-center gap-2 text-sm uppercase tracking-[0.18em] text-muted-foreground">
                <Wand2 size={14} />
                Workspace
              </div>

              {loading ? (
                <div className="space-y-3">
                  <Skeleton className="h-7 w-36" />
                  <Skeleton className="h-4 w-28" />
                </div>
              ) : (
                <div className="space-y-4">
                  <div>
                    <p className="text-2xl tracking-[-0.04em]">
                      {activeOrg?.orgName ?? 'Workspace'}
                    </p>
                    <p className="mt-1 text-sm capitalize text-muted-foreground">
                      {activeOrg?.role ?? 'member'}
                    </p>
                  </div>
                  <div className="rounded-[1.2rem] border border-border/70 bg-secondary/55 px-4 py-3">
                    <p className="text-sm text-muted-foreground">
                      Latest movement
                    </p>
                    <p className="mt-1 text-base">
                      {activities[0]
                        ? relativeTime(new Date(activities[0].createdAt))
                        : 'No recent activity yet'}
                    </p>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          <Card className="bg-card/84">
            <CardContent className="p-6">
              <div className="flex items-center gap-2 text-sm uppercase tracking-[0.18em] text-muted-foreground">
                <MessageSquareText size={14} />
                Recent threads
              </div>

              {loading ? (
                <div className="mt-4 space-y-3">
                  {Array.from({ length: 3 }).map((_, index) => (
                    <Skeleton key={index} className="h-16 rounded-[1.2rem]" />
                  ))}
                </div>
              ) : recentThreads.length === 0 ? (
                <p className="mt-4 text-sm leading-7 text-muted-foreground">
                  Your first conversation will show up here once you start
                  asking Kodi to move something forward.
                </p>
              ) : (
                <div className="mt-4 space-y-3">
                  {recentThreads.map((thread) => (
                    <button
                      key={thread.id}
                      onClick={() => router.push(`/chat?focus=${thread.id}`)}
                      className="w-full rounded-[1.2rem] border border-border/75 bg-secondary/50 px-4 py-3 text-left transition-colors hover:bg-secondary"
                    >
                      <p className="text-sm text-foreground">{thread.title}</p>
                      <p className="mt-1 text-sm leading-6 text-muted-foreground">
                        {thread.preview}
                      </p>
                    </button>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </section>

      <section className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <Card className="bg-card/82">
          <CardContent className="p-6">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-sm uppercase tracking-[0.18em] text-muted-foreground">
                  Prompt ideas
                </p>
                <h2 className="mt-2 text-2xl tracking-[-0.04em]">
                  Keep it short. Kodi can do the unpacking.
                </h2>
              </div>
            </div>

            <div className="mt-5 grid gap-3">
              {starterPrompts.map((prompt) => (
                <button
                  key={prompt}
                  onClick={() => openChat(prompt)}
                  className="flex items-center justify-between gap-3 rounded-[1.3rem] border border-border/75 bg-secondary/45 px-4 py-4 text-left transition-colors hover:bg-secondary"
                >
                  <span className="text-base leading-7 text-foreground">
                    {prompt}
                  </span>
                  <ArrowRight
                    size={16}
                    className="shrink-0 text-muted-foreground"
                  />
                </button>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card className="bg-card/82">
          <CardContent className="p-6">
            <p className="text-sm uppercase tracking-[0.18em] text-muted-foreground">
              Recent activity
            </p>
            <h2 className="mt-2 text-2xl tracking-[-0.04em]">
              Helpful context, not the whole page.
            </h2>

            {loading ? (
              <div className="mt-5 space-y-3">
                {Array.from({ length: 4 }).map((_, index) => (
                  <Skeleton key={index} className="h-16 rounded-[1.2rem]" />
                ))}
              </div>
            ) : error ? (
              <p className="mt-5 text-sm leading-7 text-muted-foreground">
                {error}
              </p>
            ) : activities.length === 0 ? (
              <p className="mt-5 text-sm leading-7 text-muted-foreground">
                Activity will appear here once your workspace starts moving.
              </p>
            ) : (
              <div className="mt-5 space-y-3">
                {activities.map((item) => (
                  <div
                    key={item.id}
                    className="rounded-[1.2rem] border border-border/75 bg-secondary/45 px-4 py-4"
                  >
                    <p className="text-sm leading-6 text-foreground">
                      {activityLabel(item)}
                    </p>
                    <p className="mt-1 text-sm text-muted-foreground">
                      {relativeTime(new Date(item.createdAt))}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </section>
    </div>
  )
}
