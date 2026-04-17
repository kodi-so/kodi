import { Button, Input } from '@kodi/ui'
import { quietTextClass } from '@/lib/brand-styles'

export function DefaultChannelField({
  channelDraft,
  defaultChannel,
  channelSaving,
  channelSaved,
  onChannelDraftChange,
  onSave,
  onClear,
}: {
  channelDraft: string
  defaultChannel: string | null
  channelSaving: boolean
  channelSaved: boolean
  onChannelDraftChange: (value: string) => void
  onSave: () => void
  onClear: () => void
}) {
  return (
    <div className="rounded-[1.2rem] border border-brand-line bg-brand-elevated p-4">
      <div className="space-y-1">
        <p className="text-sm font-medium text-foreground">Default channel for meeting recaps</p>
        <p className={`text-sm leading-6 ${quietTextClass}`}>
          When sending a meeting recap to Slack, this channel is pre-filled in the send dialog. Members can override it per send.
        </p>
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <Input
          className="h-8 w-48 text-sm"
          placeholder="e.g. general"
          value={channelDraft}
          onChange={(e: React.ChangeEvent<HTMLInputElement>) => onChannelDraftChange(e.target.value.replace(/^#+/, ''))}
          disabled={channelSaving}
        />
        <Button
          type="button"
          size="sm"
          onClick={onSave}
          disabled={channelSaving || channelDraft.trim() === (defaultChannel ?? '')}
        >
          {channelSaving ? 'Saving...' : channelSaved ? 'Saved' : 'Save channel'}
        </Button>
        {defaultChannel && (
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className="border border-brand-line bg-background text-brand-quiet hover:bg-secondary hover:text-foreground"
            disabled={channelSaving}
            onClick={onClear}
          >
            Clear
          </Button>
        )}
      </div>
    </div>
  )
}
