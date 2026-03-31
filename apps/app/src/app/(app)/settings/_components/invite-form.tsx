'use client'

import { useState } from 'react'
import { trpc } from '@/lib/trpc'
import { Mail, X } from 'lucide-react'
import {
  Alert,
  AlertDescription,
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

type Toast = { type: 'success' | 'error'; message: string }

export function InviteForm({
  orgId,
  pendingInvites,
  onInviteSent,
  onInviteRevoked,
}: InviteFormProps) {
  const [email, setEmail] = useState('')
  const [inviting, setInviting] = useState(false)
  const [revoking, setRevoking] = useState<string | null>(null)
  const [toast, setToast] = useState<Toast | null>(null)

  function showToast(t: Toast) {
    setToast(t)
    setTimeout(() => setToast(null), 4000)
  }

  async function handleInvite(e: React.FormEvent) {
    e.preventDefault()
    if (!email.trim()) return
    setInviting(true)
    try {
      await trpc.invite.send.mutate({ orgId, email: email.trim() })
      setEmail('')
      showToast({ type: 'success', message: `Invite sent to ${email.trim()}` })
      onInviteSent()
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to send invite'
      showToast({ type: 'error', message: msg })
    } finally {
      setInviting(false)
    }
  }

  async function handleRevoke(inviteId: string, inviteEmail: string) {
    setRevoking(inviteId)
    try {
      await trpc.invite.revoke.mutate({ orgId, inviteId })
      showToast({
        type: 'success',
        message: `Invite for ${inviteEmail} revoked`,
      })
      onInviteRevoked()
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to revoke invite'
      showToast({ type: 'error', message: msg })
    } finally {
      setRevoking(null)
    }
  }

  return (
    <div className="space-y-4">
      {/* Toast notification */}
      {toast && (
        <Alert
          className={`flex items-center gap-3 px-4 py-3 text-sm ${
            toast.type === 'success'
              ? 'border-green-500/20 bg-green-500/10 text-green-400'
              : 'border-red-500/20 bg-red-500/10 text-red-400'
          }`}
        >
          <span className="flex-1">{toast.message}</span>
          <button
            onClick={() => setToast(null)}
            className="text-current opacity-60 hover:opacity-100"
          >
            <X size={16} />
          </button>
        </Alert>
      )}

      {/* Invite form */}
      <form onSubmit={handleInvite} className="flex gap-3">
        <div className="relative flex-1">
          <Mail
            size={16}
            className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500 pointer-events-none"
          />
          <Input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="colleague@company.com"
            required
            className="h-11 border-zinc-700 bg-zinc-900 pl-9 pr-4 text-white placeholder:text-zinc-500 focus-visible:ring-indigo-500"
          />
        </div>
        <Button
          type="submit"
          disabled={inviting || !email.trim()}
          className="h-11 shrink-0 gap-2 bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-50"
        >
          {inviting && (
            <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
          )}
          Invite
        </Button>
      </form>

      {/* Pending invites */}
      {pendingInvites.length > 0 && (
        <div>
          <p className="text-xs font-medium text-zinc-500 uppercase tracking-wider mb-2">
            Pending invites
          </p>
          <Card className="overflow-hidden rounded-xl border-zinc-800 bg-zinc-900">
            <CardContent className="divide-y divide-zinc-800 p-0">
              {pendingInvites.map((invite) => (
                <div
                  key={invite.id}
                  className="flex items-center gap-4 px-4 py-3 transition-colors hover:bg-zinc-800/50"
                >
                  <div className="flex-1 min-w-0">
                    <p className="text-white text-sm truncate">
                      {invite.email}
                    </p>
                    <p className="text-zinc-500 text-xs">
                      Expires {formatExpiry(invite.expiresAt)}
                    </p>
                  </div>
                  <Badge
                    variant="outline"
                    className="hidden border-zinc-700 text-zinc-500 sm:inline-flex"
                  >
                    Pending
                  </Badge>
                  <Button
                    onClick={() => handleRevoke(invite.id, invite.email)}
                    disabled={revoking === invite.id}
                    variant="outline"
                    size="sm"
                    className="border-zinc-700 text-zinc-400 hover:border-red-500/30 hover:bg-red-500/10 hover:text-red-400"
                  >
                    {revoking === invite.id && (
                      <span className="w-3 h-3 border-2 border-current/30 border-t-current rounded-full animate-spin" />
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
