'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { trpc } from '@/lib/trpc'

// ── Types ─────────────────────────────────────────────────────────────────────

interface Message {
  id: string
  role: 'user' | 'assistant'
  content: string
  status?: string | null
  /** Marks messages that should have typewriter animation */
  animate?: boolean
}

interface Toast {
  id: string
  message: string
  link?: { href: string; label: string }
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

// ── MessageBubble ─────────────────────────────────────────────────────────────

function MessageBubble({
  message,
  onDelete,
}: {
  message: Message
  onDelete: (messageId: string) => void
}) {
  const isUser = message.role === 'user'
  const text = useTypewriter(message.content, message.animate === true)
  const [showDelete, setShowDelete] = useState(false)

  return (
    <div className={`flex ${isUser ? 'justify-end' : 'justify-start'} mb-3 group`}>
      <div
        className={`max-w-[80%] sm:max-w-[70%] px-4 py-2.5 rounded-2xl text-sm leading-relaxed whitespace-pre-wrap break-words ${
          isUser
            ? 'bg-indigo-600 text-white rounded-br-sm'
            : 'bg-zinc-800 text-zinc-100 rounded-bl-sm'
        } ${message.status === 'error' ? 'opacity-60' : ''}`}
      >
        {text}
        {message.status === 'error' && (
          <span className="block mt-1 text-xs text-red-300">Failed to send</span>
        )}
      </div>
      <button
        onClick={() => setShowDelete(true)}
        className="opacity-0 group-hover:opacity-100 transition-opacity ml-2 text-zinc-500 hover:text-red-400 shrink-0 mt-1"
        title="Delete message"
        aria-label="Delete message"
      >
        ✕
      </button>
      {showDelete && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-zinc-900 border border-zinc-700 rounded-lg p-6 max-w-sm">
            <p className="text-white mb-4">Delete this message?</p>
            <div className="flex gap-3 justify-end">
              <button
                onClick={() => setShowDelete(false)}
                className="px-4 py-2 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-white text-sm transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  onDelete(message.id)
                  setShowDelete(false)
                }}
                className="px-4 py-2 rounded-lg bg-red-600 hover:bg-red-500 text-white text-sm transition-colors"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ── TypingIndicator ───────────────────────────────────────────────────────────

function TypingIndicator() {
  return (
    <div className="flex justify-start mb-3">
      <div className="bg-zinc-800 rounded-2xl rounded-bl-sm px-4 py-3 flex items-center gap-1">
        {[0, 1, 2].map((i) => (
          <span
            key={i}
            className="w-1.5 h-1.5 rounded-full bg-zinc-400 animate-bounce"
            style={{ animationDelay: `${i * 150}ms` }}
          />
        ))}
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
        <div
          key={t.id}
          className="flex items-start gap-3 bg-zinc-900 border border-zinc-700 rounded-xl px-4 py-3 shadow-xl text-sm text-zinc-100"
        >
          <span className="flex-1">
            {t.message}
            {t.link && (
              <>
                {' '}
                <a
                  href={t.link.href}
                  className="text-indigo-400 hover:underline font-medium"
                >
                  {t.link.label}
                </a>
              </>
            )}
          </span>
          <button
            onClick={() => onDismiss(t.id)}
            className="text-zinc-500 hover:text-white transition-colors shrink-0 mt-0.5"
            aria-label="Dismiss"
          >
            ✕
          </button>
        </div>
      ))}
    </div>
  )
}

// ── ChatInterface ─────────────────────────────────────────────────────────────

export function ChatInterface({ orgId }: { orgId: string }) {
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(true)
  const [sending, setSending] = useState(false)
  const [toasts, setToasts] = useState<Toast[]>([])

  const bottomRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  // ── Toast helpers ────────────────────────────────────────────────────────

  const addToast = useCallback(
    (message: string, link?: { href: string; label: string }) => {
      const id = Math.random().toString(36).slice(2)
      setToasts((prev) => [...prev, { id, message, link }])
      setTimeout(() => {
        setToasts((prev) => prev.filter((t) => t.id !== id))
      }, 6000)
    },
    [],
  )

  const dismissToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id))
  }, [])

  // ── Load history ─────────────────────────────────────────────────────────

  useEffect(() => {
    let cancelled = false
    setLoading(true)

    trpc.chat.getHistory
      .query({ orgId, limit: 50 })
      .then((rows) => {
        if (cancelled) return
        // History messages don't animate
        setMessages(
          rows.map((r) => ({
            id: r.id,
            role: r.role as 'user' | 'assistant',
            content: r.content,
            status: r.status,
            animate: false,
          })),
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
    // Cap at ~5 lines (approx 120px)
    el.style.height = `${Math.min(el.scrollHeight, 120)}px`
  }, [])

  useEffect(() => {
    resizeTextarea()
  }, [input, resizeTextarea])

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
      animate: false,
    }

    setMessages((prev) => [...prev, optimistic])
    setInput('')
    setSending(true)

    try {
      const result = await trpc.chat.sendMessage.mutate({ orgId, message: text })

      setMessages((prev) => {
        // Replace optimistic with confirmed user message
        const updated = prev.map((m) =>
          m.id === optimisticId
            ? {
                id: result.userMessage.id,
                role: 'user' as const,
                content: result.userMessage.content,
                status: result.userMessage.status,
                animate: false,
              }
            : m,
        )
        // Append assistant message with typewriter
        return [
          ...updated,
          {
            id: result.assistantMessage!.id,
            role: 'assistant' as const,
            content: result.assistantMessage!.content,
            status: result.assistantMessage!.status,
            animate: true,
          },
        ]
      })
    } catch (err: unknown) {
      // Mark optimistic message as errored
      setMessages((prev) =>
        prev.map((m) =>
          m.id === optimisticId ? { ...m, status: 'error' } : m,
        ),
      )

      const msg = err instanceof Error ? err.message : String(err)
      const isOffline =
        msg.toLowerCase().includes('instance') ||
        msg.toLowerCase().includes('status') ||
        msg.toLowerCase().includes('precondition')

      if (isOffline) {
        addToast('Your agent is offline.', {
          href: '/dashboard',
          label: 'Check status →',
        })
      } else {
        addToast('Failed to send message. Your text has been preserved.')
      }

      // Restore input so user doesn't lose their message
      setInput(text)
    } finally {
      setSending(false)
    }
  }, [input, orgId, sending, addToast])

  // ── Delete message ──────────────────────────────────────────────────────

  const handleDeleteMessage = useCallback(
    async (messageId: string) => {
      // Optimistic UI update — remove immediately
      setMessages((prev) => prev.filter((m) => m.id !== messageId))

      try {
        await trpc.chat.deleteMessage.mutate({ messageId, orgId })
      } catch (err: unknown) {
        // Restore message on error
        const msg = err instanceof Error ? err.message : String(err)
        addToast(`Failed to delete message: ${msg}`)
        // Re-fetch to restore state
        const history = await trpc.chat.getHistory.query({ orgId, limit: 50 })
        setMessages(
          history.map((r) => ({
            id: r.id,
            role: r.role as 'user' | 'assistant',
            content: r.content,
            status: r.status,
            animate: false,
          })),
        )
      }
    },
    [orgId, addToast],
  )

  // ── Keyboard handling ────────────────────────────────────────────────────

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault()
        void send()
      }
    },
    [send],
  )

  // ── Render ───────────────────────────────────────────────────────────────

  return (
    <div className="flex flex-col h-full bg-zinc-950">
      {/* Message thread */}
      <div className="flex-1 overflow-y-auto px-4 py-4 sm:px-8">
        {loading ? (
          <div className="flex justify-center items-center h-24">
            <div className="w-6 h-6 rounded-full border-2 border-indigo-400 border-t-transparent animate-spin" />
          </div>
        ) : (
          <>
            {messages.map((m) => (
              <MessageBubble
                key={m.id}
                message={m}
                onDelete={handleDeleteMessage}
              />
            ))}
            {sending && <TypingIndicator />}
          </>
        )}
        <div ref={bottomRef} />
      </div>

      {/* Input bar */}
      <div className="shrink-0 border-t border-zinc-800 bg-zinc-900 px-4 py-3 sm:px-8">
        <div className="flex items-end gap-3 max-w-3xl mx-auto">
          <textarea
            ref={textareaRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Message your agent…"
            rows={1}
            disabled={sending || loading}
            className="flex-1 resize-none rounded-xl bg-zinc-800 border border-zinc-700 text-white placeholder-zinc-500 px-4 py-3 text-sm leading-relaxed focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent disabled:opacity-50 overflow-y-auto"
            style={{ maxHeight: '120px' }}
            aria-label="Message input"
          />
          <button
            onClick={() => void send()}
            disabled={sending || loading || !input.trim()}
            className="shrink-0 h-11 px-5 rounded-xl bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 disabled:cursor-not-allowed text-white text-sm font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-indigo-500"
            aria-label="Send message"
          >
            Send
          </button>
        </div>
        <p className="text-center text-zinc-600 text-xs mt-2">
          Enter to send · Shift+Enter for new line
        </p>
      </div>

      {/* Toasts */}
      <ToastList toasts={toasts} onDismiss={dismissToast} />
    </div>
  )
}
