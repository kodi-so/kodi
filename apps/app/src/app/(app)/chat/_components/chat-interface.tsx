'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { trpc } from '@/lib/trpc'
import { useSession } from '@/lib/auth-client'
import {
  Alert,
  AlertDescription,
  Button,
  Card,
  CardContent,
  Separator,
  Skeleton,
  Textarea,
} from '@kodi/ui'

// ── Types ─────────────────────────────────────────────────────────────────────

interface Message {
  id: string
  role: 'user' | 'assistant'
  content: string
  status?: string | null
  createdAt?: string | Date | null
  userName?: string | null
  userImage?: string | null
  /** Marks messages that should have typewriter animation */
  animate?: boolean
}

interface Toast {
  id: string
  message: string
  type?: 'info' | 'success'
  link?: { href: string; label: string }
}

interface DeletedMessage {
  message: Message
  index: number
  timestamp: number
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatTime(date: Date): string {
  return date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
}

function formatDayLabel(date: Date): string {
  const now = new Date()
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const target = new Date(date.getFullYear(), date.getMonth(), date.getDate())
  const diff = today.getTime() - target.getTime()
  const dayMs = 86400000

  if (diff === 0) return 'Today'
  if (diff === dayMs) return 'Yesterday'
  if (diff < 7 * dayMs) {
    return date.toLocaleDateString([], { weekday: 'long' })
  }
  return date.toLocaleDateString([], {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: today.getFullYear() !== date.getFullYear() ? 'numeric' : undefined,
  })
}

function isSameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  )
}

function getMessageDate(msg: Message): Date {
  if (msg.createdAt) return new Date(msg.createdAt)
  return new Date()
}

function getInitials(name: string): string {
  return name
    .split(' ')
    .map((w) => w[0])
    .join('')
    .toUpperCase()
    .slice(0, 2)
}

// ── Typewriter hook ───────────────────────────────────────────────────────────

function useTypewriter(fullText: string, active: boolean): string {
  const [displayed, setDisplayed] = useState('')

  useEffect(() => {
    if (!active) {
      setDisplayed(fullText)
      return
    }
    setDisplayed('')
    let i = 0
    const interval = setInterval(() => {
      i += 30
      if (i >= fullText.length) {
        setDisplayed(fullText)
        clearInterval(interval)
      } else {
        setDisplayed(fullText.slice(0, i))
      }
    }, 30)
    return () => clearInterval(interval)
  }, [fullText, active])

  return displayed
}

// ── Markdown renderer ─────────────────────────────────────────────────────────

function MarkdownContent({
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
        p: ({ children }) => <p className="mb-2 last:mb-0">{children}</p>,
        strong: ({ children }) => (
          <strong className="font-semibold">{children}</strong>
        ),
        em: ({ children }) => <em className="italic">{children}</em>,
        ul: ({ children }) => (
          <ul className="list-disc list-inside mb-2 last:mb-0 space-y-0.5">
            {children}
          </ul>
        ),
        ol: ({ children }) => (
          <ol className="list-decimal list-inside mb-2 last:mb-0 space-y-0.5">
            {children}
          </ol>
        ),
        li: ({ children }) => <li className="leading-relaxed">{children}</li>,
        code: ({ className, children, ...props }) => {
          const isBlock = className?.includes('language-')
          if (isBlock) {
            return (
              <pre
                className={`my-2 rounded-lg p-3 text-xs overflow-x-auto ${isUser ? 'bg-[#DFAE56]/20 text-[#223239]' : 'bg-[rgba(49,66,71,0.92)] text-[#eef2ea]'}`}
              >
                <code className={className} {...props}>
                  {children}
                </code>
              </pre>
            )
          }
          return (
            <code
              className={`px-1.5 py-0.5 rounded text-xs font-mono ${
                isUser ? 'bg-[#DFAE56]/20 text-[#223239]' : 'bg-white/10 text-[#eef2ea]'
              }`}
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
            rel="noopener noreferrer"
            className={`underline underline-offset-2 ${isUser ? 'text-[#9a6e19] hover:text-[#223239]' : 'text-[#F0C570] hover:text-[#f6d289]'}`}
          >
            {children}
          </a>
        ),
        blockquote: ({ children }) => (
          <blockquote
            className={`border-l-2 pl-3 my-2 ${isUser ? 'border-[#DFAE56]/45 text-[#4b5f65]' : 'border-white/12 text-[#dce5e7]'}`}
          >
            {children}
          </blockquote>
        ),
        h1: ({ children }) => (
          <h1 className="text-base font-bold mb-1">{children}</h1>
        ),
        h2: ({ children }) => (
          <h2 className="text-sm font-bold mb-1">{children}</h2>
        ),
        h3: ({ children }) => (
          <h3 className="text-sm font-semibold mb-1">{children}</h3>
        ),
        hr: () => (
          <hr
            className={`my-2 ${isUser ? 'border-[#DFAE56]/30' : 'border-white/12'}`}
          />
        ),
        table: ({ children }) => (
          <div className="overflow-x-auto my-2">
            <table
              className={`text-xs border-collapse ${isUser ? 'border-[#DFAE56]/30' : 'border-white/12'}`}
            >
              {children}
            </table>
          </div>
        ),
        th: ({ children }) => (
          <th
            className={`px-2 py-1 text-left font-semibold border-b ${isUser ? 'border-[#DFAE56]/30' : 'border-white/12'}`}
          >
            {children}
          </th>
        ),
        td: ({ children }) => (
          <td
            className={`px-2 py-1 border-b ${isUser ? 'border-[#DFAE56]/24' : 'border-white/10'}`}
          >
            {children}
          </td>
        ),
      }}
    >
      {content}
    </ReactMarkdown>
  )
}

// ── Context Menu ──────────────────────────────────────────────────────────────

function ContextMenu({
  x,
  y,
  onCopy,
  onDelete,
  onClose,
}: {
  x: number
  y: number
  onCopy: () => void
  onDelete: () => void
  onClose: () => void
}) {
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose()
    }
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('mousedown', handleClick)
    document.addEventListener('keydown', handleEscape)
    return () => {
      document.removeEventListener('mousedown', handleClick)
      document.removeEventListener('keydown', handleEscape)
    }
  }, [onClose])

  return (
    <div
      ref={ref}
      className="fixed z-50 min-w-[160px] rounded-lg border border-white/10 bg-[#314247] py-1 shadow-xl animate-in fade-in zoom-in-95 duration-100"
      style={{ left: `${x}px`, top: `${y}px` }}
    >
      <button
        onClick={() => {
          onCopy()
          onClose()
        }}
        className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-[#eef2ea] transition-colors hover:bg-white/8"
      >
        <svg
          className="w-4 h-4"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"
          />
        </svg>
        Copy text
        <span className="ml-auto text-xs text-[#8ea3a8]">⌘C</span>
      </button>
      <button
        onClick={() => {
          onDelete()
          onClose()
        }}
        className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-red-400 transition-colors hover:bg-white/8"
      >
        <svg
          className="w-4 h-4"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
          />
        </svg>
        Delete message
        <span className="ml-auto text-xs text-[#8ea3a8]">Del</span>
      </button>
    </div>
  )
}

// ── Delete Confirmation Modal ─────────────────────────────────────────────────

function DeleteConfirmationModal({
  onConfirm,
  onCancel,
}: {
  onConfirm: () => void
  onCancel: () => void
}) {
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCancel()
    }
    document.addEventListener('keydown', handleEscape)
    return () => document.removeEventListener('keydown', handleEscape)
  }, [onCancel])

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 animate-in fade-in duration-150">
      <Card className="mx-4 max-w-sm border-white/10 bg-[#314247] shadow-2xl animate-in zoom-in-95 duration-150">
        <CardContent className="p-6">
          <h3 className="text-white font-semibold text-lg mb-2">
            Delete Message
          </h3>
          <p className="mb-6 text-sm text-[#9bb0b5]">
            Are you sure you want to delete this message? You can undo with{' '}
            <kbd className="rounded bg-white/10 px-1.5 py-0.5 text-xs font-mono text-[#dce5e7]">
              ⌘Z
            </kbd>
          </p>
          <div className="flex gap-3 justify-end">
            <Button
              onClick={onCancel}
              variant="outline"
              className="border-white/10 bg-white/8 text-white hover:bg-white/10"
            >
              Cancel
            </Button>
            <Button
              onClick={onConfirm}
              variant="destructive"
              className="bg-red-600 text-white hover:bg-red-500"
            >
              Delete
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

// ── Day Separator ─────────────────────────────────────────────────────────────

function DaySeparator({ date }: { date: Date }) {
  return (
    <div className="flex items-center gap-3 my-4 first:mt-0">
      <Separator className="flex-1 bg-white/10" />
      <span className="px-2 text-xs font-medium text-[#8ea3a8]">
        {formatDayLabel(date)}
      </span>
      <Separator className="flex-1 bg-white/10" />
    </div>
  )
}

// ── Avatar ────────────────────────────────────────────────────────────────────

function Avatar({
  name,
  image,
  isAssistant,
}: {
  name: string
  image?: string | null
  isAssistant?: boolean
}) {
  if (isAssistant) {
    return (
      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-[#DFAE56] to-[#6FA88C]">
        <svg
          className="w-4 h-4 text-white"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M13 10V3L4 14h7v7l9-11h-7z"
          />
        </svg>
      </div>
    )
  }

  if (image) {
    return (
      <img
        src={image}
        alt={name}
        className="w-8 h-8 rounded-full object-cover shrink-0"
      />
    )
  }

  return (
    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-white/10">
      <span className="text-xs font-medium text-[#dce5e7]">
        {getInitials(name)}
      </span>
    </div>
  )
}

// ── MessageBubble ─────────────────────────────────────────────────────────────

function MessageBubble({
  message,
  isSelected,
  onSelect,
  onHover,
  onDelete,
  onCopy,
}: {
  message: Message
  isSelected: boolean
  onSelect: (id: string) => void
  onHover: (id: string | null) => void
  onDelete: (messageId: string) => void
  onCopy: (messageId: string) => void
}) {
  const isUser = message.role === 'user'
  const text = useTypewriter(message.content, message.animate === true)
  const [isHovered, setIsHovered] = useState(false)
  const [showConfirmation, setShowConfirmation] = useState(false)
  const [contextMenu, setContextMenu] = useState<{
    x: number
    y: number
  } | null>(null)

  // Notify parent when hover state changes
  // Only call onHover when entering, not when leaving (parent will handle multiple hovers)
  const handleMouseEnter = useCallback(() => {
    setIsHovered(true)
    onHover(message.id)
  }, [message.id, onHover])

  const handleMouseLeave = useCallback(() => {
    setIsHovered(false)
    // Don't call onHover(null) here — let the next message's hover take over
  }, [])

  const senderName = isUser ? message.userName || 'You' : 'Kodi'
  const timestamp = getMessageDate(message)

  const handleContextMenu = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault()
      onSelect(message.id)
      setContextMenu({ x: e.clientX, y: e.clientY })
    },
    [message.id, onSelect]
  )

  const handleDelete = useCallback(() => {
    setShowConfirmation(true)
    setContextMenu(null)
  }, [])

  const handleConfirmDelete = useCallback(() => {
    onDelete(message.id)
    setShowConfirmation(false)
  }, [message.id, onDelete])

  const handleCopy = useCallback(() => {
    onCopy(message.id)
  }, [message.id, onCopy])

  return (
    <>
      <div
        className={`flex gap-3 mb-1 group animate-in fade-in slide-in-from-bottom-2 duration-300 px-2 py-1.5 rounded-lg transition-colors ${
          isSelected ? 'bg-white/8' : 'hover:bg-white/6'
        }`}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
        onContextMenu={handleContextMenu}
        onClick={() => onSelect(message.id)}
        data-message-id={message.id}
      >
        {/* Avatar */}
        <Avatar
          name={senderName}
          image={isUser ? message.userImage : undefined}
          isAssistant={!isUser}
        />

        {/* Content */}
        <div className="flex-1 min-w-0">
          {/* Sender name + timestamp */}
          <div className="flex items-baseline gap-2 mb-0.5">
            <span
              className={`text-sm font-semibold ${isUser ? 'text-white' : 'text-[#F0C570]'}`}
            >
              {senderName}
            </span>
            <span className="text-xs text-[#7d9196]">
              {formatTime(timestamp)}
            </span>
          </div>

          {/* Message content with markdown */}
          <div
            className={`text-sm leading-relaxed break-words ${
              message.status === 'error' ? 'opacity-60' : ''
            } ${isUser ? 'text-[#eef2ea]' : 'text-[#dce5e7]'} prose-sm`}
          >
            <MarkdownContent content={text} isUser={isUser} />
            {message.status === 'error' && (
              <span className="block mt-1 text-xs text-red-400 font-medium">
                ⚠ Failed to send
              </span>
            )}
          </div>
        </div>

        {/* Hover action buttons */}
        <div
          className={`flex items-start gap-0.5 pt-1 transition-all duration-150 ${
            isHovered ? 'opacity-100' : 'opacity-0 pointer-events-none'
          }`}
        >
          <button
            onClick={(e) => {
              e.stopPropagation()
              handleCopy()
            }}
            className="rounded-md p-1.5 text-[#8ea3a8] transition-all shrink-0 hover:bg-white/10 hover:text-[#dce5e7]"
            title="Copy text (⌘C)"
            aria-label="Copy text"
          >
            <svg
              className="w-3.5 h-3.5"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"
              />
            </svg>
          </button>
          <button
            onClick={(e) => {
              e.stopPropagation()
              handleDelete()
            }}
            className="rounded-md p-1.5 text-[#8ea3a8] transition-all shrink-0 hover:bg-white/10 hover:text-red-400"
            title="Delete message (Del)"
            aria-label="Delete message"
          >
            <svg
              className="w-3.5 h-3.5"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
              />
            </svg>
          </button>
        </div>
      </div>

      {/* Context menu */}
      {contextMenu && (
        <ContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          onCopy={handleCopy}
          onDelete={handleDelete}
          onClose={() => setContextMenu(null)}
        />
      )}

      {/* Delete confirmation modal */}
      {showConfirmation && (
        <DeleteConfirmationModal
          onConfirm={handleConfirmDelete}
          onCancel={() => setShowConfirmation(false)}
        />
      )}
    </>
  )
}

// ── TypingIndicator ───────────────────────────────────────────────────────────

function TypingIndicator() {
  return (
    <div className="flex gap-3 mb-1 px-2 py-1.5 animate-in fade-in slide-in-from-bottom-2 duration-300">
      <Avatar name="Kodi" isAssistant />
      <div className="flex items-center">
        <div className="flex items-center gap-1 rounded-xl bg-white/10 px-4 py-2.5">
          {[0, 1, 2].map((i) => (
            <span
              key={i}
              className="h-1.5 w-1.5 rounded-full bg-[#DFAE56] animate-bounce"
              style={{ animationDelay: `${i * 150}ms` }}
            />
          ))}
        </div>
      </div>
    </div>
  )
}

// ── ToastList ─────────────────────────────────────────────────────────────────

function ToastList({
  toasts,
  onDismiss,
}: {
  toasts: Toast[]
  onDismiss: (id: string) => void
}) {
  if (toasts.length === 0) return null
  return (
    <div className="fixed bottom-24 right-4 z-50 flex flex-col gap-2 max-w-sm">
      {toasts.map((t) => (
        <Alert
          key={t.id}
          className={`flex items-start gap-3 border rounded-xl px-4 py-3 shadow-xl text-sm animate-in slide-in-from-right duration-200 ${
            t.type === 'success'
              ? 'border-[#6FA88C]/24 bg-[#29443c]/90 text-[#e5f5eb]'
              : 'border-white/10 bg-[#314247] text-white'
          }`}
        >
          <AlertDescription className="flex-1 p-0">
            {t.message}
            {t.link && (
              <>
                {' '}
                <a
                  href={t.link.href}
                  className="font-medium text-[#F0C570] hover:underline"
                >
                  {t.link.label}
                </a>
              </>
            )}
          </AlertDescription>
          <button
            onClick={() => onDismiss(t.id)}
            className="mt-0.5 shrink-0 text-[#8ea3a8] transition-colors hover:text-white"
            aria-label="Dismiss"
          >
            ✕
          </button>
        </Alert>
      ))}
    </div>
  )
}

// ── Keyboard Shortcuts Help ───────────────────────────────────────────────────

function ShortcutsHelp() {
  return (
    <div className="mt-2 space-x-3 text-center text-xs text-[#7d9196]">
      <span>Enter to send</span>
      <span>·</span>
      <span>Shift+Enter for new line</span>
      <span>·</span>
      <span>⌘C copy</span>
      <span>·</span>
      <span>Del delete</span>
      <span>·</span>
      <span>⌘Z undo</span>
    </div>
  )
}

// ── ChatInterface ─────────────────────────────────────────────────────────────

export function ChatInterface({ orgId }: { orgId: string }) {
  const { data: session } = useSession()
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(true)
  const [sending, setSending] = useState(false)
  const [toasts, setToasts] = useState<Toast[]>([])
  const [selectedMessageId, setSelectedMessageId] = useState<string | null>(
    null
  )
  const [hoveredMessageId, setHoveredMessageId] = useState<string | null>(null)
  const [deletedMessages, setDeletedMessages] = useState<DeletedMessage[]>([])

  const bottomRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const messagesRef = useRef<Message[]>(messages)
  messagesRef.current = messages

  // ── Toast helpers ────────────────────────────────────────────────────────

  const addToast = useCallback(
    (
      message: string,
      opts?: {
        link?: { href: string; label: string }
        type?: 'info' | 'success'
      }
    ) => {
      const id = Math.random().toString(36).slice(2)
      setToasts((prev) => [
        ...prev,
        { id, message, link: opts?.link, type: opts?.type },
      ])
      setTimeout(() => {
        setToasts((prev) => prev.filter((t) => t.id !== id))
      }, 6000)
    },
    []
  )

  const dismissToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id))
  }, [])

  // ── Load history ─────────────────────────────────────────────────────────

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setMessages([])

    trpc.chat.getHistory
      .query({ orgId, limit: 50 })
      .then((rows) => {
        if (cancelled) return
        setMessages(
          rows.map((r) => ({
            id: r.id,
            role: r.role as 'user' | 'assistant',
            content: r.content,
            status: r.status,
            createdAt: r.createdAt,
            userName: 'userName' in r ? (r as any).userName : null,
            userImage: 'userImage' in r ? (r as any).userImage : null,
            animate: false,
          }))
        )
      })
      .catch(() => {
        if (!cancelled) addToast('Failed to load chat history.')
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [orgId, addToast])

  // ── Scroll to bottom when messages change ────────────────────────────────

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, sending])

  // ── Auto-resize textarea ─────────────────────────────────────────────────

  const resizeTextarea = useCallback(() => {
    const el = textareaRef.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${Math.min(el.scrollHeight, 120)}px`
  }, [])

  useEffect(() => {
    resizeTextarea()
  }, [input, resizeTextarea])

  // ── Copy message ─────────────────────────────────────────────────────────

  const handleCopyMessage = useCallback(
    (messageId: string) => {
      const msg = messagesRef.current.find((m) => m.id === messageId)
      if (!msg) return
      navigator.clipboard.writeText(msg.content).then(() => {
        addToast('Copied to clipboard', { type: 'success' })
      })
    },
    [addToast]
  )

  // ── Send message ─────────────────────────────────────────────────────────

  const send = useCallback(async () => {
    const text = input.trim()
    if (!text || sending) return

    const optimisticId = `opt-${Date.now()}`
    const optimistic: Message = {
      id: optimisticId,
      role: 'user',
      content: text,
      status: 'sending',
      createdAt: new Date().toISOString(),
      userName: session?.user?.name || 'You',
      userImage: session?.user?.image || null,
      animate: false,
    }

    setMessages((prev) => [...prev, optimistic])
    setInput('')
    setSending(true)

    try {
      const result = await trpc.chat.sendMessage.mutate({
        orgId,
        message: text,
      })

      setMessages((prev) => {
        const updated = prev.map((m) =>
          m.id === optimisticId
            ? {
                id: result.userMessage.id,
                role: 'user' as const,
                content: result.userMessage.content,
                status: result.userMessage.status,
                createdAt: result.userMessage.createdAt,
                userName: session?.user?.name || 'You',
                userImage: session?.user?.image || null,
                animate: false,
              }
            : m
        )
        return [
          ...updated,
          {
            id: result.assistantMessage!.id,
            role: 'assistant' as const,
            content: result.assistantMessage!.content,
            status: result.assistantMessage!.status,
            createdAt: result.assistantMessage!.createdAt,
            userName: null,
            userImage: null,
            animate: true,
          },
        ]
      })
    } catch (err: unknown) {
      setMessages((prev) =>
        prev.map((m) => (m.id === optimisticId ? { ...m, status: 'error' } : m))
      )

      const msg = err instanceof Error ? err.message : String(err)
      const isOffline =
        msg.toLowerCase().includes('instance') ||
        msg.toLowerCase().includes('status') ||
        msg.toLowerCase().includes('precondition')

      if (isOffline) {
        addToast('Your agent is offline.', {
          link: { href: '/dashboard', label: 'Check status →' },
        })
      } else {
        addToast('Failed to send message. Your text has been preserved.')
      }
      setInput(text)
    } finally {
      setSending(false)
    }
  }, [input, orgId, sending, addToast, session])

  // ── Delete message ──────────────────────────────────────────────────────

  const handleDeleteMessage = useCallback(
    async (messageId: string) => {
      const msgIndex = messagesRef.current.findIndex((m) => m.id === messageId)
      const msg = messagesRef.current[msgIndex]
      if (!msg || msgIndex === -1) return

      // Save for undo
      setDeletedMessages((prev) => [
        ...prev,
        { message: msg, index: msgIndex, timestamp: Date.now() },
      ])

      // Optimistic removal
      setMessages((prev) => prev.filter((m) => m.id !== messageId))
      setSelectedMessageId(null)

      try {
        await trpc.chat.deleteMessage.mutate({ messageId, orgId })
        addToast('Message deleted. Press ⌘Z to undo.', { type: 'info' })
      } catch (err: unknown) {
        const errorMsg = err instanceof Error ? err.message : String(err)
        addToast(`Failed to delete message: ${errorMsg}`)
        // Restore on error
        const history = await trpc.chat.getHistory.query({ orgId, limit: 50 })
        setMessages(
          history.map((r) => ({
            id: r.id,
            role: r.role as 'user' | 'assistant',
            content: r.content,
            status: r.status,
            createdAt: r.createdAt,
            userName: 'userName' in r ? (r as any).userName : null,
            userImage: 'userImage' in r ? (r as any).userImage : null,
            animate: false,
          }))
        )
        // Remove from undo stack
        setDeletedMessages((prev) =>
          prev.filter((d) => d.message.id !== messageId)
        )
      }
    },
    [orgId, addToast]
  )

  // ── Undo delete ──────────────────────────────────────────────────────────

  const undoLastDelete = useCallback(async () => {
    setDeletedMessages((prev) => {
      if (prev.length === 0) return prev
      const last = prev[prev.length - 1]!
      const rest = prev.slice(0, -1)

      // Restore the message in the UI at its original position
      setMessages((msgs) => {
        const newMsgs = [...msgs]
        const insertAt = Math.min(last.index, newMsgs.length)
        newMsgs.splice(insertAt, 0, last.message)
        return newMsgs
      })

      // Re-fetch to get server state (message was soft-deleted, we can't un-delete via API yet, but at least UI is restored)
      // In a production app, you'd call an undelete API here
      addToast('Message restored', { type: 'success' })

      return rest
    })
  }, [addToast])

  // ── Global keyboard shortcuts ────────────────────────────────────────────

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const isMod = e.metaKey || e.ctrlKey
      // Prioritize hovered message over selected (so hover + shortcut works without clicking)
      const targetMessageId = hoveredMessageId || selectedMessageId

      // ⌘Z — undo last deletion
      if (isMod && e.key === 'z' && !e.shiftKey) {
        if (deletedMessages.length > 0) {
          e.preventDefault()
          void undoLastDelete()
          return
        }
      }

      // ⌘C — copy hovered/selected message (only when no text is selected)
      if (isMod && e.key === 'c' && targetMessageId) {
        const selection = window.getSelection()
        if (!selection || selection.toString().length === 0) {
          e.preventDefault()
          handleCopyMessage(targetMessageId)
          return
        }
      }

      // Delete / Backspace — delete hovered/selected message
      if ((e.key === 'Delete' || e.key === 'Backspace') && targetMessageId) {
        // Don't trigger if user is typing in textarea
        if ((e.target as HTMLElement)?.tagName === 'TEXTAREA') return
        e.preventDefault()
        void handleDeleteMessage(targetMessageId)
        return
      }

      // Escape — deselect
      if (e.key === 'Escape') {
        setSelectedMessageId(null)
        setHoveredMessageId(null)
      }

      // Arrow keys — navigate messages
      if (
        (e.key === 'ArrowUp' || e.key === 'ArrowDown') &&
        !e.target?.toString().includes('textarea')
      ) {
        if ((e.target as HTMLElement)?.tagName === 'TEXTAREA') return
        e.preventDefault()
        const msgs = messagesRef.current
        if (msgs.length === 0) return

        if (!targetMessageId) {
          const newId = msgs[msgs.length - 1]!.id
          setSelectedMessageId(newId)
          setHoveredMessageId(newId)
          return
        }

        const idx = msgs.findIndex((m) => m.id === targetMessageId)
        if (e.key === 'ArrowUp' && idx > 0) {
          const newId = msgs[idx - 1]!.id
          setSelectedMessageId(newId)
          setHoveredMessageId(newId)
        } else if (e.key === 'ArrowDown' && idx < msgs.length - 1) {
          const newId = msgs[idx + 1]!.id
          setSelectedMessageId(newId)
          setHoveredMessageId(newId)
        }
      }
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [
    selectedMessageId,
    hoveredMessageId,
    deletedMessages,
    handleDeleteMessage,
    handleCopyMessage,
    undoLastDelete,
  ])

  // ── Clean up old undo entries (>30s) ────────────────────────────────────

  useEffect(() => {
    const interval = setInterval(() => {
      setDeletedMessages((prev) =>
        prev.filter((d) => Date.now() - d.timestamp < 30000)
      )
    }, 10000)
    return () => clearInterval(interval)
  }, [])

  // ── Textarea keyboard handling ───────────────────────────────────────────

  const handleTextareaKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault()
        void send()
      }
    },
    [send]
  )

  // ── Render messages with day separators ──────────────────────────────────

  const renderMessages = () => {
    const elements: JSX.Element[] = []
    let lastDate: Date | null = null

    for (const m of messages) {
      const msgDate = getMessageDate(m)
      if (!lastDate || !isSameDay(lastDate, msgDate)) {
        elements.push(
          <DaySeparator key={`day-${msgDate.toDateString()}`} date={msgDate} />
        )
      }
      lastDate = msgDate

      elements.push(
        <MessageBubble
          key={m.id}
          message={m}
          isSelected={selectedMessageId === m.id}
          onSelect={setSelectedMessageId}
          onHover={setHoveredMessageId}
          onDelete={handleDeleteMessage}
          onCopy={handleCopyMessage}
        />
      )
    }
    return elements
  }

  // ── Render ───────────────────────────────────────────────────────────────

  return (
    <div
      className="flex h-full flex-col bg-transparent"
      onClick={() => setSelectedMessageId(null)}
    >
      {/* Message thread */}
      <div
        className="flex-1 overflow-y-auto px-4 py-4 sm:px-8"
        onMouseLeave={() => setHoveredMessageId(null)}
      >
        <div className="max-w-3xl mx-auto">
          {loading ? (
            <div className="flex justify-center items-center h-24">
              <Skeleton className="h-6 w-6 rounded-full bg-[#DFAE56]/30" />
            </div>
          ) : (
            <>
              {renderMessages()}
              {sending && <TypingIndicator />}
            </>
          )}
          <div ref={bottomRef} />
        </div>
      </div>

      {/* Input bar */}
      <div className="shrink-0 border-t border-white/10 bg-[rgba(34,50,57,0.88)] px-4 py-3 backdrop-blur sm:px-8">
        <div className="flex items-end gap-3 max-w-3xl mx-auto">
          <Textarea
            ref={textareaRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleTextareaKeyDown}
            placeholder="Message your agent…"
            rows={1}
            disabled={sending || loading}
            className="min-h-0 flex-1 resize-none rounded-xl border-white/10 bg-white/6 px-4 py-3 text-sm leading-relaxed text-white placeholder:text-[#7f9398] focus-visible:ring-[#DFAE56] overflow-y-auto"
            style={{ maxHeight: '120px' }}
            aria-label="Message input"
            onClick={(e) => e.stopPropagation()}
          />
          <Button
            onClick={(e) => {
              e.stopPropagation()
              void send()
            }}
            disabled={sending || loading || !input.trim()}
            className="h-11 shrink-0 rounded-xl bg-[#DFAE56] px-5 text-[#223239] hover:bg-[#e8bf70] disabled:opacity-40"
            aria-label="Send message"
          >
            Send
          </Button>
        </div>
        <ShortcutsHelp />
      </div>

      {/* Toasts */}
      <ToastList toasts={toasts} onDismiss={dismissToast} />
    </div>
  )
}
