'use client'

import { useEffect, useRef, useState } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { Plus, Send } from 'lucide-react'
import { Button, Textarea, cn } from '@kodi/ui'
import { useSession } from '@/lib/auth-client'
import { trpc } from '@/lib/trpc'

type ConversationMessage = {
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

type DashboardAssistantProps = {
  orgId: string
  orgName: string
  embedded?: boolean
  initialThreadId?: string | null
  buildThreadUrl?: (threadId: string | null) => string
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

function MessageAvatar({
  role,
  name,
}: {
  role: 'user' | 'assistant'
  name?: string | null
}) {
  return (
    <div
      className={cn(
        'flex h-9 w-9 shrink-0 items-center justify-center rounded-md text-xs font-semibold',
        role === 'assistant'
          ? 'bg-brand-accent-soft text-brand-accent-foreground'
          : 'bg-brand-info-soft text-brand-info'
      )}
    >
      {role === 'assistant' ? 'K' : initials(name ?? 'You')}
    </div>
  )
}

export function DashboardAssistant(props: DashboardAssistantProps) {
  const { orgId, orgName, embedded = false } = props
  const { data: session } = useSession()
  const [messages, setMessages] = useState<ConversationMessage[]>([])
  const [draft, setDraft] = useState('')
  const [loadingConversation, setLoadingConversation] = useState(true)
  const [sending, setSending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const scrollRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    let cancelled = false
    setLoadingConversation(true)

    async function loadConversation() {
      try {
        const result = (await trpc.dashboardAssistant.getConversation.query({
          orgId,
        })) as {
          threadId: string | null
          messages: ConversationMessage[]
        }

        if (!cancelled) {
          setMessages(result.messages)
          setError(null)
        }
      } catch (loadError) {
        if (!cancelled) {
          setError(
            loadError instanceof Error
              ? loadError.message
              : 'Failed to load private conversation.'
          )
        }
      } finally {
        if (!cancelled) {
          setLoadingConversation(false)
        }
      }
    }

    void loadConversation()

    return () => {
      cancelled = true
    }
  }, [orgId])

  useEffect(() => {
    if (!scrollRef.current) return

    scrollRef.current.scrollTo({
      top: scrollRef.current.scrollHeight,
      behavior: 'smooth',
    })
  }, [messages, sending])

  async function sendMessage() {
    const content = draft.trim()
    if (!content || sending) return

    const optimisticUserId = makeTempId('message')
    const optimisticUserMessage: ConversationMessage = {
      id: optimisticUserId,
      orgId,
      threadId: 'kodi',
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
    setMessages((current) => [...current, optimisticUserMessage])

    try {
      const result =
        (await trpc.dashboardAssistant.sendConversationMessage.mutate({
          orgId,
          message: content,
        })) as {
          threadId: string
          userMessage: ConversationMessage
          assistantMessage: ConversationMessage
        }

      setMessages((current) => {
        const next: ConversationMessage[] = []
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
    } finally {
      setSending(false)
    }
  }

  const content = (
    <section className="flex h-full min-h-0 flex-col bg-background">
      <div className="border-b border-brand-line px-4 py-3 sm:px-6">
        <div className="flex items-center gap-3">
          <div className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-brand-accent-soft text-sm font-semibold text-brand-accent-foreground">
            K
          </div>
          <div className="min-w-0">
            <h1 className="truncate text-[18px] font-semibold text-foreground">
              Kodi
            </h1>
            <p className="mt-1 text-sm text-brand-quiet">
              Private direct message with your workspace agent.
            </p>
          </div>
        </div>
      </div>

      <div ref={scrollRef} className="flex-1 overflow-y-auto">
        {loadingConversation ? (
          <p className="px-4 py-6 text-sm text-brand-quiet sm:px-6">
            Loading conversation...
          </p>
        ) : messages.length === 0 ? (
          <div className="flex h-full min-h-[420px] items-center justify-center px-4 py-10 sm:px-6">
            <div className="max-w-2xl text-center">
              <div className="mx-auto inline-flex h-14 w-14 items-center justify-center rounded-2xl bg-brand-accent-soft text-lg font-semibold text-brand-accent-foreground">
                K
              </div>
              <p className="mt-4 text-sm text-brand-quiet">{orgName}</p>
              <h2 className="mt-3 text-4xl tracking-[-0.05em] text-foreground sm:text-5xl">
                Ask Kodi anything
              </h2>
              <p className="mx-auto mt-4 max-w-xl text-sm leading-6 text-brand-quiet">
                Use this direct message for private questions, analysis,
                follow-ups, and one-off requests grounded in your workspace
                context.
              </p>
            </div>
          </div>
        ) : (
          <div className="py-2">
            {messages.map((message) => (
              <div
                key={message.id}
                className="px-4 py-3 transition-colors hover:bg-brand-muted/50 sm:px-6"
              >
                <div className="flex items-start gap-3">
                  <MessageAvatar
                    role={message.role}
                    name={message.userName ?? session?.user?.name}
                  />

                  <div className="min-w-0 flex-1">
                    <div className="flex items-baseline gap-2">
                      <p className="text-[15px] font-semibold text-foreground">
                        {message.role === 'assistant'
                          ? 'Kodi'
                          : (message.userName ?? 'You')}
                      </p>
                      <p className="text-xs text-brand-quiet">
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

            {sending ? (
              <div className="px-4 py-3 sm:px-6">
                <div className="flex items-start gap-3">
                  <MessageAvatar role="assistant" />
                  <div className="pt-0.5 text-sm text-brand-quiet">
                    Kodi is responding...
                  </div>
                </div>
              </div>
            ) : null}
          </div>
        )}
      </div>

      <div className="sticky bottom-0 z-10 border-t border-brand-line bg-background/95 px-4 py-4 backdrop-blur sm:px-6">
        <div className="rounded-xl border border-brand-line bg-brand-elevated p-3 shadow-brand-panel">
          <Textarea
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && !event.shiftKey) {
                event.preventDefault()
                void sendMessage()
              }
            }}
            placeholder="Message Kodi"
            rows={1}
            className="min-h-0 resize-none border-0 bg-transparent px-0 py-0 text-[15px] shadow-none focus-visible:ring-0 focus-visible:ring-offset-0"
          />

          <div className="mt-3 flex items-center justify-between border-t border-brand-line pt-3">
            <button
              type="button"
              className="inline-flex h-9 w-9 items-center justify-center rounded-md text-brand-quiet transition-colors hover:bg-secondary hover:text-foreground"
              aria-label="Add item"
            >
              <Plus size={16} />
            </button>

            <Button
              size="icon"
              className="h-9 w-9 rounded-md"
              disabled={!draft.trim() || sending}
              onClick={() => void sendMessage()}
              aria-label="Send message"
            >
              <Send size={15} />
            </Button>
          </div>
        </div>

        {error ? (
          <p className="mt-2 text-sm text-brand-danger">{error}</p>
        ) : null}
      </div>
    </section>
  )

  if (embedded) {
    return content
  }

  return (
    <div className="h-[calc(100vh-2rem)] px-4 py-4 sm:px-6 lg:px-8">
      <div className="h-full overflow-hidden rounded-[1.2rem] border border-brand-line bg-background shadow-brand-panel">
        {content}
      </div>
    </div>
  )
}
