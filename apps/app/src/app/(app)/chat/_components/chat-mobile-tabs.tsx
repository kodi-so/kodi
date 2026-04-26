'use client'

import { useState } from 'react'
import { Plus } from 'lucide-react'
import { Button } from '@kodi/ui/components/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@kodi/ui/components/dialog'
import { Input } from '@kodi/ui/components/input'
import { cn } from '@kodi/ui/lib/utils'
import { KODI_DM_ID, type Channel } from './chat-types'

export function MobileConversationTabs({
  channels,
  selectedDirectId,
  selectedChannelId,
  creatingChannel,
  createChannelError,
  onSelectDirect,
  onSelectChannel,
  onCreateChannel,
}: {
  channels: Channel[]
  selectedDirectId: string | null
  selectedChannelId: string | null
  creatingChannel: boolean
  createChannelError: string | null
  onSelectDirect: (directId: string) => void
  onSelectChannel: (channelId: string) => void
  onCreateChannel: (name: string) => Promise<boolean>
}) {
  const [dialogOpen, setDialogOpen] = useState(false)
  const [draft, setDraft] = useState('')

  async function handleCreate() {
    const name = draft.trim()
    if (!name) return
    const ok = await onCreateChannel(name)
    if (ok) {
      setDraft('')
      setDialogOpen(false)
    }
  }

  return (
    <div className="shrink-0 border-b border-border bg-background px-4 py-2 lg:hidden">
      <div className="flex items-center gap-2 overflow-x-auto">
        <button
          type="button"
          onClick={() => onSelectDirect(KODI_DM_ID)}
          className={cn(
            'inline-flex shrink-0 items-center gap-2 whitespace-nowrap rounded-full border px-3 py-1 text-[13px] transition-colors',
            selectedDirectId === KODI_DM_ID
              ? 'border-primary/25 bg-accent text-foreground'
              : 'border-border text-muted-foreground hover:bg-brand-muted/40'
          )}
        >
          <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-accent text-[10px] font-semibold text-foreground">
            K
          </span>
          Kodi
        </button>

        {channels.map((channel) => (
          <button
            key={channel.id}
            type="button"
            onClick={() => onSelectChannel(channel.id)}
            className={cn(
              'shrink-0 whitespace-nowrap rounded-full border px-3 py-1 text-[13px] transition-colors',
              selectedChannelId === channel.id && !selectedDirectId
                ? 'border-brand-info/25 bg-brand-info-soft text-brand-info'
                : 'border-border text-muted-foreground hover:bg-brand-muted/40'
            )}
          >
            #{channel.slug}
          </button>
        ))}

        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setDialogOpen(true)}
            className="h-7 w-7 shrink-0 rounded-full border border-border p-1 text-muted-foreground hover:bg-brand-muted/40 hover:text-foreground"
            aria-label="Create channel"
          >
            <Plus size={14} />
          </Button>

          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>Create a channel</DialogTitle>
              <DialogDescription>
                Channels are for focused discussions with your workspace.
              </DialogDescription>
            </DialogHeader>

            <div className="mt-2 space-y-2">
              <label
                htmlFor="new-channel-name-mobile"
                className="text-xs font-medium text-muted-foreground"
              >
                Name
              </label>
              <Input
                id="new-channel-name-mobile"
                autoFocus
                value={draft}
                onChange={(event) => setDraft(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') {
                    event.preventDefault()
                    void handleCreate()
                  }
                }}
                placeholder="e.g. marketing"
              />
              {createChannelError ? (
                <p className="text-xs text-brand-danger">
                  {createChannelError}
                </p>
              ) : null}
            </div>

            <div className="mt-4 flex items-center justify-end gap-2">
              <Button
                variant="ghost"
                onClick={() => {
                  setDialogOpen(false)
                  setDraft('')
                }}
              >
                Cancel
              </Button>
              <Button
                onClick={() => void handleCreate()}
                disabled={!draft.trim() || creatingChannel}
              >
                {creatingChannel ? 'Creating…' : 'Create channel'}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </div>
  )
}
