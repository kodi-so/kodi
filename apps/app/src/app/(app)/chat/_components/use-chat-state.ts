'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { trpc } from '@/lib/trpc'
import { useSession } from '@/lib/auth-client'
import { makeTempId } from './chat-helpers'
import { KODI_DM_ID, type Channel, type Message } from './chat-types'

type UseChatStateArgs = {
  orgId: string
  initialPrompt?: string | null
  initialDirectId?: string | null
  initialChannelId?: string | null
  initialThreadId?: string | null
}

export function useChatState({
  orgId,
  initialPrompt,
  initialDirectId,
  initialChannelId,
  initialThreadId,
}: UseChatStateArgs) {
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
    null
  )
  const [selectedThreadId, setSelectedThreadId] = useState<string | null>(
    initialDirectId === KODI_DM_ID ? null : (initialThreadId ?? null)
  )
  const [messages, setMessages] = useState<Message[]>([])
  const [messageDraft, setMessageDraft] = useState('')
  const [threadDraft, setThreadDraft] = useState('')
  const [loadingChannels, setLoadingChannels] = useState(true)
  const [loadingMessages, setLoadingMessages] = useState(false)
  const [loadingOlder, setLoadingOlder] = useState(false)
  const [nextCursor, setNextCursor] = useState<string | null>(null)
  const [creatingChannel, setCreatingChannel] = useState(false)
  const [sendingMain, setSendingMain] = useState(false)
  const [sendingThread, setSendingThread] = useState(false)
  const [respondingRootIds, setRespondingRootIds] = useState<string[]>([])
  const [error, setError] = useState<string | null>(null)
  const [createChannelError, setCreateChannelError] = useState<string | null>(
    null
  )
  const [promptHandled, setPromptHandled] = useState(false)

  const buildChatUrl = useCallback(
    (options: {
      channelId?: string | null
      directId?: string | null
      threadId?: string | null
    }) => {
      const params = new URLSearchParams()
      if (options.directId) {
        params.set('dm', options.directId)
      } else if (options.channelId) {
        const channel = channels.find((c) => c.id === options.channelId)
        params.set('channel', channel?.slug ?? options.channelId)
      }
      if (options.threadId) {
        params.set('thread', options.threadId)
      }
      const query = params.toString()
      return query ? `${pathname}?${query}` : pathname
    },
    [channels, pathname]
  )

  useEffect(() => {
    const shouldShowDirect =
      initialDirectId === KODI_DM_ID || (!initialChannelId && !initialPrompt)
    setSelectedDirectId(shouldShowDirect ? KODI_DM_ID : null)
    setSelectedThreadId(shouldShowDirect ? null : (initialThreadId ?? null))
    if (initialChannelId) {
      const resolved = channels.find(
        (channel) =>
          channel.slug === initialChannelId || channel.id === initialChannelId
      )
      if (resolved) setSelectedChannelId(resolved.id)
    }
  }, [
    channels,
    initialChannelId,
    initialDirectId,
    initialPrompt,
    initialThreadId,
  ])

  useEffect(() => {
    let cancelled = false
    setLoadingChannels(true)

    async function loadChannels() {
      try {
        const rows = await trpc.chat.listChannels.query({ orgId })
        if (cancelled) return

        const next = rows as Channel[]
        setChannels(next)

        const fromUrl = initialChannelId
          ? (next.find(
              (channel) =>
                channel.slug === initialChannelId ||
                channel.id === initialChannelId
            ) ?? null)
          : null
        const initial = fromUrl ?? next[0] ?? null
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
    if (selectedDirectId || !selectedChannelId) {
      setMessages([])
      setNextCursor(null)
      return
    }

    let cancelled = false
    const channelId = selectedChannelId
    setLoadingMessages(true)
    setError(null)
    setNextCursor(null)

    async function loadMessages() {
      try {
        const result = (await trpc.chat.getChannelMessages.query({
          orgId,
          channelId,
        })) as { messages: Message[]; nextCursor: string | null }

        if (!cancelled) {
          setMessages(result.messages)
          setNextCursor(result.nextCursor)
        }
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

  async function loadOlderMessages() {
    if (!selectedChannelId || !nextCursor || loadingOlder || loadingMessages) {
      return
    }

    setLoadingOlder(true)
    try {
      const result = (await trpc.chat.getChannelMessages.query({
        orgId,
        channelId: selectedChannelId,
        cursor: nextCursor,
      })) as { messages: Message[]; nextCursor: string | null }

      setMessages((current) => [...result.messages, ...current])
      setNextCursor(result.nextCursor)
    } catch (loadError) {
      setError(
        loadError instanceof Error
          ? loadError.message
          : 'Failed to load older messages.'
      )
    } finally {
      setLoadingOlder(false)
    }
  }

  const { rootMessages, repliesByThread } = useMemo(() => {
    const roots: Message[] = []
    const replies: Record<string, Message[]> = {}
    for (const message of messages) {
      if (!message.threadRootMessageId) {
        roots.push(message)
      } else {
        if (!replies[message.threadRootMessageId]) {
          replies[message.threadRootMessageId] = []
        }
        replies[message.threadRootMessageId]!.push(message)
      }
    }
    return { rootMessages: roots, repliesByThread: replies }
  }, [messages])

  const selectedThreadRoot =
    rootMessages.find((message) => message.id === selectedThreadId) ?? null
  const selectedThreadReplies = selectedThreadRoot
    ? (repliesByThread[selectedThreadRoot.id] ?? [])
    : []
  const selectedChannel =
    channels.find((channel) => channel.id === selectedChannelId) ?? null

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

  async function createChannel(name: string): Promise<boolean> {
    setCreatingChannel(true)
    setCreateChannelError(null)

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
      router.replace(buildChatUrl({ channelId: created.id }))
      return true
    } catch (createError) {
      setCreateChannelError(
        createError instanceof Error
          ? createError.message
          : 'Failed to create channel.'
      )
      return false
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
    const optimisticId = makeTempId('message')
    const optimistic: Message = {
      id: optimisticId,
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
    } else {
      setSendingMain(true)
      setMessageDraft('')
      setRespondingRootIds((current) => [...current, optimisticId])
    }
    setMessages((current) => [...current, optimistic])

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
          if (message.id === optimisticId) {
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

      if (selectedThreadId === optimisticId) {
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
        current.filter((message) => message.id !== optimisticId)
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
          current.filter((id) => id !== optimisticId)
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
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

  return {
    channels,
    selectedChannel,
    selectedDirectId,
    selectedChannelId,
    selectedThreadId,
    selectedThreadRoot,
    selectedThreadReplies,
    rootMessages,
    repliesByThread,
    messageDraft,
    threadDraft,
    setMessageDraft,
    setThreadDraft,
    loadingChannels,
    loadingMessages,
    loadingOlder,
    hasMoreOlder: nextCursor !== null,
    creatingChannel,
    createChannelError,
    sendingMain,
    sendingThread,
    respondingRootIds,
    error,
    buildChatUrl,
    createChannel,
    sendMessage,
    loadOlderMessages,
    selectChannel,
    selectDirect,
    openThread,
    closeThread,
  }
}
