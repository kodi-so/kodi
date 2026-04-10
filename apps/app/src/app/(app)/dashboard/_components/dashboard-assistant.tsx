'use client'

import { useEffect, useRef, useState } from 'react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { ArrowUp, MessageSquarePlus, Plus } from 'lucide-react'
import { Button, Textarea, cn } from '@kodi/ui'
import { useSession } from '@/lib/auth-client'
import { trpc } from '@/lib/trpc'

type DashboardThread = {
  id: string
  orgId: string
  createdBy: string
  title: string
  createdAt: string | Date
  updatedAt: string | Date
}

type DashboardMessage = {
  id: string
  orgId: string
  threadId: string
  userId: string | null
  role: 'user' | 'assistant'
  content: string
  status: string | null
  createdAt: string | Date
  userName?: string | null
  userImage?: string | null
}

function makeTempId(prefix: string) {
  return `temp-${prefix}-${crypto.randomUUID()}`
}

function buildThreadTitle(message: string) {
  return message.trim().replace(/\s+/g, ' ').slice(0, 80) || 'New thread'
}

function formatRelativeDate(value: string | Date) {
  return new Date(value).toLocaleDateString([], {
    month: 'short',
    day: 'numeric',
  })
}

function formatTime(value: string | Date) {
  return new Date(value).toLocaleTimeString([], {
    hour: 'numeric',
    minute: '2-digit',
  })
}

function initials(name?: string | null) {
  if (!name) return 'Y'

  return name
    .split(' ')
    .map((part) => part[0])
    .join('')
    .slice(0, 2)
    .toUpperCase()
}

function MessageBody({ content }: { content: string }) {
  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      components={{
        p: ({ children }) => <p className="mb-2 last:mb-0">{children}</p>,
        ul: ({ children }) => (
          <ul className="mb-2 list-disc pl-5 last:mb-0">{children}</ul>
        ),
        ol: ({ children }) => (
          <ol className="mb-2 list-decimal pl-5 last:mb-0">{children}</ol>
        ),
        a: ({ href, children }) => (
          <a
            href={href}
            target="_blank"
            rel="noreferrer"
            className="text-brand-info underline underline-offset-2"
          >
            {children}
          </a>
        ),
        code: ({ children }) => (
          <code className="rounded bg-brand-muted px-1.5 py-0.5 text-xs">
            {children}
          </code>
        ),
        pre: ({ children }) => (
          <pre className="overflow-x-auto rounded-xl bg-brand-muted p-3 text-xs">
            {children}
          </pre>
        ),
      }}
    >
      {content}
    </ReactMarkdown>
  )
}

function AssistantAvatar() {
  return (
    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brand-accent-soft text-xs font-semibold text-brand-accent-foreground">
      K
    </div>
  )
}

function UserAvatar({ name }: { name?: string | null }) {
  return (
    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brand-info-soft text-xs font-semibold text-brand-info">
      {initials(name ?? 'You')}
    </div>
  )
}

export function DashboardAssistant({
  orgId,
  orgName,
  embedded = false,
  initialThreadId: initialThreadIdProp,
  buildThreadUrl,
}: {
  orgId: string
  orgName: string
  embedded?: boolean
  initialThreadId?: string | null
  buildThreadUrl?: (threadId: string | null) => string
}) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const { data: session } = useSession()
  const initialThreadId = initialThreadIdProp ?? searchParams.get('thread')
  const [threads, setThreads] = useState<DashboardThread[]>([])
  const [selectedThreadId, setSelectedThreadId] = useState<string | null>(
    initialThreadId
  )
  const [messages, setMessages] = useState<DashboardMessage[]>([])
  const [draft, setDraft] = useState('')
  const [loadingThreads, setLoadingThreads] = useState(true)
  const [loadingMessages, setLoadingMessages] = useState(false)
  const [sending, setSending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const scrollRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (initialThreadId) {
      setSelectedThreadId(initialThreadId)
      return
    }

    setSelectedThreadId((current) =>
      current?.startsWith('temp-thread-') ? current : null
    )
  }, [initialThreadId])

  useEffect(() => {
    let cancelled = false
    setLoadingThreads(true)

    async function loadThreads() {
      try {
        const rows = await trpc.dashboardAssistant.listThreads.query({ orgId })
        if (!cancelled) {
          setThreads(rows as DashboardThread[])
        }
      } catch (loadError) {
        if (!cancelled) {
          setError(
            loadError instanceof Error
              ? loadError.message
              : 'Failed to load private conversations.'
          )
        }
      } finally {
        if (!cancelled) {
          setLoadingThreads(false)
        }
      }
    }

    void loadThreads()

    return () => {
      cancelled = true
    }
  }, [orgId])

  useEffect(() => {
    if (!selectedThreadId || selectedThreadId.startsWith('temp-thread-')) {
      if (!selectedThreadId) {
        setMessages([])
      }
      return
    }

    let cancelled = false
    const threadId = selectedThreadId
    setLoadingMessages(true)
    setError(null)

    async function loadMessages() {
      try {
        const rows = await trpc.dashboardAssistant.getThreadMessages.query({
          orgId,
          threadId,
        })

        if (!cancelled) {
          setMessages(rows as DashboardMessage[])
        }
      } catch (loadError) {
        if (!cancelled) {
          setError(
            loadError instanceof Error
              ? loadError.message
              : 'Failed to load conversation.'
          )
        }
      } finally {
        if (!cancelled) {
          setLoadingMessages(false)
        }
      }
    }

    void loadMessages()

    return () => {
      cancelled = true
    }
  }, [orgId, selectedThreadId])

  useEffect(() => {
    if (!scrollRef.current) return

    scrollRef.current.scrollTo({
      top: scrollRef.current.scrollHeight,
      behavior: 'smooth',
    })
  }, [messages, sending])

  const selectedThread =
    threads.find((thread) => thread.id === selectedThreadId) ?? null

  function threadHref(threadId: string | null) {
    if (buildThreadUrl) {
      return buildThreadUrl(threadId)
    }

    if (!threadId) {
      return pathname
    }

    return `${pathname}?thread=${threadId}`
  }

  function openThread(threadId: string) {
    setSelectedThreadId(threadId)
    router.replace(threadHref(threadId))
  }

  function resetThreadSelection() {
    setSelectedThreadId(null)
    setMessages([])
    setError(null)
    router.replace(threadHref(null))
  }

  async function sendMessage() {
    const content = draft.trim()
    if (!content || sending) return

    const previousSelectedThreadId = selectedThreadId
    const isNewThread =
      !selectedThreadId || selectedThreadId.startsWith('temp-thread-')
    const workingThreadId = isNewThread
      ? makeTempId('thread')
      : (selectedThreadId ?? makeTempId('thread'))
    const optimisticUserId = makeTempId('message')
    const optimisticUserMessage: DashboardMessage = {
      id: optimisticUserId,
      orgId,
      threadId: workingThreadId,
      userId: session?.user?.id ?? null,
      role: 'user',
      content,
      status: 'sending',
      createdAt: new Date(),
      userName: session?.user?.name ?? 'You',
      userImage: session?.user?.image ?? null,
    }

    setDraft('')
    setSending(true)
    setError(null)

    if (isNewThread) {
      const optimisticThread: DashboardThread = {
        id: workingThreadId,
        orgId,
        createdBy: session?.user?.id ?? 'me',
        title: buildThreadTitle(content),
        createdAt: new Date(),
        updatedAt: new Date(),
      }

      setThreads((current) => [
        optimisticThread,
        ...current.filter((thread) => thread.id !== optimisticThread.id),
      ])
      setSelectedThreadId(workingThreadId)
      setMessages([optimisticUserMessage])
    } else {
      setMessages((current) => [...current, optimisticUserMessage])
      setThreads((current) =>
        current.map((thread) =>
          thread.id === workingThreadId
            ? { ...thread, updatedAt: new Date() }
            : thread
        )
      )
    }

    try {
      const result = (await trpc.dashboardAssistant.sendMessage.mutate({
        orgId,
        message: content,
        threadId: isNewThread ? undefined : workingThreadId,
      })) as {
        thread: DashboardThread
        userMessage: DashboardMessage
        assistantMessage: DashboardMessage
      }

      setThreads((current) => {
        const remaining = current.filter(
          (thread) =>
            thread.id !== workingThreadId && thread.id !== result.thread.id
        )

        return [result.thread, ...remaining]
      })
      setSelectedThreadId(result.thread.id)
      router.replace(threadHref(result.thread.id))
      setMessages((current) => {
        const next: DashboardMessage[] = []
        let replaced = false

        for (const message of current) {
          if (message.id === optimisticUserId) {
            next.push(result.userMessage, result.assistantMessage)
            replaced = true
          } else {
            next.push(message)
          }
        }

        return replaced
          ? next
          : [...current, result.userMessage, result.assistantMessage]
      })
    } catch (sendError) {
      setMessages((current) =>
        current.filter((message) => message.id !== optimisticUserId)
      )
      setDraft(content)
      setError(
        sendError instanceof Error
          ? sendError.message
          : 'Failed to send message.'
      )

      if (isNewThread) {
        setThreads((current) =>
          current.filter((thread) => thread.id !== workingThreadId)
        )
        setSelectedThreadId(
          previousSelectedThreadId?.startsWith('temp-thread-')
            ? null
            : previousSelectedThreadId
        )
        router.replace(threadHref(null))
      }
    } finally {
      setSending(false)
    }
  }

  return (
    <div
      className={cn(
        embedded
          ? 'grid h-full min-h-0 grid-cols-1 overflow-hidden rounded-[1.6rem] border border-brand-line bg-background shadow-brand-panel lg:grid-cols-[280px_minmax(0,1fr)]'
          : 'h-[calc(100vh-2rem)] px-4 py-4 sm:px-6 lg:px-8'
      )}
    >
      <div
        className={cn(
          embedded
            ? 'contents'
            : 'grid h-full min-h-0 grid-cols-1 overflow-hidden rounded-[1.6rem] border border-brand-line bg-background shadow-brand-panel lg:grid-cols-[280px_minmax(0,1fr)]'
        )}
      >
        <aside className="kodi-sidebar-surface hidden min-h-0 border-r border-brand-line lg:flex lg:flex-col">
          <div className="border-b border-brand-line px-4 py-4">
            <div className="rounded-[1.25rem] bg-brand-elevated px-4 py-3 shadow-brand-panel">
              <p className="text-xs uppercase tracking-[0.18em] text-brand-subtle">
                Direct message
              </p>
              <p className="mt-2 text-sm font-medium text-foreground">
                Private threads with Kodi for questions, metrics, and one-off
                analysis.
              </p>
            </div>
          </div>

          <div className="flex items-center justify-between px-4 py-3">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-brand-subtle">
              Recent threads
            </p>
            <button
              type="button"
              onClick={resetThreadSelection}
              className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-brand-line bg-brand-elevated text-brand-quiet transition-colors hover:bg-secondary hover:text-foreground"
              aria-label="Start a new thread"
            >
              <Plus size={16} />
            </button>
          </div>

          <div className="flex-1 overflow-y-auto px-3 pb-4">
            {loadingThreads ? (
              <p className="px-2 py-3 text-sm text-brand-quiet">
                Loading threads...
              </p>
            ) : threads.length === 0 ? (
              <div className="rounded-[1.2rem] border border-dashed border-brand-line bg-brand-elevated px-4 py-5 text-sm text-brand-quiet">
                Your private conversations with Kodi will appear here.
              </div>
            ) : (
              threads.map((thread) => (
                <button
                  key={thread.id}
                  type="button"
                  onClick={() => openThread(thread.id)}
                  className={cn(
                    'mb-2 w-full rounded-[1.1rem] px-3 py-3 text-left transition-colors',
                    selectedThreadId === thread.id
                      ? 'bg-brand-accent-soft text-brand-accent-foreground shadow-brand-panel'
                      : 'bg-brand-elevated text-foreground hover:bg-secondary'
                  )}
                >
                  <p className="line-clamp-2 text-sm font-medium">
                    {thread.title}
                  </p>
                  <p
                    className={cn(
                      'mt-2 text-xs',
                      selectedThreadId === thread.id
                        ? 'text-brand-accent-foreground/70'
                        : 'text-brand-subtle'
                    )}
                  >
                    Updated {formatRelativeDate(thread.updatedAt)}
                  </p>
                </button>
              ))
            )}
          </div>
        </aside>

        <section className="flex min-h-0 min-w-0 flex-col bg-background">
          <div className="border-b border-brand-line px-4 py-3 sm:px-6">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-sm text-brand-quiet">{orgName}</p>
                <h1 className="mt-1 text-[20px] font-semibold tracking-[-0.04em] text-foreground">
                  {selectedThread?.title ?? 'Ask Kodi anything'}
                </h1>
              </div>
              <Button
                type="button"
                variant="outline"
                onClick={resetThreadSelection}
                className="rounded-full"
              >
                <MessageSquarePlus size={16} />
                New thread
              </Button>
            </div>

            {threads.length > 0 ? (
              <div className="mt-3 flex gap-2 overflow-x-auto lg:hidden">
                {threads.map((thread) => (
                  <button
                    key={thread.id}
                    type="button"
                    onClick={() => openThread(thread.id)}
                    className={cn(
                      'whitespace-nowrap rounded-full border px-3 py-1.5 text-sm transition-colors',
                      selectedThreadId === thread.id
                        ? 'border-brand-accent/20 bg-brand-accent-soft text-brand-accent-foreground'
                        : 'border-brand-line bg-brand-elevated text-brand-quiet'
                    )}
                  >
                    {thread.title}
                  </button>
                ))}
              </div>
            ) : null}
          </div>

          {selectedThreadId ? (
            <>
              <div
                ref={scrollRef}
                className="flex-1 overflow-y-auto px-4 py-6 sm:px-6"
              >
                {loadingMessages ? (
                  <p className="text-sm text-brand-quiet">Loading thread...</p>
                ) : (
                  <div className="mx-auto flex w-full max-w-3xl flex-col gap-5">
                    {messages.map((message) => (
                      <div
                        key={message.id}
                        className={cn(
                          'flex gap-3',
                          message.role === 'assistant'
                            ? 'items-start'
                            : 'items-start justify-end'
                        )}
                      >
                        {message.role === 'assistant' ? (
                          <AssistantAvatar />
                        ) : null}

                        <div
                          className={cn(
                            'max-w-[min(42rem,100%)] rounded-[1.4rem] px-4 py-3 text-[15px] leading-7 shadow-brand-panel',
                            message.role === 'assistant'
                              ? 'bg-brand-elevated text-foreground'
                              : 'bg-brand-accent-soft text-brand-accent-foreground'
                          )}
                        >
                          <div className="mb-1 flex items-center gap-2 text-xs">
                            <span className="font-semibold">
                              {message.role === 'assistant'
                                ? 'Kodi'
                                : (message.userName ?? 'You')}
                            </span>
                            <span className="text-current/55">
                              {formatTime(message.createdAt)}
                            </span>
                          </div>
                          <MessageBody content={message.content} />
                        </div>

                        {message.role === 'user' ? (
                          <UserAvatar
                            name={message.userName ?? session?.user?.name}
                          />
                        ) : null}
                      </div>
                    ))}

                    {sending ? (
                      <div className="flex items-start gap-3">
                        <AssistantAvatar />
                        <div className="rounded-[1.4rem] bg-brand-elevated px-4 py-3 text-sm text-brand-quiet shadow-brand-panel">
                          Kodi is responding...
                        </div>
                      </div>
                    ) : null}
                  </div>
                )}
              </div>

              <div className="border-t border-brand-line bg-background/95 px-4 py-4 backdrop-blur sm:px-6">
                <div className="mx-auto w-full max-w-3xl rounded-[1.6rem] border border-brand-line bg-brand-elevated p-3 shadow-brand-panel">
                  <Textarea
                    value={draft}
                    onChange={(event) => setDraft(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter' && !event.shiftKey) {
                        event.preventDefault()
                        void sendMessage()
                      }
                    }}
                    placeholder="Ask a follow-up or start a new analysis"
                    rows={1}
                    className="min-h-0 resize-none border-0 bg-transparent px-1 py-1 text-[16px] leading-7 shadow-none focus-visible:ring-0 focus-visible:ring-offset-0"
                  />

                  <div className="mt-3 flex items-center justify-between border-t border-brand-line pt-3">
                    <p className="text-xs text-brand-subtle">
                      Private to you. Separate from team chat channels.
                    </p>

                    <Button
                      size="icon"
                      className="h-10 w-10 rounded-full"
                      disabled={!draft.trim() || sending}
                      onClick={() => void sendMessage()}
                      aria-label="Send message"
                    >
                      <ArrowUp size={16} />
                    </Button>
                  </div>
                </div>

                {error ? (
                  <p className="mx-auto mt-2 w-full max-w-3xl text-sm text-brand-danger">
                    {error}
                  </p>
                ) : null}
              </div>
            </>
          ) : (
            <div className="flex flex-1 items-center justify-center px-4 py-10 sm:px-6">
              <div className="w-full max-w-3xl">
                <div className="mb-10 text-center">
                  <p className="text-sm text-brand-quiet">{orgName}</p>
                  <h2 className="mt-6 text-4xl tracking-[-0.06em] text-foreground sm:text-5xl">
                    What can I help you figure out?
                  </h2>
                  <p className="mx-auto mt-4 max-w-2xl text-sm leading-6 text-brand-quiet">
                    Start a private conversation for one-off questions, metrics,
                    and analysis grounded in your workspace context.
                  </p>
                </div>

                <div className="rounded-[1.9rem] border border-brand-line bg-brand-elevated p-4 shadow-brand-panel">
                  <Textarea
                    value={draft}
                    onChange={(event) => setDraft(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter' && !event.shiftKey) {
                        event.preventDefault()
                        void sendMessage()
                      }
                    }}
                    placeholder="Ask about metrics, activity, blockers, follow-ups, or anything else"
                    rows={4}
                    className="min-h-[144px] resize-none border-0 bg-transparent px-1 py-1 text-[17px] leading-8 shadow-none focus-visible:ring-0 focus-visible:ring-offset-0"
                  />

                  <div className="mt-3 flex items-center justify-between border-t border-brand-line pt-3">
                    <button
                      type="button"
                      className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-brand-line bg-background text-brand-quiet transition-colors hover:bg-secondary hover:text-foreground"
                      aria-label="Start a new private conversation"
                    >
                      <Plus size={16} />
                    </button>

                    <Button
                      size="icon"
                      className="h-10 w-10 rounded-full"
                      disabled={!draft.trim() || sending}
                      onClick={() => void sendMessage()}
                      aria-label="Ask Kodi"
                    >
                      <ArrowUp size={16} />
                    </Button>
                  </div>
                </div>

                {error ? (
                  <p className="mt-3 text-center text-sm text-brand-danger">
                    {error}
                  </p>
                ) : null}
              </div>
            </div>
          )}
        </section>
      </div>
    </div>
  )
}
