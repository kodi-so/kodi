'use client'

import { useState } from 'react'
import { Check, Copy, UserRound } from 'lucide-react'

export function BotIdentityBar({
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

  async function copyIdentityValue(
    value: string,
    field: 'display-name' | 'invite-email'
  ) {
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
    <div className="mt-12 rounded-xl border border-border bg-card px-5 py-4 shadow-sm">
      <p className="text-[11px] font-medium uppercase tracking-widest text-muted-foreground">
        Bot identity
      </p>
      <div className="mt-3 flex flex-col gap-4 sm:flex-row sm:items-center sm:gap-6">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-secondary text-muted-foreground ring-1 ring-border">
            <UserRound size={15} />
          </div>
          <div className="min-w-0">
            <p className="text-[11px] text-muted-foreground">
              Display name
            </p>
            <p className="text-sm font-medium text-foreground">
              {displayName}
            </p>
          </div>
          <button
            type="button"
            onClick={() =>
              void copyIdentityValue(displayName, 'display-name')
            }
            className="rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
            title="Copy display name"
          >
            {copiedField === 'display-name' ? (
              <Check size={13} />
            ) : (
              <Copy size={13} />
            )}
          </button>
        </div>
        <div className="hidden h-8 w-px bg-border sm:block" />
        <div className="flex items-center gap-3">
          <div className="min-w-0">
            <p className="text-[11px] text-muted-foreground">
              Invite email
            </p>
            <p className="break-all text-sm font-medium text-foreground">
              {inviteEmail}
            </p>
          </div>
          <button
            type="button"
            onClick={() =>
              void copyIdentityValue(inviteEmail, 'invite-email')
            }
            className="rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
            title="Copy invite email"
          >
            {copiedField === 'invite-email' ? (
              <Check size={13} />
            ) : (
              <Copy size={13} />
            )}
          </button>
        </div>
      </div>
    </div>
  )
}
