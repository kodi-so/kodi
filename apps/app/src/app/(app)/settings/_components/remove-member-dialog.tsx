'use client'

import { useState } from 'react'
import { trpc } from '@/lib/trpc'
import { X } from 'lucide-react'
import {
  Alert,
  AlertDescription,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@kodi/ui'

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

export function RemoveMemberDialog({
  member,
  orgId,
  orgName,
  onClose,
  onRemoved,
}: RemoveMemberDialogProps) {
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
      <Card className="relative z-10 w-full max-w-md rounded-2xl border-zinc-800 bg-zinc-900 shadow-2xl">
        <CardHeader className="mb-2 flex-row items-start justify-between space-y-0">
          <div>
            <CardTitle className="text-lg text-white">Remove member</CardTitle>
            <CardDescription className="mt-1 text-zinc-400">
              Remove{' '}
              <span className="text-white font-medium">{member.name}</span> from{' '}
              <span className="text-white font-medium">{orgName}</span>?
            </CardDescription>
          </div>
          <button
            onClick={onClose}
            className="text-zinc-500 hover:text-white transition-colors -mt-1"
            aria-label="Close"
          >
            <X size={20} />
          </button>
        </CardHeader>

        <CardContent>
          <p className="mb-6 text-sm text-zinc-500">
            They will lose access immediately. This action cannot be undone.
          </p>

          {error && (
            <Alert
              variant="destructive"
              className="mb-4 border-red-500/20 bg-red-500/10 text-red-400"
            >
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          <div className="flex gap-3 justify-end">
            <Button
              onClick={onClose}
              disabled={loading}
              variant="outline"
              className="border-zinc-700 text-zinc-400 hover:bg-zinc-800 hover:text-white"
            >
              Cancel
            </Button>
            <Button
              onClick={handleConfirm}
              disabled={loading}
              variant="destructive"
              className="gap-2 bg-red-600 text-white hover:bg-red-700"
            >
              {loading && (
                <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              )}
              Remove member
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
