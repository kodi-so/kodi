'use client'

import { cn } from '@kodi/ui/lib/utils'
import { KODI_DM_ID, type Channel } from './chat-types'

export function MobileConversationTabs({
  channels,
  selectedDirectId,
  selectedChannelId,
  onSelectDirect,
  onSelectChannel,
}: {
  channels: Channel[]
  selectedDirectId: string | null
  selectedChannelId: string | null
  onSelectDirect: (directId: string) => void
  onSelectChannel: (channelId: string) => void
}) {
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
      </div>
    </div>
  )
}
