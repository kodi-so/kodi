// TODO(policy-presets): offer preset bundles (Read-only / Drafts only / Full
// access with approvals / Full access) that flip these six toggles in one
// action. Product hasn't nailed the preset matrix yet — keep the individual
// toggles until they do.

'use client'

import { useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'
import { Button } from '@kodi/ui/components/button'
import { Switch } from '@kodi/ui/components/switch'
import { cn } from '@kodi/ui/lib/utils'
import { useOrg } from '@/lib/org-context'
import { trpc } from '@/lib/trpc'
import {
  createPolicyDraft,
  isPolicyDraftDirty,
  type PolicyDraft,
  type ToolAccessToolkitDetail,
} from '../../_lib/tool-access-ui'

type PolicyField = keyof PolicyDraft

export function PolicyBlock({
  orgId,
  toolkitSlug,
  policy,
  onRefresh,
}: {
  orgId: string
  toolkitSlug: string
  policy: ToolAccessToolkitDetail['policy']
  onRefresh: () => void
}) {
  const { activeOrg } = useOrg()
  const isOwner = activeOrg?.role === 'owner'
  const [draft, setDraft] = useState<PolicyDraft>(() => createPolicyDraft(policy))
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    setDraft(createPolicyDraft(policy))
  }, [policy])

  const dirty = useMemo(() => isPolicyDraftDirty(draft, policy), [draft, policy])

  function update<K extends PolicyField>(field: K, value: PolicyDraft[K]) {
    setDraft((current) => ({ ...current, [field]: value }))
  }

  async function save() {
    if (!isOwner || saving || !dirty) return
    setSaving(true)
    try {
      await trpc.toolAccess.updatePolicy.mutate({
        orgId,
        toolkitSlug,
        ...draft,
      })
      toast.success('Policy updated')
      onRefresh()
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : 'Failed to save policy.'
      )
    } finally {
      setSaving(false)
    }
  }

  function reset() {
    setDraft(createPolicyDraft(policy))
  }

  const dependentsDisabled = !draft.enabled

  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-sm font-semibold text-foreground">Policy</h3>
        {!isOwner && (
          <span className="text-xs text-muted-foreground">
            Only workspace owners can edit
          </span>
        )}
      </div>

      <PolicyGroup title="Reading">
        <ToggleRow
          label="Allow Kodi to use this integration"
          description="Master switch. When off, the other toggles have no effect."
          checked={draft.enabled}
          onChange={(value) => update('enabled', value)}
          disabled={!isOwner || saving}
        />
        <ToggleRow
          label="Let Kodi read in chat conversations"
          description="Kodi can look things up via this tool while you're chatting."
          checked={draft.chatReadsEnabled}
          onChange={(value) => update('chatReadsEnabled', value)}
          disabled={!isOwner || saving || dependentsDisabled}
        />
        <ToggleRow
          label="Let Kodi read in meeting contexts"
          description="Kodi can look things up via this tool while acting in meetings."
          checked={draft.meetingReadsEnabled}
          onChange={(value) => update('meetingReadsEnabled', value)}
          disabled={!isOwner || saving || dependentsDisabled}
        />
      </PolicyGroup>

      <PolicyGroup title="Writing & drafts">
        <ToggleRow
          label="Allow Kodi to draft messages and content"
          description="Kodi can propose drafts you review before they go out."
          checked={draft.draftsEnabled}
          onChange={(value) => update('draftsEnabled', value)}
          disabled={!isOwner || saving || dependentsDisabled}
        />
        <ToggleRow
          label="Require approval before Kodi sends or posts"
          description="Writes land on /approvals for review. Recommended on."
          checked={draft.writesRequireApproval}
          onChange={(value) => update('writesRequireApproval', value)}
          disabled={!isOwner || saving || dependentsDisabled}
        />
      </PolicyGroup>

      <PolicyGroup title="Admin actions">
        <ToggleRow
          label="Allow administrative actions (create, delete, modify)"
          description="High-risk operations. Still subject to the approval toggle above."
          checked={draft.adminActionsEnabled}
          onChange={(value) => update('adminActionsEnabled', value)}
          disabled={!isOwner || saving || dependentsDisabled}
        />
      </PolicyGroup>

      {isOwner && (
        <div className="flex flex-wrap items-center gap-2 pt-2">
          {dirty && (
            <span className="inline-flex h-5 items-center rounded-full bg-brand-warning-soft px-2 text-xs font-medium text-brand-warning">
              Unsaved changes
            </span>
          )}
          <div className="ml-auto flex gap-2">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={reset}
              disabled={!dirty || saving}
            >
              Reset
            </Button>
            <Button
              type="button"
              size="sm"
              onClick={() => void save()}
              disabled={!dirty || saving}
            >
              {saving ? 'Saving…' : 'Save'}
            </Button>
          </div>
        </div>
      )}
    </section>
  )
}

function PolicyGroup({
  title,
  children,
}: {
  title: string
  children: React.ReactNode
}) {
  return (
    <div className="space-y-1.5">
      <h4 className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
        {title}
      </h4>
      <div className="divide-y divide-border rounded-lg border border-border bg-card">
        {children}
      </div>
    </div>
  )
}

function ToggleRow({
  label,
  description,
  checked,
  onChange,
  disabled,
}: {
  label: string
  description?: string
  checked: boolean
  onChange: (value: boolean) => void
  disabled?: boolean
}) {
  return (
    <div
      className={cn(
        'flex items-start justify-between gap-4 px-4 py-3',
        disabled && 'opacity-60'
      )}
    >
      <div className="min-w-0 flex-1 space-y-0.5">
        <p className="text-sm font-medium text-foreground">{label}</p>
        {description && (
          <p className="text-xs text-muted-foreground">{description}</p>
        )}
      </div>
      <Switch
        checked={checked}
        onCheckedChange={onChange}
        disabled={disabled}
      />
    </div>
  )
}
