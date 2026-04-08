'use client'

import { useEffect, useRef, useState } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { ChevronLeft, CornerUpRight, Hash, Plus, Send } from 'lucide-react'
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
            className="text-[#1264a3] underline underline-offset-2"
          >
            {children}
          </a>
        ),
        code: ({ children }) => (
          <code className="rounded bg-[#f1f1f1] px-1.5 py-0.5 text-xs">
            {children}
          </code>
        ),
        pre: ({ children }) => (
          <pre className="overflow-x-auto rounded-lg bg-[#f1f1f1] p-3 text-xs">
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
          ? 'bg-[#e9d9f3] text-[#4a154b]'
          : 'bg-[#dfe7f2] text-[#28436b]'
      )}
    >
      {message.role === 'assistant' ? 'K' : initials(message.userName ?? 'You')}
    </div>
  )
}

function MobileChannelTabs({
  channels,
  selectedChannelId,
  onSelect,
}: {
  channels: Channel[]
  selectedChannelId: string | null
  onSelect: (channelId: string) => void
}) {
  return (
    <div className="border-b border-[#dddddd] px-4 py-3 lg:hidden">
      <div className="flex items-center gap-2 overflow-x-auto">
        {channels.map((channel) => (
          <button
            key={channel.id}
            type="button"
            onClick={() => onSelect(channel.id)}
            className={cn(
              'whitespace-nowrap rounded-full border px-3 py-1.5 text-sm',
              selectedChannelId === channel.id
                ? 'border-[#1264a3] bg-[#edf5fb] text-[#1264a3]'
                : 'border-[#dddddd] bg-white text-[#616061]'
            )}
          >
            #{channel.slug}
          </button>
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
    <div className="px-4 py-3 hover:bg-[#f8f8f8] sm:px-6">
      <button
        type="button"
        onClick={onOpenThread}
        className="flex w-full items-start gap-3 text-left"
      >
        <SlackAvatar message={message} />

        <div className="min-w-0 flex-1">
          <div className="flex items-baseline gap-2">
            <p className="text-[15px] font-semibold text-[#1d1c1d]">
              {message.role === 'assistant'
                ? 'Kodi'
                : (message.userName ?? 'You')}
            </p>
            <p className="text-xs text-[#616061]">
              {formatTime(message.createdAt)}
            </p>
          </div>

          <div className="mt-0.5 text-[15px] leading-7 text-[#1d1c1d]">
            <MessageBody content={message.content} />
          </div>
        </div>
      </button>

      <div className="pl-12">
        <button
          type="button"
          onClick={onOpenThread}
          className="mt-2 inline-flex items-center gap-2 rounded-md px-2 py-1 text-sm font-medium text-[#1264a3] hover:bg-[#edf5fb]"
        >
          <CornerUpRight size={14} />
          {replies.length > 0
            ? `${replies.length} repl${replies.length === 1 ? 'y' : 'ies'}`
            : 'Reply in thread'}
          {replies.length > 0 ? (
            <span className="text-[#616061]">
              Last reply {formatDate(replies[replies.length - 1]!.createdAt)}
            </span>
          ) : null}
        </button>

        {isResponding ? (
          <p className="mt-1 text-sm text-[#616061]">Kodi is responding...</p>
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
    <div className="sticky bottom-0 z-10 border-t border-[#dddddd] bg-white px-4 py-4 sm:px-6">
      <div className="rounded-xl border border-[#d8d8d8] bg-white p-3 shadow-[0_1px_0_rgba(0,0,0,0.02)]">
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

        <div className="mt-3 flex items-center justify-between border-t border-[#ececec] pt-3">
          <button
            type="button"
            className="inline-flex h-9 w-9 items-center justify-center rounded-md text-[#616061] transition-colors hover:bg-[#f3f3f3] hover:text-[#1d1c1d]"
            aria-label="Add item"
          >
            <Plus size={16} />
          </button>

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
  const [selectedThreadId, setSelectedThreadId] = useState<string | null>(
    initialThreadId ?? null
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

  function buildChatUrl(channelId: string | null, threadId?: string | null) {
    const params = new URLSearchParams()
    if (channelId) {
      params.set('channel', channelId)
    }
    if (threadId) {
      params.set('thread', threadId)
    }

    const query = params.toString()
    return query ? `${pathname}?${query}` : pathname
  }

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

        setSelectedChannelId(initial?.id ?? null)
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
  const selectedChannel =
    channels.find((channel) => channel.id === selectedChannelId) ?? null

  useEffect(() => {
    if (!selectedThreadId) return

    const exists = rootMessages.some(
      (message) => message.id === selectedThreadId
    )
    if (!exists && !loadingMessages) {
      setSelectedThreadId(null)
      router.replace(buildChatUrl(selectedChannelId))
    }
  }, [
    buildChatUrl,
    loadingMessages,
    rootMessages,
    router,
    selectedChannelId,
    selectedThreadId,
  ])

  useEffect(() => {
    if (!channelScrollRef.current || selectedThreadId) return
    channelScrollRef.current.scrollTo({
      top: channelScrollRef.current.scrollHeight,
      behavior: 'smooth',
    })
  }, [messages, selectedThreadId, sendingMain])

  useEffect(() => {
    if (!threadScrollRef.current || !selectedThreadId) return
    threadScrollRef.current.scrollTo({
      top: threadScrollRef.current.scrollHeight,
      behavior: 'smooth',
    })
  }, [selectedThreadId, selectedThreadReplies, sendingThread])

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
      setSelectedChannelId(created.id)
      setSelectedThreadId(null)
      setMessages([])
      setChannelDraft('')
      setShowChannelComposer(false)
      router.replace(buildChatUrl(created.id))
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
          buildChatUrl(selectedChannelId, result.threadRootMessageId)
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
      !selectedChannelId ||
      loadingChannels ||
      promptHandled
    ) {
      return
    }

    setPromptHandled(true)
    void sendMessage({ message: initialPrompt })
  }, [initialPrompt, loadingChannels, promptHandled, selectedChannelId])

  function selectChannel(channelId: string) {
    setSelectedChannelId(channelId)
    setSelectedThreadId(null)
    setError(null)
    router.replace(buildChatUrl(channelId))
  }

  function openThread(threadId: string) {
    setSelectedThreadId(threadId)
    router.replace(buildChatUrl(selectedChannelId, threadId))
  }

  function closeThread() {
    setSelectedThreadId(null)
    router.replace(buildChatUrl(selectedChannelId))
  }

  return (
    <div className="grid h-[calc(100vh-2rem)] grid-cols-1 overflow-hidden rounded-[1.2rem] border border-[#d8d8d8] bg-white lg:grid-cols-[280px_minmax(0,1fr)]">
      <aside className="hidden min-h-0 flex-col bg-[#4a154b] text-white lg:flex">
        <div className="border-b border-white/12 px-4 py-4">
          <div className="rounded-lg bg-white/10 px-3 py-2.5">
            <p className="truncate text-sm font-semibold">
              {selectedChannel?.name ?? session?.user?.name ?? 'Workspace'}
            </p>
            <p className="mt-1 text-xs text-white/72">
              {session?.user?.email ?? 'Kodi workspace'}
            </p>
          </div>
        </div>

        <div className="flex items-center justify-between px-4 py-3">
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-white/68">
            Channels
          </p>
          <button
            type="button"
            onClick={() => setShowChannelComposer((current) => !current)}
            className="rounded-md p-1 text-white/72 transition-colors hover:bg-white/10 hover:text-white"
            aria-label="Create channel"
          >
            <Plus size={16} />
          </button>
        </div>

        {showChannelComposer ? (
          <div className="px-4 pb-3">
            <div className="space-y-2 rounded-lg bg-white/10 p-3">
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
                className="w-full rounded-md border border-white/14 bg-white/12 px-3 py-2 text-sm text-white outline-none placeholder:text-white/58"
              />
              <div className="flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setShowChannelComposer(false)
                    setChannelDraft('')
                  }}
                  className="text-sm text-white/68 hover:text-white"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => void createChannel()}
                  disabled={!channelDraft.trim() || creatingChannel}
                  className="rounded-md bg-white px-3 py-1.5 text-sm font-medium text-[#4a154b] disabled:opacity-60"
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
              type="button"
              onClick={() => selectChannel(channel.id)}
              className={cn(
                'flex w-full items-center gap-2 rounded-md px-3 py-1.5 text-sm transition-colors',
                selectedChannelId === channel.id
                  ? 'bg-[#1164a3] text-white'
                  : 'text-white/86 hover:bg-white/10'
              )}
            >
              <Hash size={15} />
              <span className="truncate">{channel.slug}</span>
            </button>
          ))}
        </div>
      </aside>

      <section className="min-h-0 min-w-0 bg-white">
        {!selectedThreadId ? (
          <div className="flex h-full min-h-0 flex-col bg-white">
            <MobileChannelTabs
              channels={channels}
              selectedChannelId={selectedChannelId}
              onSelect={selectChannel}
            />

            <div className="border-b border-[#dddddd] px-4 py-3 sm:px-6">
              <div className="flex items-center gap-2">
                <Hash size={18} className="text-[#616061]" />
                <h1 className="text-[18px] font-semibold text-[#1d1c1d]">
                  {selectedChannel?.slug ?? 'general'}
                </h1>
              </div>
              <p className="mt-1 text-sm text-[#616061]">
                Conversation and follow-through for this channel.
              </p>
            </div>

            <div
              ref={channelScrollRef}
              className="min-h-0 flex-1 overflow-y-auto"
            >
              {loadingMessages ? (
                <div className="px-4 py-6 text-sm text-[#616061] sm:px-6">
                  Loading messages...
                </div>
              ) : rootMessages.length === 0 ? (
                <div className="px-4 py-12 text-sm text-[#616061] sm:px-6">
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
              <p className="px-4 pb-4 text-sm text-[hsl(var(--destructive))] sm:px-6">
                {error}
              </p>
            ) : null}
          </div>
        ) : (
          <div className="flex h-full min-h-0 flex-col bg-[#fbfbfb]">
            <MobileChannelTabs
              channels={channels}
              selectedChannelId={selectedChannelId}
              onSelect={selectChannel}
            />

            <div className="flex items-center gap-3 border-b border-[#dddddd] px-4 py-3 sm:px-6">
              <button
                type="button"
                onClick={closeThread}
                className="rounded-md p-1 text-[#616061] transition-colors hover:bg-[#ededed] hover:text-[#1d1c1d]"
                aria-label="Back to channel"
              >
                <ChevronLeft size={18} />
              </button>

              <div>
                <p className="text-sm font-semibold text-[#1d1c1d]">Thread</p>
                <p className="text-xs text-[#616061]">
                  #{selectedChannel?.slug ?? 'general'}
                </p>
              </div>
            </div>

            <div
              ref={threadScrollRef}
              className="min-h-0 flex-1 overflow-y-auto"
            >
              {loadingMessages ? (
                <div className="px-4 py-6 text-sm text-[#616061] sm:px-6">
                  Loading thread...
                </div>
              ) : selectedThreadRoot ? (
                <>
                  <div className="border-b border-[#e6e6e6] px-4 py-4 sm:px-6">
                    <div className="flex items-start gap-3">
                      <SlackAvatar message={selectedThreadRoot} />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-baseline gap-2">
                          <p className="text-[15px] font-semibold text-[#1d1c1d]">
                            {selectedThreadRoot.role === 'assistant'
                              ? 'Kodi'
                              : (selectedThreadRoot.userName ?? 'You')}
                          </p>
                          <p className="text-xs text-[#616061]">
                            {formatTime(selectedThreadRoot.createdAt)}
                          </p>
                        </div>
                        <div className="mt-0.5 text-[15px] leading-7 text-[#1d1c1d]">
                          <MessageBody content={selectedThreadRoot.content} />
                        </div>
                      </div>
                    </div>
                  </div>

                  {selectedThreadReplies.length > 0 ? (
                    <div className="border-b border-[#e6e6e6] px-4 py-3 text-xs font-medium uppercase tracking-[0.08em] text-[#616061] sm:px-6">
                      {selectedThreadReplies.length} repl
                      {selectedThreadReplies.length === 1 ? 'y' : 'ies'}
                    </div>
                  ) : null}

                  {selectedThreadReplies.map((message) => (
                    <div
                      key={message.id}
                      className="border-b border-[#e6e6e6] px-4 py-4 sm:px-6"
                    >
                      <div className="flex items-start gap-3">
                        <SlackAvatar message={message} />
                        <div className="min-w-0 flex-1">
                          <div className="flex items-baseline gap-2">
                            <p className="text-[15px] font-semibold text-[#1d1c1d]">
                              {message.role === 'assistant'
                                ? 'Kodi'
                                : (message.userName ?? 'You')}
                            </p>
                            <p className="text-xs text-[#616061]">
                              {formatTime(message.createdAt)}
                            </p>
                          </div>
                          <div className="mt-0.5 text-[15px] leading-7 text-[#1d1c1d]">
                            <MessageBody content={message.content} />
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}

                  {sendingThread ? (
                    <div className="px-4 py-4 text-sm text-[#616061] sm:px-6">
                      Kodi is responding...
                    </div>
                  ) : null}
                </>
              ) : (
                <div className="px-4 py-12 text-sm text-[#616061] sm:px-6">
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
              <p className="px-4 pb-4 text-sm text-[hsl(var(--destructive))] sm:px-6">
                {error}
              </p>
            ) : null}
          </div>
        )}
      </section>
    </div>
  )
}
