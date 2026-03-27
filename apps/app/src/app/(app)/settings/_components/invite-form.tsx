'use client'

import { useState } from 'react'
import { trpc } from '@/lib/trpc'
import { Mail, X } from 'lucide-react'

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
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

type Toast = { type: 'success' | 'error'; message: string }

export function InviteForm({ orgId, pendingInvites, onInviteSent, onInviteRevoked }: InviteFormProps) {
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
      showToast({ type: 'success', message: `Invite for ${inviteEmail} revoked` })
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
        <div
          className={`flex items-center gap-3 px-4 py-3 rounded-lg border text-sm ${
            toast.type === 'success'
              ? 'bg-green-500/10 border-green-500/20 text-green-400'
              : 'bg-red-500/10 border-red-500/20 text-red-400'
          }`}
        >
          <span className="flex-1">{toast.message}</span>
          <button onClick={() => setToast(null)} className="text-current opacity-60 hover:opacity-100">
            <X size={16} />
          </button>
        </div>
      )}

      {/* Invite form */}
      <form onSubmit={handleInvite} className="flex gap-3">
        <div className="relative flex-1">
          <Mail size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500 pointer-events-none" />
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="colleague@company.com"
            required
            className="w-full pl-9 pr-4 py-2.5 bg-zinc-900 border border-zinc-700 rounded-lg text-sm text-white placeholder-zinc-500 focus:outline-none focus:border-indigo-500/60 focus:ring-1 focus:ring-indigo-500/40 transition-colors"
          />
        </div>
        <button
          type="submit"
          disabled={inviting || !email.trim()}
          className="px-4 py-2.5 rounded-lg text-sm font-medium bg-indigo-600 hover:bg-indigo-700 text-white transition-colors disabled:opacity-50 flex items-center gap-2 flex-shrink-0"
        >
          {inviting && (
            <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
          )}
          Invite
        </button>
      </form>

      {/* Pending invites */}
      {pendingInvites.length > 0 && (
        <div>
          <p className="text-xs font-medium text-zinc-500 uppercase tracking-wider mb-2">
            Pending invites
          </p>
          <div className="divide-y divide-zinc-800 rounded-xl border border-zinc-800 overflow-hidden">
            {pendingInvites.map((invite) => (
              <div
                key={invite.id}
                className="flex items-center gap-4 px-4 py-3 bg-zinc-900 hover:bg-zinc-800/50 transition-colors"
              >
                <div className="flex-1 min-w-0">
                  <p className="text-white text-sm truncate">{invite.email}</p>
                  <p className="text-zinc-500 text-xs">Expires {formatExpiry(invite.expiresAt)}</p>
                </div>
                <button
                  onClick={() => handleRevoke(invite.id, invite.email)}
                  disabled={revoking === invite.id}
                  className="text-xs px-3 py-1.5 rounded-lg border border-zinc-700 text-zinc-400 hover:text-red-400 hover:border-red-500/30 hover:bg-red-500/10 transition-colors disabled:opacity-50 flex items-center gap-1.5 flex-shrink-0"
                >
                  {revoking === invite.id && (
                    <span className="w-3 h-3 border-2 border-current/30 border-t-current rounded-full animate-spin" />
                  )}
                  Revoke
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
