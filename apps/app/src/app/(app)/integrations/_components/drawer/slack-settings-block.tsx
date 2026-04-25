// TODO(toolkit-settings-framework): generic toolkit-specific settings will
// follow this shape — a `toolkitSettings` slot per integration where toolkits
// can contribute fields (e.g. GitHub default-repo, Linear default-team). Slack
// is the only one today, so it stays one-off until a second one shows up.

'use client'

import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { Button } from '@kodi/ui/components/button'
import { Input } from '@kodi/ui/components/input'
import { useOrg } from '@/lib/org-context'
import { trpc } from '@/lib/trpc'

export function SlackSettingsBlock({
  orgId,
  onRefresh,
}: {
  orgId: string
  onRefresh: () => void
}) {
  const { activeOrg } = useOrg()
  const isOwner = activeOrg?.role === 'owner'
  const [saved, setSaved] = useState<string>('')
  const [draft, setDraft] = useState<string>('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    trpc.toolAccess.getToolkitDefaults
      .query({ orgId, toolkitSlug: 'slack' })
      .then((result) => {
        if (cancelled) return
        const next = result.defaultChannel ?? ''
        setSaved(next)
        setDraft(next)
      })
      .catch(() => {
        if (cancelled) return
        setSaved('')
        setDraft('')
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [orgId])

  const trimmed = draft.trim()
  const dirty = trimmed !== saved
  const disabled = !isOwner || saving || loading

  async function commit(nextValue: string) {
    setSaving(true)
    try {
      await trpc.toolAccess.setDefaultChannel.mutate({
        orgId,
        toolkitSlug: 'slack',
        channel: nextValue,
      })
      setSaved(nextValue)
      setDraft(nextValue)
      toast.success(
        nextValue
          ? `Default channel set to #${nextValue}`
          : 'Default channel cleared'
      )
      onRefresh()
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : 'Failed to update the default channel.'
      )
    } finally {
      setSaving(false)
    }
  }

  async function save() {
    if (disabled || !dirty) return
    await commit(trimmed)
  }

  async function clear() {
    if (disabled || saved === '') return
    await commit('')
  }

  return (
    <section className="space-y-3">
      <h3 className="text-sm font-semibold text-foreground">Slack settings</h3>
      <div className="space-y-3 rounded-lg border border-border bg-card p-4">
        <div className="space-y-1">
          <label
            htmlFor="slack-default-channel"
            className="text-sm font-medium text-foreground"
          >
            Default channel for meeting recaps
          </label>
          <p className="text-xs text-muted-foreground">
            Pre-fills the channel when someone sends a meeting recap to Slack.
            Users can still pick a different channel each time.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex h-9 flex-1 items-center rounded-lg border border-border bg-secondary px-3 transition-colors focus-within:border-ring/60 focus-within:ring-2 focus-within:ring-ring/30">
            <span
              aria-hidden
              className="mr-1 select-none text-sm text-muted-foreground"
            >
              #
            </span>
            <Input
              id="slack-default-channel"
              className="h-full flex-1 rounded-none border-0 bg-transparent px-0 text-sm shadow-none focus-visible:outline-none focus-visible:ring-0 focus-visible:ring-offset-0"
              placeholder="general"
              value={draft}
              onChange={(event) =>
                setDraft(event.target.value.replace(/^#+/, ''))
              }
              disabled={disabled}
              autoComplete="off"
            />
          </div>
          <Button
            type="button"
            size="sm"
            onClick={() => void save()}
            disabled={disabled || !dirty}
          >
            {saving && dirty ? 'Saving…' : 'Save'}
          </Button>
          {saved && (
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={() => void clear()}
              disabled={disabled}
            >
              Clear
            </Button>
          )}
        </div>
      </div>
    </section>
  )
}
