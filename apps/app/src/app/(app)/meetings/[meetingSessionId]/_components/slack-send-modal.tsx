'use client'

import { useCallback, useEffect, useState } from 'react'
import { Check, Loader2, Send, X } from 'lucide-react'
import {
  Button,
  Input,
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@kodi/ui'
import { trpc } from '@/lib/trpc'

export function SlackSendModal({
  open,
  onClose,
  onSend,
  delivering,
  defaultChannel,
  meetingTitle,
  summaryContent,
  orgId,
}: {
  open: boolean
  onClose: () => void
  onSend: (channel: string) => void
  delivering: boolean
  defaultChannel: string | null
  meetingTitle: string | null
  summaryContent: string | null
  orgId: string | null
}) {
  const [query, setQuery] = useState('')
  const [selected, setSelected] = useState(defaultChannel ?? '')
  const [dropdownOpen, setDropdownOpen] = useState(false)
  const [channels, setChannels] = useState<
    Array<{ id: string; name: string }>
  >([])
  const [channelsLoading, setChannelsLoading] = useState(false)
  const [channelsError, setChannelsError] = useState<string | null>(null)
  const inputRef = useCallback(
    (el: HTMLInputElement | null) => {
      if (el && open) setTimeout(() => el.focus(), 50)
    },
    [open]
  )

  useEffect(() => {
    if (!open) return
    setSelected(defaultChannel ?? '')
    setQuery(defaultChannel ?? '')
    setDropdownOpen(false)
    setChannels([])
    setChannelsError(null)

    if (!orgId) return
    setChannelsLoading(true)
    trpc.toolAccess.listSlackChannels
      .query({ orgId })
      .then((result) => {
        setChannels(result.channels)
        if (result.error) setChannelsError(result.error)
      })
      .catch((err: unknown) => {
        const msg =
          err instanceof Error ? err.message : 'Failed to load channels.'
        setChannelsError(msg)
      })
      .finally(() => {
        setChannelsLoading(false)
      })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  if (!open) return null

  const cleanSelected = selected.replace(/^#/, '').trim()
  const previewText = `*${meetingTitle ?? 'Meeting'} — Meeting Recap*\n\n${summaryContent ?? '(Summary not yet available)'}`

  const filteredChannels = channels.filter((c) =>
    c.name.toLowerCase().includes(query.toLowerCase().replace(/^#/, ''))
  )

  function handleSelect(name: string) {
    setSelected(name)
    setQuery(name)
    setDropdownOpen(false)
  }

  function handleQueryChange(e: React.ChangeEvent<HTMLInputElement>) {
    const val = e.target.value.replace(/^#/, '')
    setQuery(val)
    setSelected(val)
    setDropdownOpen(true)
  }

  function handleBackdropClick(e: React.MouseEvent<HTMLDivElement>) {
    if (e.target === e.currentTarget && !delivering) onClose()
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-4 sm:items-center"
      onClick={handleBackdropClick}
    >
      <div className="w-full max-w-lg rounded-2xl border border-border bg-background shadow-2xl">
        <div className="space-y-4 p-6">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold text-foreground">
                Send recap to Slack
              </h2>
              <p className="mt-0.5 text-sm text-muted-foreground">
                Choose a channel and review the message before sending.
              </p>
            </div>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={delivering}
              onClick={onClose}
              className="shrink-0 text-muted-foreground"
            >
              <X size={16} />
            </Button>
          </div>

          <div className="rounded-xl border border-border bg-secondary p-4">
            <p className="mb-2 text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
              Message preview
            </p>
            <pre className="line-clamp-6 whitespace-pre-wrap font-sans text-sm leading-6 text-foreground">
              {previewText}
            </pre>
          </div>

          <div className="space-y-1.5">
            <label
              className="text-sm font-medium text-foreground"
              htmlFor="slack-channel-input"
            >
              Channel <span className="text-destructive">*</span>
            </label>
            <div className="relative">
              <div className="flex items-center rounded-lg border border-border bg-secondary px-3 focus-within:ring-2 focus-within:ring-ring/40">
                {channelsLoading ? (
                  <Loader2
                    size={13}
                    className="mr-2 shrink-0 animate-spin text-muted-foreground"
                  />
                ) : (
                  <span className="mr-1 select-none text-sm text-muted-foreground">
                    #
                  </span>
                )}
                <Input
                  id="slack-channel-input"
                  ref={inputRef}
                  className="h-8 flex-1 border-0 bg-transparent px-0 text-sm shadow-none focus-visible:ring-0"
                  placeholder={
                    channelsLoading ? 'Loading channels…' : 'Search channels…'
                  }
                  value={query}
                  onChange={handleQueryChange}
                  onFocus={() => setDropdownOpen(true)}
                  onBlur={() => setTimeout(() => setDropdownOpen(false), 120)}
                  disabled={delivering}
                  autoComplete="off"
                />
                {cleanSelected && (
                  <TooltipProvider delayDuration={300}>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          tabIndex={-1}
                          className="ml-1 h-auto w-auto shrink-0 p-0 text-muted-foreground hover:text-foreground"
                          onClick={() => {
                            setSelected('')
                            setQuery('')
                            setDropdownOpen(true)
                          }}
                        >
                          <X size={13} />
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>Clear channel</TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                )}
              </div>

              {dropdownOpen && filteredChannels.length > 0 && (
                <div className="absolute z-10 mt-1 max-h-52 w-full overflow-auto rounded-lg border border-border bg-background shadow-lg">
                  {filteredChannels.map((ch) => (
                    <button
                      key={ch.id}
                      type="button"
                      className={`flex w-full items-center gap-2 px-3 py-2 text-left text-sm transition-colors hover:bg-secondary ${
                        selected === ch.name
                          ? 'bg-secondary font-medium text-foreground'
                          : 'text-foreground'
                      }`}
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => handleSelect(ch.name)}
                    >
                      <span className="text-muted-foreground">#</span>
                      {ch.name}
                      {selected === ch.name && (
                        <Check
                          size={13}
                          className="ml-auto shrink-0 text-primary"
                        />
                      )}
                    </button>
                  ))}
                </div>
              )}

              {dropdownOpen &&
                !channelsLoading &&
                channels.length === 0 &&
                query.trim().length > 0 && (
                  <div className="absolute z-10 mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-muted-foreground shadow-lg">
                    No channels found. The name you typed will be used directly.
                  </div>
                )}
            </div>
            <p className="text-xs text-muted-foreground">
              {channels.length > 0
                ? `${channels.length} channels available — type to filter.`
                : channelsError
                  ? `Could not load channels: ${channelsError}`
                  : 'Type the channel name without the # prefix.'}
            </p>
          </div>
        </div>

        <div className="flex justify-end gap-2 border-t border-border px-6 py-4">
          <Button
            type="button"
            variant="ghost"
            className="border border-border"
            disabled={delivering}
            onClick={onClose}
          >
            Cancel
          </Button>
          <Button
            type="button"
            disabled={!cleanSelected || delivering}
            onClick={() => onSend(cleanSelected)}
            className="gap-1.5"
          >
            {delivering ? (
              <Loader2 size={14} className="animate-spin" />
            ) : (
              <Send size={14} />
            )}
            {delivering ? 'Sending…' : 'Send to Slack'}
          </Button>
        </div>
      </div>
    </div>
  )
}
