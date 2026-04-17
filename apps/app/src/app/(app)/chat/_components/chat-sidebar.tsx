'use client'

import { useState } from 'react'
import { Hash, Plus } from 'lucide-react'
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  Input,
  ScrollArea,
  cn,
} from '@kodi/ui'
import { KODI_DM_ID, type Channel } from './chat-types'

export function ChatSidebar({
  orgName,
  channels,
  loadingChannels,
  selectedDirectId,
  selectedChannelId,
  creatingChannel,
  createChannelError,
  onSelectDirect,
  onSelectChannel,
  onCreateChannel,
}: {
  orgName: string
  channels: Channel[]
  loadingChannels: boolean
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
    <aside className="hidden min-h-0 w-[260px] shrink-0 flex-col border-r border-border bg-sidebar text-sidebar-foreground lg:flex">
      <div className="shrink-0 px-4 pb-3 pt-4">
        <p className="truncate text-[13px] font-semibold text-foreground">
          {orgName}
        </p>
        <p className="mt-0.5 text-[11px] text-muted-foreground">
          Shared conversations
        </p>
      </div>

      <div className="shrink-0 px-2 pb-1 pt-1">
        <p className="px-2 pb-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
          Direct messages
        </p>
        <button
          type="button"
          onClick={() => onSelectDirect(KODI_DM_ID)}
          className={cn(
            'flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-[13px] transition-colors',
            selectedDirectId === KODI_DM_ID
              ? 'bg-sidebar-accent text-sidebar-accent-foreground'
              : 'text-muted-foreground hover:bg-sidebar-accent/50 hover:text-foreground'
          )}
        >
          <span className="inline-flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-md bg-accent text-[10px] font-semibold text-foreground">
            K
          </span>
          <span className="min-w-0 flex-1 truncate">Kodi</span>
        </button>
      </div>

      <div className="mt-3 flex shrink-0 items-center justify-between px-4 pb-1">
        <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
          Channels
        </p>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setDialogOpen(true)}
            className="h-6 w-6 rounded-md p-1 text-muted-foreground hover:bg-sidebar-accent/60 hover:text-foreground"
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
                htmlFor="new-channel-name"
                className="text-xs font-medium text-muted-foreground"
              >
                Name
              </label>
              <Input
                id="new-channel-name"
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

      <ScrollArea className="min-h-0 flex-1">
        <div className="px-2 pb-4">
          {loadingChannels && channels.length === 0 ? (
            <p className="px-2 py-2 text-[12px] text-muted-foreground">
              Loading channels…
            </p>
          ) : channels.length === 0 ? (
            <p className="px-2 py-2 text-[12px] text-muted-foreground">
              No channels yet.
            </p>
          ) : (
            channels.map((channel) => {
              const active =
                selectedChannelId === channel.id && !selectedDirectId
              return (
                <button
                  key={channel.id}
                  type="button"
                  onClick={() => onSelectChannel(channel.id)}
                  className={cn(
                    'flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-[13px] transition-colors',
                    active
                      ? 'bg-sidebar-accent text-sidebar-accent-foreground'
                      : 'text-muted-foreground hover:bg-sidebar-accent/50 hover:text-foreground'
                  )}
                >
                  <Hash size={14} className="shrink-0 opacity-70" />
                  <span className="truncate">{channel.slug}</span>
                </button>
              )
            })
          )}
        </div>
      </ScrollArea>
    </aside>
  )
}
