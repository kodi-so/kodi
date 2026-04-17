'use client'

import { useEffect, useLayoutEffect, useRef } from 'react'
import { ChevronLeft } from 'lucide-react'
import { Button } from '@kodi/ui/components/button'
import { ScrollArea } from '@kodi/ui/components/scroll-area'
import { ChatAvatar } from './chat-avatar'
import { ChatComposer } from './chat-composer'
import { MessageBody } from './chat-message-body'
import { formatTime } from './chat-helpers'
import type { Message } from './chat-types'

export function ChatThreadView({
  rootMessage,
  replies,
  loadingMessages,
  channelSlug,
  draft,
  onDraftChange,
  onSend,
  sending,
  error,
  onClose,
}: {
  rootMessage: Message | null
  replies: Message[]
  loadingMessages: boolean
  channelSlug: string
  draft: string
  onDraftChange: (value: string) => void
  onSend: () => void
  sending: boolean
  error: string | null
  onClose: () => void
}) {
  const bottomRef = useRef<HTMLDivElement>(null)
  const hasInitialScrollRef = useRef(false)

  useEffect(() => {
    hasInitialScrollRef.current = false
  }, [rootMessage?.id])

  useLayoutEffect(() => {
    if (loadingMessages) return
    if (!bottomRef.current) return

    bottomRef.current.scrollIntoView({
      block: 'end',
      behavior: hasInitialScrollRef.current ? 'smooth' : 'auto',
    })
    hasInitialScrollRef.current = true
  }, [loadingMessages, replies.length, sending])

  return (
    <div className="flex h-full min-h-0 flex-col bg-background">
      <div className="flex shrink-0 items-center gap-3 border-b border-border bg-background px-4 py-2.5 sm:px-6">
        <Button
          variant="ghost"
          size="icon"
          onClick={onClose}
          className="h-7 w-7 rounded-md p-1 text-muted-foreground hover:bg-brand-muted hover:text-foreground"
          aria-label="Back to channel"
        >
          <ChevronLeft size={16} />
        </Button>

        <div>
          <p className="text-[14px] font-semibold text-foreground">Thread</p>
          <p className="text-[11px] text-muted-foreground">#{channelSlug}</p>
        </div>
      </div>

      <ScrollArea className="min-h-0 flex-1">
        {loadingMessages ? (
          <p className="px-4 py-6 text-sm text-muted-foreground sm:px-6">
            Loading thread…
          </p>
        ) : rootMessage ? (
          <>
            <div className="border-b border-border px-4 py-4 sm:px-6">
              <div className="flex items-start gap-3">
                <ChatAvatar
                  role={rootMessage.role}
                  name={rootMessage.userName ?? 'You'}
                />
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline gap-2">
                    <p className="text-[14px] font-semibold text-foreground">
                      {rootMessage.role === 'assistant'
                        ? 'Kodi'
                        : (rootMessage.userName ?? 'You')}
                    </p>
                    <p className="text-[11px] text-muted-foreground">
                      {formatTime(rootMessage.createdAt)}
                    </p>
                  </div>
                  <div className="mt-0.5 text-[14px] leading-6 text-foreground">
                    <MessageBody content={rootMessage.content} />
                  </div>
                </div>
              </div>
            </div>

            {replies.length > 0 ? (
              <div className="px-4 py-2 text-[11px] font-medium uppercase tracking-[0.08em] text-muted-foreground sm:px-6">
                {replies.length} repl{replies.length === 1 ? 'y' : 'ies'}
              </div>
            ) : null}

            {replies.map((message) => (
              <div
                key={message.id}
                className="px-4 py-3 sm:px-6"
              >
                <div className="flex items-start gap-3">
                  <ChatAvatar
                    role={message.role}
                    name={message.userName ?? 'You'}
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
              <div className="px-4 py-3 text-[13px] text-muted-foreground sm:px-6">
                Kodi is responding…
              </div>
            ) : null}

            <div ref={bottomRef} className="h-1" />
          </>
        ) : (
          <p className="px-4 py-12 text-sm text-muted-foreground sm:px-6">
            This thread is no longer available.
          </p>
        )}
      </ScrollArea>

      <ChatComposer
        value={draft}
        onChange={onDraftChange}
        onSubmit={onSend}
        placeholder="Reply in thread"
        disabled={!draft.trim() || sending || !rootMessage}
        ariaLabel="Send thread reply"
      />

      {error ? (
        <p className="shrink-0 px-4 pb-3 text-[13px] text-brand-danger sm:px-6">
          {error}
        </p>
      ) : null}
    </div>
  )
}
