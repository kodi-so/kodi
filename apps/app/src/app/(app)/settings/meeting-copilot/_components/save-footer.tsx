'use client'

import { Alert, AlertDescription } from '@kodi/ui/components/alert'
import { Button } from '@kodi/ui/components/button'

interface SaveFooterProps {
  error: string | null
  isOwner: boolean
  isDirty: boolean
  saving: boolean
  saved: boolean
}

export function SaveFooter({
  error,
  isOwner,
  isDirty,
  saving,
  saved,
}: SaveFooterProps) {
  return (
    <>
      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {isOwner && (
        <div className="flex items-center gap-3">
          <Button type="submit" disabled={!isDirty || saving}>
            {saving ? 'Saving\u2026' : 'Save copilot defaults'}
          </Button>
          {saved && (
            <span className="text-sm font-medium text-brand-success">
              Saved
            </span>
          )}
        </div>
      )}
    </>
  )
}
