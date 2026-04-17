'use client'

import { useState } from 'react'
import { trpc } from '@/lib/trpc'
import { X } from 'lucide-react'
import { Alert, AlertDescription } from '@kodi/ui/components/alert'
import { Button } from '@kodi/ui/components/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@kodi/ui/components/card'

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
      <div
        className="kodi-overlay-scrim absolute inset-0 backdrop-blur-sm"
        onClick={onClose}
      />

      <Card className="relative z-10 w-full max-w-md rounded-2xl border-border shadow-2xl">
        <CardHeader className="mb-2 flex-row items-start justify-between space-y-0">
          <div>
            <CardTitle className="text-lg text-foreground">
              Remove member
            </CardTitle>
            <CardDescription className="mt-1 text-muted-foreground">
              Remove{' '}
              <span className="font-medium text-foreground">{member.name}</span>{' '}
              from{' '}
              <span className="font-medium text-foreground">{orgName}</span>?
            </CardDescription>
          </div>
          <Button
            onClick={onClose}
            variant="ghost"
            size="icon"
            className="-mt-1 h-auto w-auto p-0 text-muted-foreground transition-colors hover:text-foreground hover:bg-transparent"
            aria-label="Close"
          >
            <X size={20} />
          </Button>
        </CardHeader>

        <CardContent>
          <p className="mb-6 text-sm text-muted-foreground">
            They will lose access immediately. This action cannot be undone.
          </p>

          {error && (
            <Alert variant="destructive" className="mb-4">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          <div className="flex justify-end gap-3">
            <Button
              onClick={onClose}
              disabled={loading}
              variant="outline"
              className="text-muted-foreground"
            >
              Cancel
            </Button>
            <Button
              onClick={handleConfirm}
              disabled={loading}
              variant="destructive"
              className="gap-2"
            >
              {loading && (
                <span className="h-4 w-4 animate-spin rounded-full border-2 border-current/30 border-t-current" />
              )}
              Remove member
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
