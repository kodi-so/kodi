'use client'

import { useEffect, useRef, useState } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { CornerUpRight, Hash, Plus, Send, X } from 'lucide-react'
import { Button, Textarea, cn } from '@kodi/ui'
import { trpc } from '@/lib/trpc'
import { useSession } from '@/lib/auth-client'

type Channel = {
  id: string
  orgId: string
  name: string
  slug: string
  createdBy: string | null
  createdAt: string | Date
}

type Message = {
  id: string
  orgId: string
  channelId: string
  threadRootMessageId: string | null
  userId: string | null
  role: 'user' | 'assistant'
  content: string
  status: string | null
  createdAt: string | Date
  userName?: string | null
  userImage?: string | null
}

function formatTimestamp(value: string | Date) {
  return new Date(value).toLocaleTimeString([], {
    hour: 'numeric',
    minute: '2-digit',
  })
}

function formatDay(value: string | Date) {
  return new Date(value).toLocaleDateString([], {
    month: 'short',
    day: 'numeric',
  })
}

function initials(name?: string | null) {
  if (!name) return 'K'

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
        p: ({ children }) => <p className="mb-3 last:mb-0">{children}</p>,
        ul: ({ children }) => (
          <ul className="mb-3 list-disc pl-5 last:mb-0">{children}</ul>
        ),
        ol: ({ children }) => (
          <ol className="mb-3 list-decimal pl-5 last:mb-0">{children}</ol>
        ),
        a: ({ href, children }) => (
          <a
            href={href}
            target="_blank"
            rel="noreferrer"
            className="text-[hsl(var(--kodi-accent-strong))] underline underline-offset-4"
          >
            {children}
          </a>
        ),
        code: ({ children }) => (
          <code className="rounded bg-secondary px-1.5 py-0.5 text-xs">
            {children}
          </code>
        ),
        pre: ({ children }) => (
          <pre className="overflow-x-auto rounded-xl bg-secondary p-3 text-xs">
            {children}
          </pre>
        ),
      }}
    >
      {content}
    </ReactMarkdown>
  )
}

function MessageRow({
  message,
  replies,
  onOpenThread,
}: {
  message: Message
  replies: Message[]
  onOpenThread: () => void
}) {
  return (
    <div className="px-5 py-4 hover:bg-[#f8f8f8] sm:px-7">
      <div className="flex items-start gap-3">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-[#ede7f6] text-xs font-semibold text-[#4a154b]">
          {message.role === 'assistant'
            ? 'K'
            : initials(message.userName ?? 'You')}
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex items-baseline gap-2">
            <p className="text-sm font-semibold text-foreground">
              {message.role === 'assistant'
                ? 'Kodi'
                : (message.userName ?? 'You')}
            </p>
            <p className="text-xs text-muted-foreground">
              {formatTimestamp(message.createdAt)}
            </p>
          </div>

          <div className="mt-1 text-sm leading-7 text-foreground">
            <MessageBody content={message.content} />
          </div>

          {replies.length > 0 ? (
            <button
              onClick={onOpenThread}
              className="mt-3 inline-flex items-center gap-2 text-sm font-medium text-[#1264a3] hover:underline"
            >
              <CornerUpRight size={15} />
              {replies.length} repl{replies.length === 1 ? 'y' : 'ies'}
              <span className="text-muted-foreground">
                Last reply {formatDay(replies[replies.length - 1]!.createdAt)}
              </span>
            </button>
          ) : (
            <button
              onClick={onOpenThread}
              className="mt-3 inline-flex items-center gap-2 text-sm font-medium text-[#1264a3] hover:underline"
            >
              Reply in thread
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

export function ChatInterface({
  orgId,
  initialPrompt,
  initialChannelId,
  initialThreadId,
}: {
  orgId: string
  initialPrompt?: string | null
  initialChannelId?: string | null
  initialThreadId?: string | null
}) {
  const router = useRouter()
  const pathname = usePathname()
  const { data: session } = useSession()
  const [channels, setChannels] = useState<Channel[]>([])
  const [selectedChannelId, setSelectedChannelId] = useState<string | null>(
    null
  )
  const [messages, setMessages] = useState<Message[]>([])
  const [selectedThreadId, setSelectedThreadId] = useState<string | null>(null)
  const [channelDraft, setChannelDraft] = useState('')
  const [showChannelComposer, setShowChannelComposer] = useState(false)
  const [messageDraft, setMessageDraft] = useState('')
  const [threadDraft, setThreadDraft] = useState('')
  const [loadingChannels, setLoadingChannels] = useState(true)
  const [loadingMessages, setLoadingMessages] = useState(false)
  const [creatingChannel, setCreatingChannel] = useState(false)
  const [sendingMain, setSendingMain] = useState(false)
  const [sendingThread, setSendingThread] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [promptHandled, setPromptHandled] = useState(false)
  const channelScrollRef = useRef<HTMLDivElement>(null)
  const threadScrollRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    let cancelled = false
    setLoadingChannels(true)

    async function loadChannels() {
      try {
        const rows = await trpc.chat.listChannels.query({ orgId })
        if (cancelled) return

        setChannels(rows as Channel[])

        const targetChannel =
          rows.find((item) => item.id === initialChannelId) ?? rows[0] ?? null

        setSelectedChannelId(targetChannel?.id ?? null)
      } catch (loadError) {
        if (!cancelled) {
          setError(
            loadError instanceof Error
              ? loadError.message
              : 'Failed to load channels.'
          )
        }
      } finally {
        if (!cancelled) setLoadingChannels(false)
      }
    }

    void loadChannels()

    return () => {
      cancelled = true
    }
  }, [initialChannelId, orgId])

  useEffect(() => {
    if (!selectedChannelId) {
      setMessages([])
      return
    }

    let cancelled = false
    const channelId = selectedChannelId
    setLoadingMessages(true)
    setError(null)

    async function loadMessages() {
      try {
        const rows = await trpc.chat.getChannelMessages.query({
          orgId,
          channelId,
        })

        if (cancelled) return

        setMessages(rows as Message[])
      } catch (loadError) {
        if (!cancelled) {
          setError(
            loadError instanceof Error
              ? loadError.message
              : 'Failed to load messages.'
          )
        }
      } finally {
        if (!cancelled) setLoadingMessages(false)
      }
    }

    void loadMessages()

    return () => {
      cancelled = true
    }
  }, [orgId, selectedChannelId])

  const rootMessages = messages.filter(
    (message) => !message.threadRootMessageId
  )
  const repliesByThread = messages.reduce<Record<string, Message[]>>(
    (accumulator, message) => {
      if (!message.threadRootMessageId) return accumulator

      if (!accumulator[message.threadRootMessageId]) {
        accumulator[message.threadRootMessageId] = []
      }

      accumulator[message.threadRootMessageId]!.push(message)
      return accumulator
    },
    {}
  )

  const selectedThreadRoot =
    rootMessages.find((message) => message.id === selectedThreadId) ?? null
  const selectedThreadReplies = selectedThreadRoot
    ? (repliesByThread[selectedThreadRoot.id] ?? [])
    : []

  useEffect(() => {
    if (!selectedThreadId) return

    const exists = rootMessages.some(
      (message) => message.id === selectedThreadId
    )
    if (!exists) {
      setSelectedThreadId(null)
    }
  }, [rootMessages, selectedThreadId])

  useEffect(() => {
    if (!initialThreadId || loadingMessages) return

    const exists = rootMessages.some(
      (message) => message.id === initialThreadId
    )
    if (exists) {
      setSelectedThreadId(initialThreadId)
      router.replace(pathname)
    }
  }, [initialThreadId, loadingMessages, pathname, rootMessages, router])

  useEffect(() => {
    if (!channelScrollRef.current) return
    channelScrollRef.current.scrollTo({
      top: channelScrollRef.current.scrollHeight,
      behavior: 'smooth',
    })
  }, [messages, sendingMain])

  useEffect(() => {
    if (!threadScrollRef.current) return
    threadScrollRef.current.scrollTo({
      top: threadScrollRef.current.scrollHeight,
      behavior: 'smooth',
    })
  }, [selectedThreadReplies, sendingThread])

  async function createChannel() {
    const name = channelDraft.trim()
    if (!name || creatingChannel) return

    setCreatingChannel(true)
    setError(null)

    try {
      const created = await trpc.chat.createChannel.mutate({ orgId, name })
      const next = created as Channel
      setChannels((current) => [...current, next])
      setSelectedChannelId(next.id)
      setSelectedThreadId(null)
      setChannelDraft('')
      setShowChannelComposer(false)
      setMessages([])
    } catch (createError) {
      setError(
        createError instanceof Error
          ? createError.message
          : 'Failed to create channel.'
      )
    } finally {
      setCreatingChannel(false)
    }
  }

  async function sendMessage(options: {
    message: string
    threadRootMessageId?: string
  }) {
    if (!selectedChannelId) return

    const content = options.message.trim()
    if (!content) return

    const sendingThreadReply = Boolean(options.threadRootMessageId)

    if (sendingThreadReply) {
      setSendingThread(true)
    } else {
      setSendingMain(true)
    }

    setError(null)

    try {
      const result = await trpc.chat.sendMessage.mutate({
        orgId,
        channelId: selectedChannelId,
        message: content,
        threadRootMessageId: options.threadRootMessageId,
      })

      const nextMessages = [
        result.userMessage as Message,
        result.assistantMessage as Message,
      ]

      setMessages((current) => [...current, ...nextMessages])
      setSelectedThreadId(result.threadRootMessageId)

      if (sendingThreadReply) {
        setThreadDraft('')
      } else {
        setMessageDraft('')
      }
    } catch (sendError) {
      setError(
        sendError instanceof Error
          ? sendError.message
          : 'Failed to send message.'
      )
    } finally {
      if (sendingThreadReply) {
        setSendingThread(false)
      } else {
        setSendingMain(false)
      }
    }
  }

  useEffect(() => {
    if (
      !initialPrompt ||
      !selectedChannelId ||
      loadingChannels ||
      promptHandled
    ) {
      return
    }

    setPromptHandled(true)
    void sendMessage({ message: initialPrompt }).finally(() => {
      router.replace(pathname)
    })
  }, [
    initialPrompt,
    loadingChannels,
    pathname,
    promptHandled,
    router,
    selectedChannelId,
  ])

  const selectedChannel =
    channels.find((channel) => channel.id === selectedChannelId) ?? null

  return (
    <div className="grid h-[calc(100vh-2rem)] grid-cols-1 overflow-hidden px-4 py-4 lg:grid-cols-[260px_minmax(0,1fr)_360px] lg:px-6">
      <aside className="hidden border-r border-[#4f3756] bg-[#3f0e40] text-white lg:flex lg:flex-col">
        <div className="border-b border-[#5c4563] px-4 py-4">
          <p className="text-base font-semibold">
            {session?.user?.name ?? 'Kodi'}
          </p>
        </div>

        <div className="flex items-center justify-between px-4 py-3">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#cabfd0]">
            Channels
          </p>
          <button
            onClick={() => setShowChannelComposer((current) => !current)}
            className="rounded-md p-1 text-[#cabfd0] transition-colors hover:bg-[#5c365f] hover:text-white"
            aria-label="Create channel"
          >
            <Plus size={16} />
          </button>
        </div>

        {showChannelComposer ? (
          <div className="px-4 pb-3">
            <div className="space-y-2 rounded-lg bg-[#512753] p-3">
              <input
                value={channelDraft}
                onChange={(event) => setChannelDraft(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') {
                    event.preventDefault()
                    void createChannel()
                  }
                }}
                placeholder="channel-name"
                className="w-full rounded-md border border-[#75507b] bg-[#6a3d70] px-3 py-2 text-sm text-white outline-none placeholder:text-[#cabfd0]"
              />
              <div className="flex items-center justify-end gap-2">
                <button
                  onClick={() => {
                    setShowChannelComposer(false)
                    setChannelDraft('')
                  }}
                  className="text-sm text-[#cabfd0] hover:text-white"
                >
                  Cancel
                </button>
                <button
                  onClick={() => void createChannel()}
                  disabled={!channelDraft.trim() || creatingChannel}
                  className="rounded-md bg-white px-3 py-1.5 text-sm font-medium text-[#3f0e40] disabled:opacity-60"
                >
                  Create
                </button>
              </div>
            </div>
          </div>
        ) : null}

        <div className="flex-1 overflow-y-auto px-2 pb-4">
          {channels.map((channel) => (
            <button
              key={channel.id}
              onClick={() => {
                setSelectedChannelId(channel.id)
                setSelectedThreadId(null)
              }}
              className={cn(
                'flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm transition-colors',
                selectedChannelId === channel.id
                  ? 'bg-[#1164a3] text-white'
                  : 'text-[#f2e9f7] hover:bg-[#5c365f]'
              )}
            >
              <Hash size={15} />
              {channel.slug}
            </button>
          ))}
        </div>
      </aside>

      <section
        className={cn(
          'min-w-0 flex-col border-x border-border bg-white',
          selectedThreadRoot ? 'hidden lg:flex' : 'flex'
        )}
      >
        <div className="border-b border-border px-4 py-3 lg:hidden">
          <div className="flex items-center gap-2 overflow-x-auto">
            {channels.map((channel) => (
              <button
                key={channel.id}
                onClick={() => {
                  setSelectedChannelId(channel.id)
                  setSelectedThreadId(null)
                }}
                className={cn(
                  'whitespace-nowrap rounded-full border px-3 py-1.5 text-sm',
                  selectedChannelId === channel.id
                    ? 'border-[#1264a3] bg-[#e8f2fb] text-[#1264a3]'
                    : 'border-border bg-card text-muted-foreground'
                )}
              >
                #{channel.slug}
              </button>
            ))}
            <button
              onClick={() => setShowChannelComposer((current) => !current)}
              className="rounded-full border border-border bg-card px-3 py-1.5 text-sm text-muted-foreground"
            >
              <Plus size={14} className="inline-block" />
            </button>
          </div>

          {showChannelComposer ? (
            <div className="mt-3 flex gap-2">
              <input
                value={channelDraft}
                onChange={(event) => setChannelDraft(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') {
                    event.preventDefault()
                    void createChannel()
                  }
                }}
                placeholder="channel-name"
                className="flex-1 rounded-xl border border-border bg-card px-3 py-2 text-sm text-foreground outline-none"
              />
              <Button
                size="sm"
                disabled={!channelDraft.trim() || creatingChannel}
                onClick={() => void createChannel()}
              >
                Create
              </Button>
            </div>
          ) : null}
        </div>

        <div className="border-b border-border px-5 py-4 sm:px-7">
          <div className="flex items-center gap-2">
            <Hash size={18} className="text-muted-foreground" />
            <h1 className="text-lg font-semibold text-foreground">
              {selectedChannel?.slug ?? 'general'}
            </h1>
          </div>
        </div>

        <div ref={channelScrollRef} className="flex-1 overflow-y-auto">
          {loadingMessages ? (
            <div className="px-5 py-6 text-sm text-muted-foreground sm:px-7">
              Loading messages...
            </div>
          ) : rootMessages.length === 0 ? (
            <div className="px-5 py-12 text-sm text-muted-foreground sm:px-7">
              Start the conversation in #{selectedChannel?.slug ?? 'general'}.
            </div>
          ) : (
            rootMessages.map((message) => (
              <MessageRow
                key={message.id}
                message={message}
                replies={repliesByThread[message.id] ?? []}
                onOpenThread={() => setSelectedThreadId(message.id)}
              />
            ))
          )}
        </div>

        <div className="border-t border-border bg-white px-4 py-4 sm:px-6">
          <div className="rounded-xl border border-border bg-card p-3">
            <Textarea
              value={messageDraft}
              onChange={(event) => setMessageDraft(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' && !event.shiftKey) {
                  event.preventDefault()
                  void sendMessage({ message: messageDraft })
                }
              }}
              placeholder={`Message #${selectedChannel?.slug ?? 'general'}`}
              rows={1}
              className="min-h-0 resize-none border-0 bg-transparent px-1 py-1 text-base shadow-none focus-visible:ring-0 focus-visible:ring-offset-0"
            />

            <div className="mt-3 flex items-center justify-end border-t border-border pt-3">
              <Button
                size="icon"
                className="h-10 w-10 rounded-xl"
                disabled={
                  !messageDraft.trim() || sendingMain || !selectedChannelId
                }
                onClick={() => void sendMessage({ message: messageDraft })}
                aria-label="Send message"
              >
                <Send size={16} />
              </Button>
            </div>
          </div>

          {error ? (
            <p className="mt-2 text-sm text-[hsl(var(--destructive))]">
              {error}
            </p>
          ) : null}
        </div>
      </section>

      <aside
        className={cn(
          'min-w-0 flex-col bg-[#fbfbfb]',
          selectedThreadRoot ? 'flex' : 'hidden lg:flex'
        )}
      >
        {selectedThreadRoot ? (
          <>
            <div className="flex items-center justify-between border-b border-border px-5 py-4">
              <div>
                <p className="text-sm font-semibold text-foreground">Thread</p>
                <p className="text-xs text-muted-foreground">
                  #{selectedChannel?.slug ?? 'general'}
                </p>
              </div>
              <button
                onClick={() => setSelectedThreadId(null)}
                className="rounded-md p-1 text-muted-foreground hover:bg-secondary hover:text-foreground"
                aria-label="Close thread"
              >
                <X size={16} />
              </button>
            </div>

            <div ref={threadScrollRef} className="flex-1 overflow-y-auto">
              <div className="border-b border-border px-5 py-4">
                <div className="flex items-start gap-3">
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-[#ede7f6] text-xs font-semibold text-[#4a154b]">
                    {selectedThreadRoot.role === 'assistant'
                      ? 'K'
                      : initials(selectedThreadRoot.userName ?? 'You')}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-baseline gap-2">
                      <p className="text-sm font-semibold text-foreground">
                        {selectedThreadRoot.role === 'assistant'
                          ? 'Kodi'
                          : (selectedThreadRoot.userName ?? 'You')}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {formatTimestamp(selectedThreadRoot.createdAt)}
                      </p>
                    </div>
                    <div className="mt-1 text-sm leading-7 text-foreground">
                      <MessageBody content={selectedThreadRoot.content} />
                    </div>
                  </div>
                </div>
              </div>

              {selectedThreadReplies.map((message) => (
                <div
                  key={message.id}
                  className="border-b border-border px-5 py-4"
                >
                  <div className="flex items-start gap-3">
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-[#ede7f6] text-xs font-semibold text-[#4a154b]">
                      {message.role === 'assistant'
                        ? 'K'
                        : initials(message.userName ?? 'You')}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-baseline gap-2">
                        <p className="text-sm font-semibold text-foreground">
                          {message.role === 'assistant'
                            ? 'Kodi'
                            : (message.userName ?? 'You')}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {formatTimestamp(message.createdAt)}
                        </p>
                      </div>
                      <div className="mt-1 text-sm leading-7 text-foreground">
                        <MessageBody content={message.content} />
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            <div className="border-t border-border bg-white px-4 py-4">
              <div className="rounded-xl border border-border bg-card p-3">
                <Textarea
                  value={threadDraft}
                  onChange={(event) => setThreadDraft(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' && !event.shiftKey) {
                      event.preventDefault()
                      void sendMessage({
                        message: threadDraft,
                        threadRootMessageId: selectedThreadRoot.id,
                      })
                    }
                  }}
                  placeholder="Reply in thread"
                  rows={1}
                  className="min-h-0 resize-none border-0 bg-transparent px-1 py-1 text-base shadow-none focus-visible:ring-0 focus-visible:ring-offset-0"
                />

                <div className="mt-3 flex items-center justify-end border-t border-border pt-3">
                  <Button
                    size="icon"
                    className="h-10 w-10 rounded-xl"
                    disabled={!threadDraft.trim() || sendingThread}
                    onClick={() =>
                      void sendMessage({
                        message: threadDraft,
                        threadRootMessageId: selectedThreadRoot.id,
                      })
                    }
                    aria-label="Send thread reply"
                  >
                    <Send size={16} />
                  </Button>
                </div>
              </div>
            </div>
          </>
        ) : (
          <div className="flex h-full items-center justify-center px-8 text-center text-sm text-muted-foreground">
            Select a message to open its thread.
          </div>
        )}
      </aside>
    </div>
  )
}
