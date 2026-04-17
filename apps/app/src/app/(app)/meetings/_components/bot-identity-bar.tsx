'use client'

import { useState } from 'react'
import { Bot, Check, Copy } from 'lucide-react'
import {
  Button,
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@kodi/ui'

export function BotIdentityButton({
  displayName,
  inviteEmail,
  onError,
}: {
  displayName: string
  inviteEmail: string
  onError: (message: string) => void
}) {
  const [copiedField, setCopiedField] = useState<
    'display-name' | 'invite-email' | null
  >(null)

  async function copy(value: string, field: 'display-name' | 'invite-email') {
    try {
      await navigator.clipboard.writeText(value)
      setCopiedField(field)
      window.setTimeout(() => {
        setCopiedField((current) => (current === field ? null : current))
      }, 1800)
    } catch (err) {
      onError(
        err instanceof Error ? err.message : 'Failed to copy to clipboard.'
      )
    }
  }

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="sm" className="gap-1.5 text-muted-foreground">
          <Bot size={14} />
          Bot identity
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80">
        <p className="text-[11px] font-medium uppercase tracking-widest text-muted-foreground">
          Bot identity
        </p>
        <div className="mt-3 space-y-3">
          <div className="flex items-center justify-between gap-2">
            <div className="min-w-0">
              <p className="text-[11px] text-muted-foreground">Display name</p>
              <p className="text-sm font-medium text-foreground">{displayName}</p>
            </div>
            <button
              type="button"
              onClick={() => void copy(displayName, 'display-name')}
              className="shrink-0 rounded-md p-1.5 text-muted-foreground transition-colors hover:text-foreground"
            >
              {copiedField === 'display-name' ? <Check size={13} /> : <Copy size={13} />}
            </button>
          </div>
          <div className="h-px bg-border" />
          <div className="flex items-center justify-between gap-2">
            <div className="min-w-0">
              <p className="text-[11px] text-muted-foreground">Invite email</p>
              <p className="break-all text-sm font-medium text-foreground">{inviteEmail}</p>
            </div>
            <button
              type="button"
              onClick={() => void copy(inviteEmail, 'invite-email')}
              className="shrink-0 rounded-md p-1.5 text-muted-foreground transition-colors hover:text-foreground"
            >
              {copiedField === 'invite-email' ? <Check size={13} /> : <Copy size={13} />}
            </button>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  )
}
