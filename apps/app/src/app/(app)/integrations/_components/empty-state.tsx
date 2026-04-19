/**
 * TODO(onboarding): replace this with a curated recommended list.
 * Product hasn't designed this yet; likely:
 *   - Hero copy + 3–4 pinned toolkit suggestions (Slack, Gmail, Linear, Calendar)
 *   - Each pin = one-tap connect via createConnectLink
 *   - Possibly surfaced by team size / role once we collect that.
 */
'use client'

import { Plug } from 'lucide-react'
import { Button } from '@kodi/ui/components/button'

export function EmptyState({ onBrowse }: { onBrowse: () => void }) {
  return (
    <div className="rounded-xl border border-dashed border-border bg-card p-10 text-center">
      <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-secondary">
        <Plug className="h-6 w-6 text-muted-foreground" aria-hidden />
      </div>
      <h2 className="text-base font-semibold text-foreground">
        Connect your first integration
      </h2>
      <p className="mx-auto mt-2 max-w-sm text-sm text-muted-foreground">
        Kodi acts across Slack, Linear, Gmail and more. Pick one to start.
      </p>
      <Button type="button" className="mt-5" onClick={onBrowse}>
        Browse integrations
      </Button>
    </div>
  )
}
