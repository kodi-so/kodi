'use client'

import { useEffect, useRef, useState } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import {
  Bot,
  CornerUpRight,
  Hash,
  Loader2,
  MessageSquareText,
  Send,
  Sparkles,
} from 'lucide-react'
import { Button, Skeleton, Textarea, cn } from '@kodi/ui'
import { trpc } from '@/lib/trpc'
import { useSession } from '@/lib/auth-client'

type Message = {
  id: string
  role: 'user' | 'assistant'
  content: string
  status?: string | null
  createdAt?: string | Date | null
  userName?: string | null
  userImage?: string | null
}

type ThreadPreview = {
  id: string
  channelId: string
  title: string
  preview: string
  messageIds: string[]
  createdAt: Date
}

const channels = [
  {
    id: 'all',
    label: 'All conversations',
    description: 'Everything happening in this workspace',
  },
  {
    id: 'planning',
    label: 'Planning',
    description: 'Questions, decisions, and strategy',
  },
  {
    id: 'meetings',
    label: 'Meetings',
    description: 'Calls, recaps, and meeting follow-through',
  },
  {
    id: 'follow-up',
    label: 'Follow-up',
    description: 'Tasks, tickets, owners, and next steps',
  },
  {
    id: 'customer',
    label: 'Customer',
    description: 'Accounts, pipelines, and customer context',
  },
] as const

function formatTime(date: Date) {
  return date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
}

function formatDay(date: Date) {
  return date.toLocaleDateString([], {
    month: 'short',
    day: 'numeric',
    year:
      date.getFullYear() === new Date().getFullYear() ? undefined : 'numeric',
  })
}

function getMessageDate(value?: string | Date | null) {
  return value ? new Date(value) : new Date()
}

function trimCopy(value: string, limit: number) {
  if (value.length <= limit) return value
  return `${value.slice(0, limit).trimEnd()}...`
}

function getChannelId(content: string) {
  const normalized = content.toLowerCase()

  if (
    normalized.includes('meeting') ||
    normalized.includes('zoom') ||
    normalized.includes('call') ||
    normalized.includes('recap')
  ) {
    return 'meetings'
  }

  if (
    normalized.includes('ticket') ||
    normalized.includes('task') ||
    normalized.includes('owner') ||
    normalized.includes('follow-up') ||
    normalized.includes('next step') ||
    normalized.includes('linear')
  ) {
    return 'follow-up'
  }

  if (
    normalized.includes('customer') ||
    normalized.includes('client') ||
    normalized.includes('sales') ||
    normalized.includes('deal') ||
    normalized.includes('pipeline') ||
    normalized.includes('hubspot')
  ) {
    return 'customer'
  }

  return 'planning'
}

function buildThreads(messages: Message[]) {
  const items: ThreadPreview[] = []

  for (let index = 0; index < messages.length; index += 1) {
    const message = messages[index]
    if (!message || message.role !== 'user') continue

    const nextUserIndex = messages.findIndex(
      (candidate, candidateIndex) =>
        candidateIndex > index && candidate.role === 'user'
    )
    const endIndex = nextUserIndex === -1 ? messages.length : nextUserIndex
    const slice = messages.slice(index, endIndex)
    const assistantReply = slice.find(
      (candidate) => candidate.role === 'assistant'
    )

    items.push({
      id: message.id,
      channelId: getChannelId(message.content),
      title: trimCopy(message.content, 60),
      preview: trimCopy(assistantReply?.content ?? message.content, 92),
      messageIds: slice.map((candidate) => candidate.id),
      createdAt: getMessageDate(
        slice[slice.length - 1]?.createdAt ?? message.createdAt
      ),
    })
  }

  return items.reverse()
}

function MarkdownMessage({
  content,
  isUser,
}: {
  content: string
  isUser: boolean
}) {
  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      components={{
        p: ({ children }) => <p className="mb-3 last:mb-0">{children}</p>,
        ul: ({ children }) => (
          <ul className="mb-3 list-disc space-y-1 pl-5 last:mb-0">
            {children}
          </ul>
        ),
        ol: ({ children }) => (
          <ol className="mb-3 list-decimal space-y-1 pl-5 last:mb-0">
            {children}
          </ol>
        ),
        li: ({ children }) => <li className="leading-7">{children}</li>,
        code: ({ className, children, ...props }) => {
          const isBlock = Boolean(className?.includes('language-'))

          if (isBlock) {
            return (
              <pre
                className={cn(
                  'my-3 overflow-x-auto rounded-2xl px-4 py-3 text-xs',
                  isUser
                    ? 'bg-[rgba(200,146,44,0.14)] text-foreground'
                    : 'bg-secondary/80 text-foreground'
                )}
              >
                <code className={className} {...props}>
                  {children}
                </code>
              </pre>
            )
          }

          return (
            <code
              className={cn(
                'rounded-md px-1.5 py-0.5 text-xs',
                isUser
                  ? 'bg-[rgba(200,146,44,0.14)] text-foreground'
                  : 'bg-secondary/80 text-foreground'
              )}
              {...props}
            >
              {children}
            </code>
          )
        },
        pre: ({ children }) => <>{children}</>,
        a: ({ href, children }) => (
          <a
            href={href}
            target="_blank"
            rel="noreferrer"
            className="text-[hsl(var(--kodi-accent-strong))] underline decoration-[color:rgba(160,107,17,0.35)] underline-offset-4"
          >
            {children}
          </a>
        ),
        blockquote: ({ children }) => (
          <blockquote className="my-3 border-l-2 border-border pl-4 text-muted-foreground">
            {children}
          </blockquote>
        ),
      }}
    >
      {content}
    </ReactMarkdown>
  )
}

export function ChatInterface({
  orgId,
  initialPrompt,
  focusMessageId,
}: {
  orgId: string
  initialPrompt?: string | null
  focusMessageId?: string | null
}) {
  const router = useRouter()
  const pathname = usePathname()
  const { data: session } = useSession()
  const [messages, setMessages] = useState<Message[]>([])
  const [loading, setLoading] = useState(true)
  const [sending, setSending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [input, setInput] = useState('')
  const [selectedChannel, setSelectedChannel] = useState('all')
  const [selectedThreadId, setSelectedThreadId] = useState<string | null>(null)
  const [composerHint, setComposerHint] = useState<string | null>(null)
  const [autoPromptHandled, setAutoPromptHandled] = useState(false)
  const messageContainerRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)

    async function loadHistory() {
      try {
        const rows = await trpc.chat.getHistory.query({ orgId, limit: 80 })
        if (cancelled) return

        setMessages(
          rows.map((row) => ({
            id: row.id,
            role: row.role as 'user' | 'assistant',
            content: row.content,
            status: row.status,
            createdAt: row.createdAt,
            userName: 'userName' in row ? (row as Message).userName : null,
            userImage: 'userImage' in row ? (row as Message).userImage : null,
          }))
        )
      } catch (loadError) {
        if (cancelled) return
        setError(
          loadError instanceof Error
            ? loadError.message
            : 'We could not load this conversation.'
        )
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    void loadHistory()

    return () => {
      cancelled = true
    }
  }, [orgId])

  useEffect(() => {
    if (!messageContainerRef.current) return

    const container = messageContainerRef.current
    container.scrollTo({ top: container.scrollHeight, behavior: 'smooth' })
  }, [messages, sending])

  useEffect(() => {
    const element = textareaRef.current
    if (!element) return

    element.style.height = 'auto'
    element.style.height = `${Math.min(element.scrollHeight, 176)}px`
  }, [input])

  const threads = buildThreads(messages)
  const visibleThreads =
    selectedChannel === 'all'
      ? threads
      : threads.filter((thread) => thread.channelId === selectedChannel)
  const selectedThread =
    visibleThreads.find((thread) => thread.id === selectedThreadId) ??
    visibleThreads[0] ??
    null
  const selectedThreadMessageIds = new Set(selectedThread?.messageIds ?? [])

  useEffect(() => {
    if (!selectedThreadId && visibleThreads[0]) {
      setSelectedThreadId(visibleThreads[0].id)
      return
    }

    if (
      selectedThreadId &&
      visibleThreads.length > 0 &&
      !visibleThreads.some((thread) => thread.id === selectedThreadId)
    ) {
      setSelectedThreadId(visibleThreads[0]!.id)
    }
  }, [selectedThreadId, visibleThreads])

  useEffect(() => {
    if (loading || !focusMessageId) return

    const thread = threads.find((candidate) =>
      candidate.messageIds.includes(focusMessageId)
    )

    if (thread) {
      setSelectedChannel(thread.channelId)
      setSelectedThreadId(thread.id)
    }

    const timer = window.setTimeout(() => {
      const element = document.getElementById(`message-${focusMessageId}`)
      element?.scrollIntoView({ behavior: 'smooth', block: 'center' })
      router.replace(pathname)
    }, 120)

    return () => window.clearTimeout(timer)
  }, [focusMessageId, loading, pathname, router, threads])

  async function sendMessage(nextMessage?: string) {
    const messageText = (nextMessage ?? input).trim()
    if (!messageText || sending) return

    const optimisticId = `optimistic-${Date.now()}`

    setMessages((current) => [
      ...current,
      {
        id: optimisticId,
        role: 'user',
        content: messageText,
        status: 'sending',
        createdAt: new Date().toISOString(),
        userName: session?.user?.name ?? 'You',
        userImage: session?.user?.image ?? null,
      },
    ])
    setInput('')
    setError(null)
    setSending(true)

    try {
      const result = await trpc.chat.sendMessage.mutate({
        orgId,
        message: messageText,
      })
      const assistantMessage = result.assistantMessage

      if (!assistantMessage) {
        throw new Error('Kodi did not return a reply.')
      }

      setMessages((current) => {
        const replaced = current.map((message) =>
          message.id === optimisticId
            ? {
                id: result.userMessage.id,
                role: 'user' as const,
                content: result.userMessage.content,
                status: result.userMessage.status,
                createdAt: result.userMessage.createdAt,
                userName: session?.user?.name ?? 'You',
                userImage: session?.user?.image ?? null,
              }
            : message
        )

        return [
          ...replaced,
          {
            id: assistantMessage.id,
            role: 'assistant' as const,
            content: assistantMessage.content,
            status: assistantMessage.status,
            createdAt: assistantMessage.createdAt,
            userName: null,
            userImage: null,
          },
        ]
      })

      setComposerHint(null)
    } catch (sendError) {
      setMessages((current) =>
        current.map((message) =>
          message.id === optimisticId
            ? { ...message, status: 'error' }
            : message
        )
      )
      setInput(messageText)
      setError(
        sendError instanceof Error
          ? sendError.message
          : 'We could not send that message.'
      )
    } finally {
      setSending(false)
    }
  }

  useEffect(() => {
    if (!initialPrompt || loading || autoPromptHandled) return

    setAutoPromptHandled(true)
    setComposerHint('Started from the dashboard')
    void sendMessage(initialPrompt).finally(() => {
      router.replace(pathname)
    })
  }, [autoPromptHandled, initialPrompt, loading, pathname, router, sendMessage])

  function handleThreadSelect(threadId: string) {
    setSelectedThreadId(threadId)
    const element = document.getElementById(`message-${threadId}`)
    element?.scrollIntoView({ behavior: 'smooth', block: 'center' })
  }

  function handleChannelSelect(channelId: string) {
    setSelectedChannel(channelId)
  }

  return (
    <div className="grid min-h-screen gap-4 px-4 py-4 lg:grid-cols-[220px_minmax(0,1fr)_320px] lg:px-6 lg:py-6">
      <aside className="order-2 rounded-[1.8rem] border border-border/80 bg-card/78 p-4 shadow-soft lg:order-1 lg:max-h-[calc(100vh-3rem)] lg:overflow-auto">
        <div className="flex items-center gap-2 text-sm uppercase tracking-[0.18em] text-muted-foreground">
          <Hash size={14} />
          Channels
        </div>

        <div className="mt-4 space-y-2">
          {channels.map((channel) => {
            const count =
              channel.id === 'all'
                ? threads.length
                : threads.filter((thread) => thread.channelId === channel.id)
                    .length

            return (
              <button
                key={channel.id}
                onClick={() => handleChannelSelect(channel.id)}
                className={cn(
                  'w-full rounded-[1.2rem] border px-4 py-3 text-left transition-colors',
                  selectedChannel === channel.id
                    ? 'border-border bg-secondary text-foreground'
                    : 'border-transparent bg-transparent text-muted-foreground hover:border-border/70 hover:bg-secondary/55 hover:text-foreground'
                )}
              >
                <div className="flex items-center justify-between gap-3">
                  <p className="text-sm">{channel.label}</p>
                  <span className="rounded-full bg-background/80 px-2 py-0.5 text-xs text-muted-foreground">
                    {count}
                  </span>
                </div>
                <p className="mt-1 text-xs leading-5 text-muted-foreground">
                  {channel.description}
                </p>
              </button>
            )
          })}
        </div>

        <div className="mt-6 rounded-[1.4rem] border border-border/80 bg-[linear-gradient(180deg,rgba(255,255,255,0.6),rgba(245,239,228,0.92))] p-4">
          <p className="text-sm uppercase tracking-[0.18em] text-muted-foreground">
            Rhythm
          </p>
          <p className="mt-3 text-xl tracking-[-0.04em] text-foreground">
            Keep threads focused and short.
          </p>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">
            Use the dashboard for a fresh ask, then keep related follow-up in
            the same thread here.
          </p>
        </div>
      </aside>

      <section className="order-1 flex min-h-[78vh] flex-col overflow-hidden rounded-[2rem] border border-border/80 bg-[linear-gradient(180deg,rgba(255,255,255,0.88),rgba(248,242,232,0.96))] shadow-soft lg:order-2 lg:min-h-[calc(100vh-3rem)]">
        <div className="border-b border-border/80 px-5 py-4 sm:px-6">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <div className="inline-flex items-center gap-2 rounded-full border border-border/80 bg-card/80 px-3 py-1 text-sm text-muted-foreground">
                <Sparkles size={14} className="text-primary" />
                Workspace chat
              </div>
              <h1 className="mt-3 text-2xl tracking-[-0.05em] text-foreground sm:text-3xl">
                Keep the conversation moving
              </h1>
              <p className="mt-1 text-sm leading-6 text-muted-foreground">
                Slack-like organization on top of your existing Kodi thread.
              </p>
            </div>

            {selectedThread ? (
              <div className="rounded-[1.2rem] border border-border/80 bg-card/70 px-4 py-3 text-sm text-muted-foreground">
                <p className="text-xs uppercase tracking-[0.18em]">
                  Active thread
                </p>
                <p className="mt-1 text-foreground">{selectedThread.title}</p>
              </div>
            ) : null}
          </div>
        </div>

        <div
          ref={messageContainerRef}
          className="flex-1 overflow-y-auto px-4 py-5 sm:px-6"
        >
          {loading ? (
            <div className="space-y-4">
              {Array.from({ length: 5 }).map((_, index) => (
                <div key={index} className="space-y-2">
                  <Skeleton className="h-4 w-24" />
                  <Skeleton className="h-20 rounded-[1.4rem]" />
                </div>
              ))}
            </div>
          ) : error && messages.length === 0 ? (
            <div className="rounded-[1.4rem] border border-border/80 bg-card/70 px-5 py-4 text-sm text-muted-foreground">
              {error}
            </div>
          ) : (
            <div className="space-y-5">
              {messages.map((message, index) => {
                const createdAt = getMessageDate(message.createdAt)
                const previous = index > 0 ? messages[index - 1] : null
                const showDayLabel =
                  !previous ||
                  formatDay(createdAt) !==
                    formatDay(getMessageDate(previous.createdAt))
                const isUser = message.role === 'user'
                const isSelected =
                  selectedThreadMessageIds.size > 0 &&
                  selectedThreadMessageIds.has(message.id)

                return (
                  <div key={message.id} id={`message-${message.id}`}>
                    {showDayLabel ? (
                      <div className="mb-4 flex items-center gap-3">
                        <div className="h-px flex-1 bg-border/80" />
                        <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">
                          {formatDay(createdAt)}
                        </p>
                        <div className="h-px flex-1 bg-border/80" />
                      </div>
                    ) : null}

                    <div
                      className={cn(
                        'flex gap-3',
                        isUser ? 'justify-end' : 'justify-start'
                      )}
                    >
                      {!isUser ? (
                        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border border-border/80 bg-secondary/70 text-foreground">
                          <Bot size={18} />
                        </div>
                      ) : null}

                      <div
                        className={cn(
                          'max-w-3xl rounded-[1.5rem] border px-4 py-3 shadow-soft',
                          isUser
                            ? 'border-[rgba(202,155,61,0.28)] bg-[rgba(240,209,145,0.55)]'
                            : 'border-border/80 bg-card/86',
                          isSelected && 'ring-2 ring-[rgba(202,155,61,0.22)]'
                        )}
                      >
                        <div className="mb-2 flex items-center gap-2 text-xs uppercase tracking-[0.18em] text-muted-foreground">
                          <span
                            className={cn(
                              isUser && 'text-[rgba(101,72,17,0.88)]'
                            )}
                          >
                            {isUser ? (message.userName ?? 'You') : 'Kodi'}
                          </span>
                          <span className="text-border">•</span>
                          <span>{formatTime(createdAt)}</span>
                          {message.status === 'error' ? (
                            <>
                              <span className="text-border">•</span>
                              <span className="text-[hsl(var(--destructive))]">
                                failed
                              </span>
                            </>
                          ) : null}
                        </div>

                        <div className="text-sm leading-7 text-foreground">
                          <MarkdownMessage
                            content={message.content}
                            isUser={isUser}
                          />
                        </div>
                      </div>

                      {isUser ? (
                        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border border-border/80 bg-card/90 text-sm text-foreground">
                          {session?.user?.name?.[0]?.toUpperCase() ??
                            session?.user?.email?.[0]?.toUpperCase() ??
                            'Y'}
                        </div>
                      ) : null}
                    </div>
                  </div>
                )
              })}

              {sending ? (
                <div className="flex items-center gap-3 rounded-[1.4rem] border border-border/80 bg-card/76 px-4 py-3 text-sm text-muted-foreground">
                  <Loader2 size={16} className="animate-spin text-primary" />
                  Kodi is working through that request.
                </div>
              ) : null}
            </div>
          )}
        </div>

        <div className="border-t border-border/80 bg-[rgba(248,242,232,0.92)] px-4 py-4 backdrop-blur sm:px-6">
          <div className="rounded-[1.6rem] border border-border/80 bg-card/88 p-3 shadow-soft">
            {composerHint ? (
              <p className="mb-2 text-xs uppercase tracking-[0.18em] text-muted-foreground">
                {composerHint}
              </p>
            ) : null}

            <div className="flex items-end gap-3">
              <Textarea
                ref={textareaRef}
                value={input}
                onChange={(event) => setInput(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' && !event.shiftKey) {
                    event.preventDefault()
                    void sendMessage()
                  }
                }}
                placeholder="Message Kodi about the next move, a blocker, or work that should happen now."
                rows={1}
                disabled={sending || loading}
                className="min-h-0 flex-1 resize-none border-0 bg-transparent px-1 py-1 text-base leading-7 shadow-none focus-visible:ring-0 focus-visible:ring-offset-0"
                style={{ maxHeight: '176px' }}
              />
              <Button
                onClick={() => void sendMessage()}
                size="icon"
                className="h-12 w-12 rounded-2xl"
                disabled={!input.trim() || sending || loading}
                aria-label="Send message"
              >
                <Send size={18} />
              </Button>
            </div>

            {error ? (
              <p className="mt-2 text-sm text-[hsl(var(--destructive))]">
                {error}
              </p>
            ) : null}
          </div>
        </div>
      </section>

      <aside className="order-3 rounded-[1.8rem] border border-border/80 bg-card/78 p-4 shadow-soft lg:max-h-[calc(100vh-3rem)] lg:overflow-auto">
        <div className="flex items-center gap-2 text-sm uppercase tracking-[0.18em] text-muted-foreground">
          <MessageSquareText size={14} />
          Threads
        </div>

        <div className="mt-4 space-y-2">
          {loading ? (
            Array.from({ length: 4 }).map((_, index) => (
              <Skeleton key={index} className="h-20 rounded-[1.3rem]" />
            ))
          ) : visibleThreads.length === 0 ? (
            <div className="rounded-[1.3rem] border border-border/80 bg-secondary/45 px-4 py-4 text-sm leading-6 text-muted-foreground">
              No threads match this channel yet.
            </div>
          ) : (
            visibleThreads.map((thread) => (
              <button
                key={thread.id}
                onClick={() => handleThreadSelect(thread.id)}
                className={cn(
                  'w-full rounded-[1.3rem] border px-4 py-3 text-left transition-colors',
                  selectedThread?.id === thread.id
                    ? 'border-border bg-secondary/80'
                    : 'border-border/65 bg-secondary/42 hover:bg-secondary/65'
                )}
              >
                <p className="text-sm text-foreground">{thread.title}</p>
                <p className="mt-1 text-sm leading-6 text-muted-foreground">
                  {thread.preview}
                </p>
                <div className="mt-2 flex items-center gap-2 text-xs uppercase tracking-[0.14em] text-muted-foreground">
                  <CornerUpRight size={12} />
                  {formatDay(thread.createdAt)}
                </div>
              </button>
            ))
          )}
        </div>

        <div className="mt-6 rounded-[1.4rem] border border-border/80 bg-[linear-gradient(180deg,rgba(255,255,255,0.56),rgba(245,239,228,0.92))] p-4">
          <p className="text-sm uppercase tracking-[0.18em] text-muted-foreground">
            Thread focus
          </p>

          {selectedThread ? (
            <>
              <p className="mt-3 text-xl tracking-[-0.04em] text-foreground">
                {selectedThread.title}
              </p>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">
                {selectedThread.preview}
              </p>
              <p className="mt-4 text-xs uppercase tracking-[0.18em] text-muted-foreground">
                {selectedThread.messageIds.length} messages in this thread
              </p>
            </>
          ) : (
            <p className="mt-3 text-sm leading-6 text-muted-foreground">
              Start with the dashboard or send a message here to open your next
              thread.
            </p>
          )}
        </div>
      </aside>
    </div>
  )
}
