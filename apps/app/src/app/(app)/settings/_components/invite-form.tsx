'use client'

import { useState } from 'react'
import { trpc } from '@/lib/trpc'
import { Mail } from 'lucide-react'
import { toast } from 'sonner'
import {
  Badge,
  Button,
  Card,
  CardContent,
  Input,
} from '@kodi/ui'

type PendingInvite = {
  id: string
  email: string
  expiresAt: Date | string
}

interface InviteFormProps {
  orgId: string
  pendingInvites: PendingInvite[]
  onInviteSent: () => void
  onInviteRevoked: () => void
}

function formatExpiry(date: Date | string): string {
  const d = typeof date === 'string' ? new Date(date) : date
  return d.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
}

export function InviteForm({
  orgId,
  pendingInvites,
  onInviteSent,
  onInviteRevoked,
}: InviteFormProps) {
  const [email, setEmail] = useState('')
  const [inviting, setInviting] = useState(false)
  const [revoking, setRevoking] = useState<string | null>(null)

  async function handleInvite(e: React.FormEvent) {
    e.preventDefault()
    if (!email.trim()) return
    setInviting(true)
    try {
      await trpc.invite.send.mutate({ orgId, email: email.trim() })
      setEmail('')
      toast.success(`Invite sent to ${email.trim()}`)
      onInviteSent()
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to send invite'
      toast.error(msg)
    } finally {
      setInviting(false)
    }
  }

  async function handleRevoke(inviteId: string, inviteEmail: string) {
    setRevoking(inviteId)
    try {
      await trpc.invite.revoke.mutate({ orgId, inviteId })
      toast.success(`Invite for ${inviteEmail} revoked`)
      onInviteRevoked()
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to revoke invite'
      toast.error(msg)
    } finally {
      setRevoking(null)
    }
  }

  return (
    <div className="space-y-4">
      {/* Invite form */}
      <form onSubmit={handleInvite} className="flex gap-3">
        <div className="relative flex-1">
          <Mail
            size={16}
            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-brand-subtle"
          />
          <Input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="colleague@company.com"
            required
            className="h-11 border-brand-line bg-brand-elevated pl-9 pr-4"
          />
        </div>
        <Button
          type="submit"
          disabled={inviting || !email.trim()}
          className="h-11 shrink-0 gap-2 px-5"
        >
          {inviting && (
            <span className="h-4 w-4 animate-spin rounded-full border-2 border-current/30 border-t-current" />
          )}
          Invite
        </Button>
      </form>

      {/* Pending invites */}
      {pendingInvites.length > 0 && (
        <div>
          <p className="mb-2 text-xs font-medium uppercase tracking-wider text-brand-subtle">
            Pending invites
          </p>
          <Card className="overflow-hidden rounded-xl border-brand-line">
            <CardContent className="divide-y divide-border p-0">
              {pendingInvites.map((invite) => (
                <div
                  key={invite.id}
                  className="flex items-center gap-4 px-4 py-3 transition-colors hover:bg-brand-muted"
                >
                  <div className="flex-1 min-w-0">
                    <p className="truncate text-sm text-foreground">
                      {invite.email}
                    </p>
                    <p className="text-xs text-brand-quiet">
                      Expires {formatExpiry(invite.expiresAt)}
                    </p>
                  </div>
                  <Badge variant="neutral" className="hidden sm:inline-flex">
                    Pending
                  </Badge>
                  <Button
                    onClick={() => handleRevoke(invite.id, invite.email)}
                    disabled={revoking === invite.id}
                    variant="outline"
                    size="sm"
                    className="border-brand-line text-brand-quiet hover:border-brand-danger hover:bg-brand-danger-soft hover:text-brand-danger"
                  >
                    {revoking === invite.id && (
                      <span className="h-3 w-3 animate-spin rounded-full border-2 border-current/30 border-t-current" />
                    )}
                    Revoke
                  </Button>
                </div>
              ))}
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  )
}
