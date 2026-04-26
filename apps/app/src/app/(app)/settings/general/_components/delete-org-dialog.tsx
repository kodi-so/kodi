'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { AlertTriangle } from 'lucide-react'
import { trpc } from '@/lib/trpc'
import { useOrg } from '@/lib/org-context'
import { Alert, AlertDescription } from '@kodi/ui/components/alert'
import { Button } from '@kodi/ui/components/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
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

  function handleOpenChange(open: boolean) {
    if (!deleting) {
      setConfirmation('')
      setError(null)
      onOpenChange(open)
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-destructive">
            <AlertTriangle size={18} />
            Delete workspace
          </DialogTitle>
          <DialogDescription>
            This action is permanent and cannot be undone. It will:
          </DialogDescription>
        </DialogHeader>

        <ul className="ml-4 list-disc space-y-1 text-sm text-muted-foreground">
          <li>Cancel the active subscription</li>
          <li>Terminate all infrastructure (EC2, DNS, LiteLLM)</li>
          <li>Delete all workspace data, members, and history</li>
        </ul>

        <div className="space-y-2">
          <Label htmlFor="confirm-name" className="text-sm font-medium">
            Type <span className="font-semibold text-foreground">{orgName}</span> to confirm
          </Label>
          <Input
            id="confirm-name"
            value={confirmation}
            onChange={(e) => setConfirmation(e.target.value)}
            placeholder={orgName}
            disabled={deleting}
            className="h-10"
          />
        </div>

        {error && (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={() => handleOpenChange(false)} disabled={deleting}>
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
