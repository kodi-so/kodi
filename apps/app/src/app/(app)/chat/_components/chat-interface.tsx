'use client'

import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { ChevronLeft, CornerUpRight, Hash, Plus, Send } from 'lucide-react'
import { Button, Textarea, cn } from '@kodi/ui'
import { trpc } from '@/lib/trpc'
import { useSession } from '@/lib/auth-client'
import { DashboardAssistant } from '../../dashboard/_components/dashboard-assistant'

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

const KODI_DM_ID = 'kodi'

function makeTempId(prefix: string) {
  return `temp-${prefix}-${crypto.randomUUID()}`
}

function formatTime(value: string | Date) {
  return new Date(value).toLocaleTimeString([], {
    hour: 'numeric',
    minute: '2-digit',
  })
}

function formatDate(value: string | Date) {
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
          <code className="rounded bg-brand-muted px-1.5 py-0.5 text-xs text-foreground">
            {children}
          </code>
        ),
        pre: ({ children }) => (
          <pre className="overflow-x-auto rounded-lg bg-brand-muted p-3 text-xs text-foreground">
            {children}
          </pre>
        ),
      }}
    >
      {content}
    </ReactMarkdown>
  )
}

function SlackAvatar({ message }: { message: Message }) {
  return (
    <div
      className={cn(
        'flex h-9 w-9 shrink-0 items-center justify-center rounded-md text-xs font-semibold',
        message.role === 'assistant'
          ? 'bg-accent text-foreground'
          : 'bg-brand-info-soft text-brand-info'
      )}
    >
      {message.role === 'assistant' ? 'K' : initials(message.userName ?? 'You')}
    </div>
  )
}

function MobileConversationTabs({
  channels,
  selectedDirectId,
  selectedChannelId,
  onSelectDirect,
  onSelectChannel,
}: {
  channels: Channel[]
  selectedDirectId: string | null
  selectedChannelId: string | null
  onSelectDirect: (directId: string) => void
  onSelectChannel: (channelId: string) => void
}) {
  return (
    <div className="border-b border-border bg-background/95 px-4 py-3 backdrop-blur lg:hidden">
      <div className="flex items-center gap-2 overflow-x-auto">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => onSelectDirect(KODI_DM_ID)}
          className={cn(
            'inline-flex items-center gap-2 whitespace-nowrap rounded-full border px-3 py-1.5 text-sm',
            selectedDirectId === KODI_DM_ID
              ? 'border-primary/25 bg-accent text-foreground'
              : 'border-border bg-card text-muted-foreground'
          )}
        >
          <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-accent text-[11px] font-semibold text-foreground">
            K
          </span>
          Kodi
        </Button>

        {channels.map((channel) => (
          <Button
            key={channel.id}
            variant="ghost"
            size="sm"
            onClick={() => onSelectChannel(channel.id)}
            className={cn(
              'whitespace-nowrap rounded-full border px-3 py-1.5 text-sm',
              selectedChannelId === channel.id && !selectedDirectId
                ? 'border-brand-info/25 bg-brand-info-soft text-brand-info'
                : 'border-border bg-card text-muted-foreground'
            )}
          >
            #{channel.slug}
          </Button>
        ))}
      </div>
    </div>
  )
}

function MessageRow({
  message,
  replies,
  isResponding,
  onOpenThread,
}: {
  message: Message
  replies: Message[]
  isResponding: boolean
  onOpenThread: () => void
}) {
  return (
    <div className="px-4 py-3 transition-colors hover:bg-brand-muted/50 sm:px-6">
      <button
        type="button"
        onClick={onOpenThread}
        className="flex w-full items-start gap-3 text-left"
      >
        <SlackAvatar message={message} />

        <div className="min-w-0 flex-1">
          <div className="flex items-baseline gap-2">
            <p className="text-[15px] font-semibold text-foreground">
              {message.role === 'assistant'
                ? 'Kodi'
                : (message.userName ?? 'You')}
            </p>
            <p className="text-xs text-muted-foreground">
              {formatTime(message.createdAt)}
            </p>
          </div>

          <div className="mt-0.5 text-[15px] leading-7 text-foreground">
            <MessageBody content={message.content} />
          </div>
        </div>
      </button>

      <div className="pl-12">
        <Button
          variant="ghost"
          size="sm"
          onClick={onOpenThread}
          className="mt-2 inline-flex items-center gap-2 rounded-md px-2 py-1 text-sm font-medium text-brand-info transition-colors hover:bg-brand-info-soft"
        >
          <CornerUpRight size={14} />
          {replies.length > 0
            ? `${replies.length} repl${replies.length === 1 ? 'y' : 'ies'}`
            : 'Reply in thread'}
          {replies.length > 0 ? (
            <span className="text-muted-foreground">
              Last reply {formatDate(replies[replies.length - 1]!.createdAt)}
            </span>
          ) : null}
        </Button>

        {isResponding ? (
          <p className="mt-1 text-sm text-muted-foreground">Kodi is responding...</p>
        ) : null}
      </div>
    </div>
  )
}

function Composer({
  value,
  onChange,
  onSubmit,
  placeholder,
  disabled,
  ariaLabel,
}: {
  value: string
  onChange: (value: string) => void
  onSubmit: () => void
  placeholder: string
  disabled: boolean
  ariaLabel: string
}) {
  return (
    <div className="sticky bottom-0 z-10 border-t border-border bg-background/95 px-4 py-4 backdrop-blur sm:px-6">
      <div className="rounded-xl border border-border bg-card p-3 shadow-sm">
        <Textarea
          value={value}
          onChange={(event) => onChange(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && !event.shiftKey) {
              event.preventDefault()
              onSubmit()
            }
          }}
          placeholder={placeholder}
          rows={1}
          className="min-h-0 resize-none border-0 bg-transparent px-0 py-0 text-[15px] shadow-none focus-visible:ring-0 focus-visible:ring-offset-0"
        />

        <div className="mt-3 flex items-center justify-between border-t border-border pt-3">
          <Button
            variant="ghost"
            size="icon"
            className="h-9 w-9 rounded-md text-muted-foreground hover:bg-secondary hover:text-foreground"
            aria-label="Add item"
          >
            <Plus size={16} />
          </Button>

          <Button
            size="icon"
            className="h-9 w-9 rounded-md"
            disabled={disabled}
            onClick={onSubmit}
            aria-label={ariaLabel}
          >
            <Send size={15} />
          </Button>
        </div>
      </div>
    </div>
  )
}

export function ChatInterface({
  orgId,
  orgName,
  initialPrompt,
  initialDirectId,
  initialChannelId,
  initialThreadId,
}: {
  orgId: string
  orgName: string
  initialPrompt?: string | null
  initialDirectId?: string | null
  initialChannelId?: string | null
  initialThreadId?: string | null
}) {
  const router = useRouter()
  const pathname = usePathname()
  const { data: session } = useSession()
  const [channels, setChannels] = useState<Channel[]>([])
  const [selectedDirectId, setSelectedDirectId] = useState<string | null>(
    initialDirectId === KODI_DM_ID || (!initialChannelId && !initialPrompt)
      ? KODI_DM_ID
      : null
  )
  const [selectedChannelId, setSelectedChannelId] = useState<string | null>(
    initialChannelId ?? null
  )
  const [messages, setMessages] = useState<Message[]>([])
  const [selectedThreadId, setSelectedThreadId] = useState<string | null>(
    initialDirectId === KODI_DM_ID ? null : (initialThreadId ?? null)
  )
  const [showChannelComposer, setShowChannelComposer] = useState(false)
  const [channelDraft, setChannelDraft] = useState('')
  const [messageDraft, setMessageDraft] = useState('')
  const [threadDraft, setThreadDraft] = useState('')
  const [loadingChannels, setLoadingChannels] = useState(true)
  const [loadingMessages, setLoadingMessages] = useState(false)
  const [creatingChannel, setCreatingChannel] = useState(false)
  const [sendingMain, setSendingMain] = useState(false)
  const [sendingThread, setSendingThread] = useState(false)
  const [respondingRootIds, setRespondingRootIds] = useState<string[]>([])
  const [error, setError] = useState<string | null>(null)
  const [promptHandled, setPromptHandled] = useState(false)
  const channelScrollRef = useRef<HTMLDivElement>(null)
  const threadScrollRef = useRef<HTMLDivElement>(null)
  const channelHasInitialScrollRef = useRef(false)
  const threadHasInitialScrollRef = useRef(false)

  function buildChatUrl(options: {
    channelId?: string | null
    directId?: string | null
    threadId?: string | null
  }) {
    const params = new URLSearchParams()
    if (options.directId) {
      params.set('dm', options.directId)
    } else if (options.channelId) {
      params.set('channel', options.channelId)
    }
    if (options.threadId) {
      params.set('thread', options.threadId)
    }

    const query = params.toString()
    return query ? `${pathname}?${query}` : pathname
  }

  useEffect(() => {
    const shouldShowDirect =
      initialDirectId === KODI_DM_ID || (!initialChannelId && !initialPrompt)

    setSelectedDirectId(shouldShowDirect ? KODI_DM_ID : null)
    setSelectedThreadId(shouldShowDirect ? null : (initialThreadId ?? null))

    if (initialChannelId) {
      setSelectedChannelId(initialChannelId)
    }
  }, [initialChannelId, initialDirectId, initialPrompt, initialThreadId])

  useEffect(() => {
    let cancelled = false
    setLoadingChannels(true)

    async function loadChannels() {
      try {
        const rows = await trpc.chat.listChannels.query({ orgId })
        if (cancelled) return

        const nextChannels = rows as Channel[]
        setChannels(nextChannels)

        const initial =
          nextChannels.find((channel) => channel.id === initialChannelId) ??
          nextChannels[0] ??
          null

        setSelectedChannelId((current) => current ?? initial?.id ?? null)
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
    if (selectedDirectId) {
      setMessages([])
      return
    }

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
  }, [orgId, selectedChannelId, selectedDirectId])

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
  const selectedChannel =
    channels.find((channel) => channel.id === selectedChannelId) ?? null

  useEffect(() => {
    channelHasInitialScrollRef.current = false
  }, [selectedChannelId, selectedDirectId, selectedThreadId])

  useEffect(() => {
    threadHasInitialScrollRef.current = false
  }, [selectedDirectId, selectedThreadId])

  useEffect(() => {
    if (selectedDirectId || !selectedThreadId) return

    const exists = rootMessages.some(
      (message) => message.id === selectedThreadId
    )
    if (!exists && !loadingMessages) {
      setSelectedThreadId(null)
      router.replace(buildChatUrl({ channelId: selectedChannelId }))
    }
  }, [
    buildChatUrl,
    loadingMessages,
    rootMessages,
    router,
    selectedChannelId,
    selectedDirectId,
    selectedThreadId,
  ])

  useLayoutEffect(() => {
    if (!channelScrollRef.current || selectedThreadId || selectedDirectId)
      return

    if (loadingMessages) return

    channelScrollRef.current.scrollTo({
      top: channelScrollRef.current.scrollHeight,
      behavior: channelHasInitialScrollRef.current ? 'smooth' : 'auto',
    })
    channelHasInitialScrollRef.current = true
  }, [
    loadingMessages,
    rootMessages.length,
    selectedDirectId,
    selectedThreadId,
    sendingMain,
  ])

  useLayoutEffect(() => {
    if (!threadScrollRef.current || !selectedThreadId || selectedDirectId) {
      return
    }

    if (loadingMessages) return

    threadScrollRef.current.scrollTo({
      top: threadScrollRef.current.scrollHeight,
      behavior: threadHasInitialScrollRef.current ? 'smooth' : 'auto',
    })
    threadHasInitialScrollRef.current = true
  }, [
    loadingMessages,
    selectedDirectId,
    selectedThreadId,
    selectedThreadReplies.length,
    sendingThread,
  ])

  async function createChannel() {
    const name = channelDraft.trim()
    if (!name || creatingChannel) return

    setCreatingChannel(true)
    setError(null)

    try {
      const created = (await trpc.chat.createChannel.mutate({
        orgId,
        name,
      })) as Channel

      setChannels((current) => [...current, created])
      setSelectedDirectId(null)
      setSelectedChannelId(created.id)
      setSelectedThreadId(null)
      setMessages([])
      setChannelDraft('')
      setShowChannelComposer(false)
      router.replace(buildChatUrl({ channelId: created.id }))
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

    const isThreadReply = Boolean(options.threadRootMessageId)
    const optimisticMessageId = makeTempId('message')
    const optimisticMessage: Message = {
      id: optimisticMessageId,
      orgId,
      channelId: selectedChannelId,
      threadRootMessageId: options.threadRootMessageId ?? null,
      userId: session?.user?.id ?? null,
      role: 'user',
      content,
      status: 'sending',
      createdAt: new Date(),
      userName: session?.user?.name ?? 'You',
      userImage: session?.user?.image ?? null,
    }

    setError(null)

    if (isThreadReply) {
      setSendingThread(true)
      setThreadDraft('')
      setMessages((current) => [...current, optimisticMessage])
    } else {
      setSendingMain(true)
      setMessageDraft('')
      setMessages((current) => [...current, optimisticMessage])
      setRespondingRootIds((current) => [...current, optimisticMessageId])
    }

    try {
      const result = (await trpc.chat.sendMessage.mutate({
        orgId,
        channelId: selectedChannelId,
        message: content,
        threadRootMessageId: options.threadRootMessageId,
      })) as {
        userMessage: Message
        assistantMessage: Message
        threadRootMessageId: string
      }

      setMessages((current) => {
        const next: Message[] = []
        let replaced = false

        for (const message of current) {
          if (message.id === optimisticMessageId) {
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

      if (selectedThreadId === optimisticMessageId) {
        setSelectedThreadId(result.threadRootMessageId)
        router.replace(
          buildChatUrl({
            channelId: selectedChannelId,
            threadId: result.threadRootMessageId,
          })
        )
      }
    } catch (sendError) {
      setMessages((current) =>
        current.filter((message) => message.id !== optimisticMessageId)
      )
      setError(
        sendError instanceof Error
          ? sendError.message
          : 'Failed to send message.'
      )

      if (isThreadReply) {
        setThreadDraft(content)
      } else {
        setMessageDraft(content)
      }
    } finally {
      if (isThreadReply) {
        setSendingThread(false)
      } else {
        setSendingMain(false)
        setRespondingRootIds((current) =>
          current.filter((id) => id !== optimisticMessageId)
        )
      }
    }
  }

  useEffect(() => {
    if (
      !initialPrompt ||
      selectedDirectId ||
      !selectedChannelId ||
      loadingChannels ||
      promptHandled
    ) {
      return
    }

    setPromptHandled(true)
    void sendMessage({ message: initialPrompt })
  }, [
    initialPrompt,
    loadingChannels,
    promptHandled,
    selectedChannelId,
    selectedDirectId,
  ])

  function selectChannel(channelId: string) {
    setSelectedDirectId(null)
    setSelectedChannelId(channelId)
    setSelectedThreadId(null)
    setError(null)
    router.replace(buildChatUrl({ channelId }))
  }

  function selectDirect(directId: string) {
    setSelectedDirectId(directId)
    setSelectedThreadId(null)
    setError(null)
    router.replace(buildChatUrl({ directId }))
  }

  function openThread(threadId: string) {
    setSelectedThreadId(threadId)
    router.replace(buildChatUrl({ channelId: selectedChannelId, threadId }))
  }

  function closeThread() {
    setSelectedThreadId(null)
    router.replace(buildChatUrl({ channelId: selectedChannelId }))
  }

  return (
    <div className="grid h-[calc(100vh-2rem)] grid-cols-1 overflow-hidden rounded-lg border border-border bg-background shadow-sm lg:grid-cols-[280px_minmax(0,1fr)]">
      <aside className="bg-card hidden min-h-0 flex-col border-r border-border text-foreground lg:flex">
        <div className="border-b border-border px-4 py-4">
          <div className="rounded-lg border border-border bg-card px-3 py-2.5">
            <p className="truncate text-sm font-semibold">{orgName}</p>
            <p className="mt-1 text-xs text-muted-foreground">
              Private and shared conversations
            </p>
          </div>
        </div>

        <div className="px-4 pb-2 pt-3">
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
            Direct messages
          </p>
        </div>

        <div className="px-2 pb-3">
          <Button
            variant="ghost"
            onClick={() => selectDirect(KODI_DM_ID)}
            className={cn(
              'flex w-full items-center gap-3 rounded-md px-3 py-2 text-left text-sm transition-colors',
              selectedDirectId === KODI_DM_ID
                ? 'bg-accent text-foreground'
                : 'text-muted-foreground hover:bg-card hover:text-foreground'
            )}
          >
            <span className="inline-flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full bg-accent text-xs font-semibold text-foreground">
              K
            </span>
            <span className="min-w-0 flex-1 truncate">Kodi</span>
            <span className="text-[11px] uppercase tracking-[0.08em] text-muted-foreground">
              Private
            </span>
          </Button>
        </div>

        <div className="flex items-center justify-between px-4 py-3">
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
            Channels
          </p>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setShowChannelComposer((current) => !current)}
            className="h-7 w-7 rounded-md p-1 text-muted-foreground hover:bg-card hover:text-foreground"
            aria-label="Create channel"
          >
            <Plus size={16} />
          </Button>
        </div>

        {showChannelComposer ? (
          <div className="px-4 pb-3">
            <div className="space-y-2 rounded-xl border border-border bg-card p-3 shadow-sm">
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
                className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground outline-none placeholder:text-muted-foreground"
              />
              <div className="flex items-center justify-end gap-2">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setShowChannelComposer(false)
                    setChannelDraft('')
                  }}
                  className="text-sm text-muted-foreground hover:text-foreground"
                >
                  Cancel
                </Button>
                <Button
                  size="sm"
                  onClick={() => void createChannel()}
                  disabled={!channelDraft.trim() || creatingChannel}
                  className="rounded-md px-3 py-1.5 text-sm font-medium disabled:opacity-60"
                >
                  Create
                </Button>
              </div>
            </div>
          </div>
        ) : null}

        <div className="flex-1 overflow-y-auto px-2 pb-4">
          {channels.map((channel) => (
            <Button
              key={channel.id}
              variant="ghost"
              onClick={() => selectChannel(channel.id)}
              className={cn(
                'flex w-full items-center gap-2 rounded-md px-3 py-1.5 text-sm transition-colors',
                selectedChannelId === channel.id && !selectedDirectId
                  ? 'bg-brand-info-soft text-brand-info'
                  : 'text-muted-foreground hover:bg-card hover:text-foreground'
              )}
            >
              <Hash size={15} />
              <span className="truncate">{channel.slug}</span>
            </Button>
          ))}
        </div>
      </aside>

      <section className="min-h-0 min-w-0 bg-background">
        {selectedDirectId === KODI_DM_ID ? (
          <div className="flex h-full min-h-0 flex-col bg-background">
            <MobileConversationTabs
              channels={channels}
              selectedDirectId={selectedDirectId}
              selectedChannelId={selectedChannelId}
              onSelectDirect={selectDirect}
              onSelectChannel={selectChannel}
            />

            <div className="min-h-0 flex-1">
              <DashboardAssistant
                orgId={orgId}
                orgName={orgName}
                embedded
                initialThreadId={
                  initialDirectId === KODI_DM_ID ? initialThreadId : null
                }
                buildThreadUrl={(threadId) =>
                  buildChatUrl({ directId: KODI_DM_ID, threadId })
                }
              />
            </div>
          </div>
        ) : !selectedThreadId ? (
          <div className="flex h-full min-h-0 flex-col bg-background">
            <MobileConversationTabs
              channels={channels}
              selectedDirectId={selectedDirectId}
              selectedChannelId={selectedChannelId}
              onSelectDirect={selectDirect}
              onSelectChannel={selectChannel}
            />

            <div className="border-b border-border bg-background px-4 py-3 sm:px-6">
              <div className="flex items-center gap-2">
                <Hash size={18} className="text-muted-foreground" />
                <h1 className="text-[18px] font-semibold text-foreground">
                  {selectedChannel?.slug ?? 'general'}
                </h1>
              </div>
              <p className="mt-1 text-sm text-muted-foreground">
                Conversation and follow-through for this channel.
              </p>
            </div>

            <div
              ref={channelScrollRef}
              className="min-h-0 flex-1 overflow-y-auto overscroll-contain"
            >
              {loadingMessages ? (
                <div className="px-4 py-6 text-sm text-muted-foreground sm:px-6">
                  Loading messages...
                </div>
              ) : rootMessages.length === 0 ? (
                <div className="px-4 py-12 text-sm text-muted-foreground sm:px-6">
                  Start the conversation in #
                  {selectedChannel?.slug ?? 'general'}.
                </div>
              ) : (
                rootMessages.map((message) => (
                  <MessageRow
                    key={message.id}
                    message={message}
                    replies={repliesByThread[message.id] ?? []}
                    isResponding={respondingRootIds.includes(message.id)}
                    onOpenThread={() => openThread(message.id)}
                  />
                ))
              )}
            </div>

            <Composer
              value={messageDraft}
              onChange={setMessageDraft}
              onSubmit={() => void sendMessage({ message: messageDraft })}
              placeholder={`Message #${selectedChannel?.slug ?? 'general'}`}
              disabled={
                !messageDraft.trim() || sendingMain || !selectedChannelId
              }
              ariaLabel="Send message"
            />

            {error ? (
              <p className="px-4 pb-4 text-sm text-brand-danger sm:px-6">
                {error}
              </p>
            ) : null}
          </div>
        ) : (
          <div className="flex h-full min-h-0 flex-col bg-brand-muted/35">
            <MobileConversationTabs
              channels={channels}
              selectedDirectId={selectedDirectId}
              selectedChannelId={selectedChannelId}
              onSelectDirect={selectDirect}
              onSelectChannel={selectChannel}
            />

            <div className="flex items-center gap-3 border-b border-border bg-background px-4 py-3 sm:px-6">
              <Button
                variant="ghost"
                size="icon"
                onClick={closeThread}
                className="h-8 w-8 rounded-md p-1 text-muted-foreground hover:bg-secondary hover:text-foreground"
                aria-label="Back to channel"
              >
                <ChevronLeft size={18} />
              </Button>

              <div>
                <p className="text-sm font-semibold text-foreground">Thread</p>
                <p className="text-xs text-muted-foreground">
                  #{selectedChannel?.slug ?? 'general'}
                </p>
              </div>
            </div>

            <div
              ref={threadScrollRef}
              className="min-h-0 flex-1 overflow-y-auto overscroll-contain"
            >
              {loadingMessages ? (
                <div className="px-4 py-6 text-sm text-muted-foreground sm:px-6">
                  Loading thread...
                </div>
              ) : selectedThreadRoot ? (
                <>
                  <div className="border-b border-border bg-background px-4 py-4 sm:px-6">
                    <div className="flex items-start gap-3">
                      <SlackAvatar message={selectedThreadRoot} />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-baseline gap-2">
                          <p className="text-[15px] font-semibold text-foreground">
                            {selectedThreadRoot.role === 'assistant'
                              ? 'Kodi'
                              : (selectedThreadRoot.userName ?? 'You')}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {formatTime(selectedThreadRoot.createdAt)}
                          </p>
                        </div>
                        <div className="mt-0.5 text-[15px] leading-7 text-foreground">
                          <MessageBody content={selectedThreadRoot.content} />
                        </div>
                      </div>
                    </div>
                  </div>

                  {selectedThreadReplies.length > 0 ? (
                    <div className="border-b border-border bg-background px-4 py-3 text-xs font-medium uppercase tracking-[0.08em] text-muted-foreground sm:px-6">
                      {selectedThreadReplies.length} repl
                      {selectedThreadReplies.length === 1 ? 'y' : 'ies'}
                    </div>
                  ) : null}

                  {selectedThreadReplies.map((message) => (
                    <div
                      key={message.id}
                      className="border-b border-border/80 px-4 py-4 sm:px-6"
                    >
                      <div className="flex items-start gap-3">
                        <SlackAvatar message={message} />
                        <div className="min-w-0 flex-1">
                          <div className="flex items-baseline gap-2">
                            <p className="text-[15px] font-semibold text-foreground">
                              {message.role === 'assistant'
                                ? 'Kodi'
                                : (message.userName ?? 'You')}
                            </p>
                            <p className="text-xs text-muted-foreground">
                              {formatTime(message.createdAt)}
                            </p>
                          </div>
                          <div className="mt-0.5 text-[15px] leading-7 text-foreground">
                            <MessageBody content={message.content} />
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}

                  {sendingThread ? (
                    <div className="px-4 py-4 text-sm text-muted-foreground sm:px-6">
                      Kodi is responding...
                    </div>
                  ) : null}
                </>
              ) : (
                <div className="px-4 py-12 text-sm text-muted-foreground sm:px-6">
                  This thread is no longer available.
                </div>
              )}
            </div>

            <Composer
              value={threadDraft}
              onChange={setThreadDraft}
              onSubmit={() =>
                selectedThreadRoot
                  ? void sendMessage({
                      message: threadDraft,
                      threadRootMessageId: selectedThreadRoot.id,
                    })
                  : undefined
              }
              placeholder="Reply in thread"
              disabled={
                !threadDraft.trim() || sendingThread || !selectedThreadRoot
              }
              ariaLabel="Send thread reply"
            />

            {error ? (
              <p className="px-4 pb-4 text-sm text-brand-danger sm:px-6">
                {error}
              </p>
            ) : null}
          </div>
        )}
      </section>
    </div>
  )
}
