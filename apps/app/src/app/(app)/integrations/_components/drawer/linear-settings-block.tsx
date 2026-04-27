'use client'

import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { Button } from '@kodi/ui/components/button'
import { Input } from '@kodi/ui/components/input'
import { Switch } from '@kodi/ui/components/switch'
import { useOrg } from '@/lib/org-context'
import { trpc } from '@/lib/trpc'

export function LinearSettingsBlock({
  orgId,
  hasActiveConnection,
  onRefresh,
}: {
  orgId: string
  hasActiveConnection: boolean
  onRefresh: () => void
}) {
  const { activeOrg } = useOrg()
  const isOwner = activeOrg?.role === 'owner'
  const [defaultTeam, setDefaultTeam] = useState('')
  const [defaultProject, setDefaultProject] = useState('')
  const [trackByDefault, setTrackByDefault] = useState(false)
  const [saved, setSaved] = useState({
    defaultTeam: '',
    defaultProject: '',
    trackByDefault: false,
  })
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    trpc.toolAccess.getToolkitDefaults
      .query({ orgId, toolkitSlug: 'linear' })
      .then((result) => {
        if (cancelled) return
        const defaults = result.linearTaskDefaults
        const next = {
          defaultTeam: defaults?.defaultTeam ?? '',
          defaultProject: defaults?.defaultProject ?? '',
          trackByDefault: defaults?.trackByDefault ?? false,
        }
        setDefaultTeam(next.defaultTeam)
        setDefaultProject(next.defaultProject)
        setTrackByDefault(next.trackByDefault)
        setSaved(next)
      })
      .catch(() => {
        if (cancelled) return
        setDefaultTeam('')
        setDefaultProject('')
        setTrackByDefault(false)
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [orgId])

  const dirty =
    defaultTeam.trim() !== saved.defaultTeam ||
    defaultProject.trim() !== saved.defaultProject ||
    trackByDefault !== saved.trackByDefault
  const disabled = !isOwner || !hasActiveConnection || loading || saving

  async function save() {
    if (disabled || !dirty) return
    setSaving(true)
    try {
      const defaults = {
        defaultTeam: defaultTeam.trim() || null,
        defaultProject: defaultProject.trim() || null,
        trackByDefault,
      }
      await trpc.toolAccess.setLinearTaskDefaults.mutate({
        orgId,
        toolkitSlug: 'linear',
        defaults,
      })
      setSaved({
        defaultTeam: defaults.defaultTeam ?? '',
        defaultProject: defaults.defaultProject ?? '',
        trackByDefault,
      })
      toast.success('Linear task defaults saved')
      onRefresh()
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : 'Failed to save Linear task defaults.'
      )
    } finally {
      setSaving(false)
    }
  }

  return (
    <section className="space-y-3">
      <h3 className="text-sm font-semibold text-foreground">Linear task defaults</h3>
      <div className="space-y-4 rounded-lg border border-border bg-card p-4">
        {!hasActiveConnection ? (
          <p className="rounded-md border border-dashed border-border bg-secondary px-3 py-2 text-xs text-muted-foreground">
            Connect Linear before enabling task tracking defaults.
          </p>
        ) : null}
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="space-y-1">
            <span className="text-sm font-medium text-foreground">Default team</span>
            <Input
              value={defaultTeam}
              onChange={(event) => setDefaultTeam(event.target.value)}
              placeholder="Engineering"
              disabled={disabled}
            />
          </label>
          <label className="space-y-1">
            <span className="text-sm font-medium text-foreground">Default project</span>
            <Input
              value={defaultProject}
              onChange={(event) => setDefaultProject(event.target.value)}
              placeholder="Kodi"
              disabled={disabled}
            />
          </label>
        </div>
        <label className="flex items-center justify-between gap-4 rounded-md border border-border bg-secondary px-3 py-2">
          <span className="text-sm text-foreground">Track new Kodi tasks in Linear by default</span>
          <Switch
            checked={trackByDefault}
            onCheckedChange={setTrackByDefault}
            disabled={disabled}
          />
        </label>
        <Button
          type="button"
          size="sm"
          onClick={() => void save()}
          disabled={disabled || !dirty}
        >
          {saving ? 'Saving...' : 'Save defaults'}
        </Button>
      </div>
    </section>
  )
}
