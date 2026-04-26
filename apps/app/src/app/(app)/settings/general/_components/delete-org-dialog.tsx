'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { trpc } from '@/lib/trpc'
import { useOrg } from '@/lib/org-context'
import { Button } from '@kodi/ui/components/button'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@kodi/ui/components/dialog'
import { Input } from '@kodi/ui/components/input'
import { Label } from '@kodi/ui/components/label'

interface DeleteOrgDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  orgName: string
  orgId: string
}

export function DeleteOrgDialog({ open, onOpenChange, orgName, orgId }: DeleteOrgDialogProps) {
  const router = useRouter()
  const { refreshOrgs } = useOrg()
  const [confirmation, setConfirmation] = useState('')
  const [deleting, setDeleting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const isConfirmed = confirmation.trim() === orgName

  async function handleDelete() {
    if (!isConfirmed) return
    setDeleting(true)
    setError(null)
    try {
      await trpc.org.delete.mutate({ orgId })
      await refreshOrgs()
      onOpenChange(false)
      router.replace('/chat')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete workspace')
      setDeleting(false)
    }
  }

  function handleOpenChange(next: boolean) {
    if (!deleting) {
      setConfirmation('')
      setError(null)
      onOpenChange(next)
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-md gap-0 p-0 overflow-hidden">
        {/* Header */}
        <DialogHeader className="px-6 pt-6 pb-4">
          <DialogTitle className="text-base font-semibold text-foreground">
            Delete workspace
          </DialogTitle>
        </DialogHeader>

        {/* Warning banner */}
        <div className="mx-6 mb-5 rounded-lg border border-destructive/20 bg-destructive/5 px-4 py-3">
          <p className="text-sm font-medium text-destructive mb-2">
            This action is permanent and cannot be undone.
          </p>
          <ul className="space-y-1 text-sm text-muted-foreground">
            <li className="flex items-start gap-2">
              <span className="mt-[7px] h-1.5 w-1.5 shrink-0 rounded-full bg-muted-foreground/60" />
              Cancel the active subscription
            </li>
            <li className="flex items-start gap-2">
              <span className="mt-[7px] h-1.5 w-1.5 shrink-0 rounded-full bg-muted-foreground/60" />
              Terminate all infrastructure (EC2, DNS, LiteLLM)
            </li>
            <li className="flex items-start gap-2">
              <span className="mt-[7px] h-1.5 w-1.5 shrink-0 rounded-full bg-muted-foreground/60" />
              Delete all workspace data, members, and history
            </li>
          </ul>
        </div>

        {/* Confirmation input */}
        <div className="px-6 pb-5 space-y-2">
          <Label htmlFor="confirm-name" className="text-sm text-muted-foreground">
            Type <span className="font-semibold text-foreground">{orgName}</span> to confirm
          </Label>
          <Input
            id="confirm-name"
            value={confirmation}
            onChange={(e) => setConfirmation(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && isConfirmed) void handleDelete() }}
            placeholder={orgName}
            disabled={deleting}
            className="h-10"
            autoComplete="off"
          />
          {error && (
            <p className="text-sm text-destructive">{error}</p>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 border-t border-border px-6 py-4 bg-muted/30">
          <Button
            variant="ghost"
            onClick={() => handleOpenChange(false)}
            disabled={deleting}
          >
            Cancel
          </Button>
          <Button
            variant="destructive"
            onClick={() => void handleDelete()}
            disabled={!isConfirmed || deleting}
          >
            {deleting ? 'Deleting…' : 'Delete workspace'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
