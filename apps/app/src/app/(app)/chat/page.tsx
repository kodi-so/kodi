'use client'

import { useSearchParams } from 'next/navigation'
import { useOrg } from '@/lib/org-context'
import { ChatInterface } from './_components/chat-interface'

export default function ChatPage() {
  const { activeOrg } = useOrg()
  const searchParams = useSearchParams()
  const initialPrompt = searchParams.get('prompt')
  const initialChannelId = searchParams.get('channel')
  const initialThreadId = searchParams.get('thread')

  if (!activeOrg) {
    return (
      <div className="flex h-full items-center justify-center px-4 text-sm text-muted-foreground">
        Select a team to start chatting.
      </div>
    )
  }

  return (
    <div className="flex h-full flex-col">
      <ChatInterface
        orgId={activeOrg.orgId}
        initialPrompt={initialPrompt}
        initialChannelId={initialChannelId}
        initialThreadId={initialThreadId}
      />
    </div>
  )
}
