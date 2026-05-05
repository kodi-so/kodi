'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Plus, X } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@kodi/ui/components/button'
import { Input } from '@kodi/ui/components/input'
import { cn } from '@kodi/ui/lib/utils'
import { trpc } from '@/lib/trpc'
import { useOnboarding } from '../lib/onboarding-context'

const MAX_EMAILS = 10

function isValidEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)
}

export function InviteTeamStep() {
  const router = useRouter()
  const { orgId, setInvitesSentCount, isReady } = useOnboarding()

  const [emails, setEmails] = useState<string[]>([''])
  const [errors, setErrors] = useState<(string | null)[]>([null])
  const [submitting, setSubmitting] = useState(false)
  const [sentCount, setSentCount] = useState<number | null>(null)

  function setEmail(index: number, value: string) {
    setEmails((prev) => {
      const next = [...prev]
      next[index] = value
      return next
    })
    // Clear error on change
    setErrors((prev) => {
      const next = [...prev]
      next[index] = null
      return next
    })
  }

  function addEmail() {
    if (emails.length >= MAX_EMAILS) return
    setEmails((prev) => [...prev, ''])
    setErrors((prev) => [...prev, null])
  }

  function removeEmail(index: number) {
    setEmails((prev) => prev.filter((_, i) => i !== index))
    setErrors((prev) => prev.filter((_, i) => i !== index))
  }

  function validateEmails(): boolean {
    const newErrors = emails.map((email) => {
      if (!email.trim()) return null // empty = skip
      if (!isValidEmail(email.trim())) return 'Invalid email address'
      return null
    })
    setErrors(newErrors)
    return newErrors.every((e) => e === null)
  }

  async function handleSendInvites(e: React.FormEvent) {
    e.preventDefault()
    if (!validateEmails()) return

    const toInvite = emails.map((e) => e.trim()).filter(isValidEmail)
    if (toInvite.length === 0) {
      handleSkip()
      return
    }

    setSubmitting(true)
    let sent = 0
    const newErrors = [...errors]

    await Promise.allSettled(
      toInvite.map(async (email, i) => {
        try {
          await trpc.invite.send.mutate({ orgId, email })
          sent++
        } catch (err: unknown) {
          const code = (err as { data?: { code?: string } })?.data?.code
          if (code === 'CONFLICT') {
            // Already invited or already a member — treat as success
            sent++
          } else {
            const idx = emails.findIndex((e) => e.trim() === email)
            if (idx !== -1) {
              newErrors[idx] = 'Failed to send invite'
            }
          }
        }
      })
    )

    setErrors(newErrors)
    setSubmitting(false)

    if (sent > 0) {
      setInvitesSentCount(sent)
      setSentCount(sent)
    }

    // If there were no per-email failures, advance
    if (newErrors.every((e) => e === null)) {
      router.push('?step=done')
    }
  }

  function handleSkip() {
    router.push('?step=done')
  }

  if (sentCount !== null) {
    return (
      <div className="space-y-8">
        <div className="space-y-1.5">
          <h1 className="text-2xl font-semibold tracking-tight">Invites sent!</h1>
          <p className="text-sm text-muted-foreground">
            We&apos;ve notified{' '}
            <strong className="text-foreground">{sentCount}</strong>{' '}
            {sentCount === 1 ? 'teammate' : 'teammates'}.
          </p>
        </div>
        <Button onClick={() => router.push('?step=done')} className="w-full">
          Continue
        </Button>
      </div>
    )
  }

  return (
    <form onSubmit={handleSendInvites} className="space-y-6">
      <div className="space-y-1.5">
        <h1 className="text-2xl font-semibold tracking-tight">Invite your team</h1>
        <p className="text-sm text-muted-foreground">
          Add teammates so they can join your workspace. You can invite more from Settings later.
        </p>
      </div>

      <div className="space-y-2">
        {emails.map((email, i) => (
          <div key={i} className="space-y-1">
            <div className="flex gap-2">
              <Input
                type="email"
                value={email}
                onChange={(e) => setEmail(i, e.target.value)}
                onBlur={() => {
                  if (email.trim() && !isValidEmail(email.trim())) {
                    setErrors((prev) => {
                      const next = [...prev]
                      next[i] = 'Invalid email address'
                      return next
                    })
                  }
                }}
                placeholder="teammate@company.com"
                disabled={submitting}
                className={cn(errors[i] && 'border-destructive focus-visible:ring-destructive')}
              />
              {emails.length > 1 && (
                <button
                  type="button"
                  onClick={() => removeEmail(i)}
                  className="shrink-0 text-muted-foreground hover:text-foreground"
                  disabled={submitting}
                >
                  <X className="h-4 w-4" />
                </button>
              )}
            </div>
            {errors[i] && (
              <p className="text-xs text-destructive">{errors[i]}</p>
            )}
          </div>
        ))}

        {emails.length < MAX_EMAILS && (
          <button
            type="button"
            onClick={addEmail}
            disabled={submitting}
            className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
          >
            <Plus className="h-4 w-4" />
            Add another email
          </button>
        )}
      </div>

      <div className="flex flex-col gap-2">
        <Button
          type="submit"
          className="w-full"
          disabled={submitting || !isReady}
        >
          {submitting ? 'Sending…' : 'Send invites'}
        </Button>
        <button
          type="button"
          onClick={handleSkip}
          className="text-sm text-muted-foreground underline-offset-2 hover:underline"
        >
          Skip for now
        </button>
      </div>
    </form>
  )
}
