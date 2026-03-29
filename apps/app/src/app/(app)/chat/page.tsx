'use client'

import { useOrg } from '@/lib/org-context'
import { ChatInterface } from './_components/chat-interface'

export default function ChatPage() {
  const { activeOrg } = useOrg()

  if (!activeOrg) {
    return (
      <div className="flex items-center justify-center h-full text-zinc-500 text-sm">
        Select a team to start chatting.
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full">
      <ChatInterface orgId={activeOrg.orgId} />
    </div>
  )
}
