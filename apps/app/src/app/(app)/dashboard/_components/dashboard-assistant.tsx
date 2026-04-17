'use client'

import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { Send } from 'lucide-react'
import { Button, ScrollArea, Textarea, cn } from '@kodi/ui'
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
          ? 'bg-accent text-foreground'
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
  const bottomRef = useRef<HTMLDivElement>(null)
  const hasInitialScrollRef = useRef(false)

  useEffect(() => {
    hasInitialScrollRef.current = false
  }, [orgId])

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

  useLayoutEffect(() => {
    if (loadingConversation) return
    if (!bottomRef.current) return

    bottomRef.current.scrollIntoView({
      block: 'end',
      behavior: hasInitialScrollRef.current ? 'smooth' : 'auto',
    })
    hasInitialScrollRef.current = true
  }, [loadingConversation, messages.length, sending])

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
      <div className="shrink-0 border-b border-border bg-background px-4 py-3 sm:px-6">
        <div className="flex items-center gap-3">
          <div className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-accent text-[13px] font-semibold text-foreground">
            K
          </div>
          <div className="min-w-0">
            <h1 className="truncate text-[15px] font-semibold text-foreground">
              Kodi
            </h1>
            <p className="text-[11px] text-muted-foreground">
              Private direct message with your workspace agent
            </p>
          </div>
        </div>
      </div>

      <ScrollArea className="min-h-0 flex-1">
        {loadingConversation ? (
          <p className="px-4 py-6 text-sm text-muted-foreground sm:px-6">
            Loading conversation…
          </p>
        ) : messages.length === 0 ? (
          <div className="flex h-full min-h-[420px] items-center justify-center px-4 py-10 sm:px-6">
            <div className="max-w-xl text-center">
              <div className="mx-auto inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-accent text-base font-semibold text-foreground">
                K
              </div>
              <p className="mt-4 text-xs uppercase tracking-[0.14em] text-muted-foreground">
                {orgName}
              </p>
              <h2 className="mt-2 text-3xl tracking-[-0.03em] text-foreground sm:text-4xl">
                Ask Kodi anything
              </h2>
              <p className="mx-auto mt-3 max-w-md text-[13px] leading-6 text-muted-foreground">
                Private direct message for questions, analysis, and follow-ups
                grounded in your workspace context.
              </p>
            </div>
          </div>
        ) : (
          <div className="py-2">
            {messages.map((message) => (
              <div
                key={message.id}
                className="px-4 py-3 transition-colors hover:bg-brand-muted/40 sm:px-6"
              >
                <div className="flex items-start gap-3">
                  <MessageAvatar
                    role={message.role}
                    name={message.userName ?? session?.user?.name}
                  />

                  <div className="min-w-0 flex-1">
                    <div className="flex items-baseline gap-2">
                      <p className="text-[14px] font-semibold text-foreground">
                        {message.role === 'assistant'
                          ? 'Kodi'
                          : (message.userName ?? 'You')}
                      </p>
                      <p className="text-[11px] text-muted-foreground">
                        {formatTime(message.createdAt)}
                      </p>
                    </div>

                    <div className="mt-0.5 text-[14px] leading-6 text-foreground">
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
                  <div className="pt-1 text-[13px] text-muted-foreground">
                    Kodi is responding…
                  </div>
                </div>
              </div>
            ) : null}

            <div ref={bottomRef} className="h-1" />
          </div>
        )}
      </ScrollArea>

      <div className="shrink-0 border-t border-border bg-background px-4 pb-4 pt-3 sm:px-6">
        <div className="rounded-xl border border-border bg-card focus-within:border-ring focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-0">
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
            className="min-h-0 resize-none border-0 bg-transparent px-3 pt-3 text-[15px] shadow-none focus-visible:ring-0 focus-visible:ring-offset-0"
          />

          <div className="flex items-center justify-end px-2 pb-2">
            <Button
              size="icon"
              className="h-8 w-8 rounded-md"
              disabled={!draft.trim() || sending}
              onClick={() => void sendMessage()}
              aria-label="Send message"
            >
              <Send size={14} />
            </Button>
          </div>
        </div>

        {error ? (
          <p className="mt-2 text-[13px] text-brand-danger">{error}</p>
        ) : null}
      </div>
    </section>
  )

  if (embedded) {
    return content
  }

  return <div className="h-full w-full bg-background">{content}</div>
}
