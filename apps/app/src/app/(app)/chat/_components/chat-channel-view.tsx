'use client'

import { useEffect, useLayoutEffect, useRef } from 'react'
import { Hash } from 'lucide-react'
import { ScrollArea } from '@kodi/ui'
import { ChatComposer } from './chat-composer'
import { MessageRow } from './chat-message-row'
import type { Channel, Message } from './chat-types'

export function ChatChannelView({
  channel,
  rootMessages,
  repliesByThread,
  respondingRootIds,
  loadingMessages,
  draft,
  onDraftChange,
  onSend,
  sending,
  error,
  onOpenThread,
}: {
  channel: Channel | null
  rootMessages: Message[]
  repliesByThread: Record<string, Message[]>
  respondingRootIds: string[]
  loadingMessages: boolean
  draft: string
  onDraftChange: (value: string) => void
  onSend: () => void
  sending: boolean
  error: string | null
  onOpenThread: (threadId: string) => void
}) {
  const bottomRef = useRef<HTMLDivElement>(null)
  const hasInitialScrollRef = useRef(false)

  useEffect(() => {
    hasInitialScrollRef.current = false
  }, [channel?.id])

  useLayoutEffect(() => {
    if (loadingMessages) return
    if (!bottomRef.current) return

    bottomRef.current.scrollIntoView({
      block: 'end',
      behavior: hasInitialScrollRef.current ? 'smooth' : 'auto',
    })
    hasInitialScrollRef.current = true
  }, [loadingMessages, rootMessages.length, sending])

  return (
    <div className="flex h-full min-h-0 flex-col bg-background">
      <div className="shrink-0 border-b border-border bg-background px-4 py-3 sm:px-6">
        <div className="flex items-center gap-2">
          <Hash size={16} className="text-muted-foreground" />
          <h1 className="text-[15px] font-semibold text-foreground">
            {channel?.slug ?? 'general'}
          </h1>
        </div>
      </div>

      <ScrollArea className="min-h-0 flex-1">
        {loadingMessages ? (
          <p className="px-4 py-6 text-sm text-muted-foreground sm:px-6">
            Loading messages…
          </p>
        ) : rootMessages.length === 0 ? (
          <div className="flex h-full items-center justify-center px-4 py-12 sm:px-6">
            <div className="max-w-sm text-center">
              <div className="mx-auto mb-3 inline-flex h-10 w-10 items-center justify-center rounded-full bg-brand-muted text-muted-foreground">
                <Hash size={18} />
              </div>
              <p className="text-sm font-medium text-foreground">
                #{channel?.slug ?? 'general'}
              </p>
              <p className="mt-1 text-[13px] text-muted-foreground">
                Start the conversation — messages are visible to everyone in
                the workspace.
              </p>
            </div>
          </div>
        ) : (
          <div className="py-2">
            {rootMessages.map((message) => (
              <MessageRow
                key={message.id}
                message={message}
                replies={repliesByThread[message.id] ?? []}
                isResponding={respondingRootIds.includes(message.id)}
                onOpenThread={() => onOpenThread(message.id)}
              />
            ))}
            <div ref={bottomRef} className="h-1" />
          </div>
        )}
      </ScrollArea>

      <ChatComposer
        value={draft}
        onChange={onDraftChange}
        onSubmit={onSend}
        placeholder={`Message #${channel?.slug ?? 'general'}`}
        disabled={!draft.trim() || sending || !channel}
        ariaLabel="Send message"
      />

      {error ? (
        <p className="shrink-0 px-4 pb-3 text-[13px] text-brand-danger sm:px-6">
          {error}
        </p>
      ) : null}
    </div>
  )
}
