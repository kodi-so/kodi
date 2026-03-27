'use client'

import { useState } from 'react'
import { trpc } from '@/lib/trpc'
import { X } from 'lucide-react'

type Member = {
  userId: string
  name: string
}

interface RemoveMemberDialogProps {
  member: Member
  orgId: string
  orgName: string
  onClose: () => void
  onRemoved: () => void
}

export function RemoveMemberDialog({ member, orgId, orgName, onClose, onRemoved }: RemoveMemberDialogProps) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleConfirm() {
    setLoading(true)
    setError(null)
    try {
      await trpc.org.removeMember.mutate({ orgId, userId: member.userId })
      onRemoved()
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to remove member'
      setError(msg)
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Dialog */}
      <div className="relative z-10 w-full max-w-md bg-zinc-900 border border-zinc-800 rounded-2xl p-6 shadow-2xl">
        <div className="flex items-start justify-between mb-4">
          <div>
            <h2 className="text-white font-semibold text-lg">Remove member</h2>
            <p className="text-zinc-400 text-sm mt-1">
              Remove <span className="text-white font-medium">{member.name}</span> from{' '}
              <span className="text-white font-medium">{orgName}</span>?
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-zinc-500 hover:text-white transition-colors -mt-1"
            aria-label="Close"
          >
            <X size={20} />
          </button>
        </div>

        <p className="text-zinc-500 text-sm mb-6">
          They will lose access immediately. This action cannot be undone.
        </p>

        {error && (
          <div className="mb-4 px-3 py-2 bg-red-500/10 border border-red-500/20 rounded-lg text-red-400 text-sm">
            {error}
          </div>
        )}

        <div className="flex gap-3 justify-end">
          <button
            onClick={onClose}
            disabled={loading}
            className="px-4 py-2 rounded-lg text-sm font-medium text-zinc-400 hover:text-white border border-zinc-700 hover:bg-zinc-800 transition-colors disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            onClick={handleConfirm}
            disabled={loading}
            className="px-4 py-2 rounded-lg text-sm font-medium bg-red-600 hover:bg-red-700 text-white transition-colors disabled:opacity-50 flex items-center gap-2"
          >
            {loading && (
              <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            )}
            Remove member
          </button>
        </div>
      </div>
    </div>
  )
}
