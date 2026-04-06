'use client'

import { useRouter } from 'next/navigation'
import { ArrowUp, Plus } from 'lucide-react'
import { Button, Textarea } from '@kodi/ui'
import { useOrg } from '@/lib/org-context'
import { useState } from 'react'

export default function DashboardPage() {
  const router = useRouter()
  const { activeOrg } = useOrg()
  const [prompt, setPrompt] = useState('')

  function openChat(nextPrompt: string) {
    const value = nextPrompt.trim()
    if (!value) return

    router.push(`/chat?prompt=${encodeURIComponent(value)}`)
  }

  return (
    <div className="flex min-h-screen flex-col px-4 py-10 sm:px-6 lg:px-8">
      <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col justify-center">
        <div className="mb-10 text-center">
          <p className="text-sm text-muted-foreground">
            {activeOrg?.orgName ?? 'Workspace'}
          </p>
          <h1 className="mt-6 text-4xl tracking-[-0.06em] text-foreground sm:text-5xl">
            What can I help with?
          </h1>
        </div>

        <div className="rounded-[1.9rem] border border-[#d9d3ca] bg-[#fffdfa] p-4 shadow-[0_18px_48px_-30px_rgba(38,32,18,0.28)]">
          <Textarea
            value={prompt}
            onChange={(event) => setPrompt(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && !event.shiftKey) {
                event.preventDefault()
                openChat(prompt)
              }
            }}
            placeholder="Ask anything"
            rows={4}
            className="min-h-[144px] resize-none border-0 bg-transparent px-1 py-1 text-[17px] leading-8 shadow-none focus-visible:ring-0 focus-visible:ring-offset-0"
          />

          <div className="mt-3 flex items-center justify-between border-t border-[#e8e2d7] pt-3">
            <button
              type="button"
              className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-[#ddd6cb] bg-white text-[#6e665b] transition-colors hover:bg-[#f5f1ea]"
              aria-label="New chat action"
            >
              <Plus size={16} />
            </button>

            <Button
              size="icon"
              className="h-10 w-10 rounded-full"
              disabled={!prompt.trim()}
              onClick={() => openChat(prompt)}
              aria-label="Ask Kodi"
            >
              <ArrowUp size={16} />
            </Button>
          </div>
        </div>

        <p className="mt-4 text-center text-xs text-muted-foreground">
          Kodi responds using the context already connected to this workspace.
        </p>
      </div>
    </div>
  )
}
