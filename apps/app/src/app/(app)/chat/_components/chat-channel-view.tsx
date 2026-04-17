'use client'

import { useEffect, useLayoutEffect, useRef } from 'react'
import { Hash, Loader2 } from 'lucide-react'
import { ScrollArea } from '@kodi/ui'
import { ChatComposer } from './chat-composer'
import { MessageRow } from './chat-message-row'
import type { Channel, Message } from './chat-types'

const LOAD_OLDER_THRESHOLD_PX = 120

export function ChatChannelView({
  channel,
  rootMessages,
  repliesByThread,
  respondingRootIds,
  loadingMessages,
  loadingOlder,
  hasMoreOlder,
  onLoadOlder,
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
  loadingOlder: boolean
  hasMoreOlder: boolean
  onLoadOlder: () => void
  draft: string
  onDraftChange: (value: string) => void
  onSend: () => void
  sending: boolean
  error: string | null
  onOpenThread: (threadId: string) => void
}) {
  const viewportRef = useRef<HTMLDivElement>(null)
  const bottomRef = useRef<HTMLDivElement>(null)
  const hasInitialScrollRef = useRef(false)
  const oldestRootIdRef = useRef<string | null>(null)
  const pendingAnchorRef = useRef<{
    anchorId: string
    offsetFromTop: number
  } | null>(null)

  useEffect(() => {
    hasInitialScrollRef.current = false
    oldestRootIdRef.current = null
    pendingAnchorRef.current = null
  }, [channel?.id])

  useLayoutEffect(() => {
    if (loadingMessages) return

    const viewport = viewportRef.current
    if (!viewport) return

    if (pendingAnchorRef.current) {
      const { anchorId, offsetFromTop } = pendingAnchorRef.current
      pendingAnchorRef.current = null

      const anchor = viewport.querySelector<HTMLElement>(
        `[data-message-id="${anchorId}"]`
      )
      if (anchor) {
        const anchorTopInViewport =
          anchor.getBoundingClientRect().top -
          viewport.getBoundingClientRect().top
        viewport.scrollTop += anchorTopInViewport - offsetFromTop
      }
      return
    }

    if (bottomRef.current) {
      bottomRef.current.scrollIntoView({
        block: 'end',
        behavior: hasInitialScrollRef.current ? 'smooth' : 'auto',
      })
      hasInitialScrollRef.current = true
    }
  }, [loadingMessages, rootMessages.length, sending])

  useEffect(() => {
    if (rootMessages.length > 0) {
      oldestRootIdRef.current = rootMessages[0]!.id
    }
  }, [rootMessages])

  function captureAnchorAndLoadOlder() {
    const viewport = viewportRef.current
    const anchorId = oldestRootIdRef.current
    if (viewport && anchorId) {
      const anchor = viewport.querySelector<HTMLElement>(
        `[data-message-id="${anchorId}"]`
      )
      if (anchor) {
        pendingAnchorRef.current = {
          anchorId,
          offsetFromTop:
            anchor.getBoundingClientRect().top -
            viewport.getBoundingClientRect().top,
        }
      }
    }
    onLoadOlder()
  }

  useEffect(() => {
    const viewport = viewportRef.current
    if (!viewport) return

    function handleScroll() {
      if (!viewport) return
      if (!hasMoreOlder || loadingOlder || loadingMessages) return
      if (viewport.scrollTop <= LOAD_OLDER_THRESHOLD_PX) {
        captureAnchorAndLoadOlder()
      }
    }

    viewport.addEventListener('scroll', handleScroll, { passive: true })
    return () => viewport.removeEventListener('scroll', handleScroll)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasMoreOlder, loadingOlder, loadingMessages, onLoadOlder])

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

      <ScrollArea viewportRef={viewportRef} className="min-h-0 flex-1">
        {loadingMessages && rootMessages.length === 0 ? (
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
            {loadingOlder ? (
              <div className="flex items-center justify-center py-3 text-[12px] text-muted-foreground">
                <Loader2 size={14} className="mr-2 animate-spin" />
                Loading older messages…
              </div>
            ) : hasMoreOlder ? (
              <button
                type="button"
                onClick={captureAnchorAndLoadOlder}
                className="flex w-full items-center justify-center py-2 text-[12px] text-muted-foreground transition-colors hover:text-foreground"
              >
                Load older messages
              </button>
            ) : null}

            {rootMessages.map((message) => (
              <div key={message.id} data-message-id={message.id}>
                <MessageRow
                  message={message}
                  replies={repliesByThread[message.id] ?? []}
                  isResponding={respondingRootIds.includes(message.id)}
                  onOpenThread={() => onOpenThread(message.id)}
                />
              </div>
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
