'use client'

import { CornerUpRight } from 'lucide-react'
import { ChatAvatar } from './chat-avatar'
import { MessageBody } from './chat-message-body'
import { formatDate, formatTime } from './chat-helpers'
import type { Message } from './chat-types'

export function MessageRow({
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
  const hasReplies = replies.length > 0

  return (
    <div className="group px-4 py-3 transition-colors hover:bg-brand-muted/40 sm:px-6">
      <button
        type="button"
        onClick={onOpenThread}
        className="flex w-full items-start gap-3 text-left"
      >
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
      </button>

      {(hasReplies || isResponding) && (
        <div className="pl-11">
          {hasReplies && (
            <button
              type="button"
              onClick={onOpenThread}
              className="mt-1.5 inline-flex items-center gap-2 rounded-md px-2 py-1 text-[13px] font-medium text-brand-info transition-colors hover:bg-brand-info-soft"
            >
              <CornerUpRight size={13} />
              <span>
                {replies.length} repl{replies.length === 1 ? 'y' : 'ies'}
              </span>
              <span className="text-muted-foreground">
                Last reply {formatDate(replies[replies.length - 1]!.createdAt)}
              </span>
            </button>
          )}

          {isResponding && (
            <p className="mt-1 text-[13px] text-muted-foreground">
              Kodi is responding...
            </p>
          )}
        </div>
      )}
    </div>
  )
}
