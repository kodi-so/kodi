'use client'

import { useRouter } from 'next/navigation'
import { ArrowUp } from 'lucide-react'
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
    <div className="flex min-h-screen flex-col px-4 py-8 sm:px-6 lg:px-8">
      <div className="mx-auto flex w-full max-w-4xl flex-1 flex-col justify-center">
        <div className="mb-8 text-center">
          <p className="text-sm text-muted-foreground">
            {activeOrg?.orgName ?? 'Workspace'}
          </p>
          <h1 className="mt-4 text-4xl tracking-[-0.05em] text-foreground sm:text-5xl">
            What can Kodi help with?
          </h1>
        </div>

        <div className="rounded-[1.75rem] border border-border bg-card p-4 shadow-soft sm:p-5">
          <Textarea
            value={prompt}
            onChange={(event) => setPrompt(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && !event.shiftKey) {
                event.preventDefault()
                openChat(prompt)
              }
            }}
            placeholder="Ask anything with the context your agent already has."
            rows={5}
            className="min-h-[180px] resize-none border-0 bg-transparent px-1 py-1 text-lg leading-8 shadow-none focus-visible:ring-0 focus-visible:ring-offset-0"
          />

          <div className="mt-4 flex items-center justify-end border-t border-border pt-4">
            <Button
              size="icon"
              className="h-12 w-12 rounded-2xl"
              disabled={!prompt.trim()}
              onClick={() => openChat(prompt)}
              aria-label="Ask Kodi"
            >
              <ArrowUp size={18} />
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}
