'use client'

import { ShieldCheck } from 'lucide-react'
import { Button } from '@kodi/ui/components/button'
import {
  quietTextClass,
  subtleTextClass,
  type BrandBadgeTone,
} from '@/lib/brand-styles'
import { type PolicyDraft, type ToolAccessToolkitDetail } from '../../_lib/tool-access-ui'
import { CollapsibleSection } from './collapsible-section'
import { PolicyToggleRow } from './policy-toggle-row'
import { DefaultChannelField } from './default-channel-field'

export function WorkspaceDefaultsSection({
  detail,
  isOwner,
  policyState,
  policyDraft,
  policyDirty,
  policySaving,
  toolkitSlug,
  channelDraft,
  defaultChannel,
  channelSaving,
  channelSaved,
  expanded,
  onToggle,
  onPolicyDraftChange,
  onSavePolicy,
  onResetPolicy,
  onChannelDraftChange,
  onSaveChannel,
  onClearChannel,
}: {
  detail: ToolAccessToolkitDetail
  isOwner: boolean
  policyState: { label: string; tone: BrandBadgeTone; detail: string } | null
  policyDraft: PolicyDraft | null
  policyDirty: boolean
  policySaving: boolean
  toolkitSlug: string
  channelDraft: string
  defaultChannel: string | null
  channelSaving: boolean
  channelSaved: boolean
  expanded: boolean
  onToggle: () => void
  onPolicyDraftChange: (updater: (current: PolicyDraft | null) => PolicyDraft | null) => void
  onSavePolicy: () => void
  onResetPolicy: () => void
  onChannelDraftChange: (value: string) => void
  onSaveChannel: () => void
  onClearChannel: () => void
}) {
  return (
    <CollapsibleSection
      title="Workspace defaults"
      description={
        isOwner
          ? 'Set the workspace defaults Kodi should respect whenever this integration is available.'
          : 'You can review the current workspace defaults here. Only owners can change them.'
      }
      badges={[
        {
          label: policyState?.label ?? 'Policy',
          variant: policyState?.tone ?? 'neutral',
        },
        {
          label: `${detail.connectionSummary.activeCount} ${
            detail.connectionSummary.activeCount === 1
              ? 'active identity'
              : 'active identities'
          }`,
          variant: 'neutral',
        },
      ]}
      actions={
        <div
          className={`flex items-center gap-2 text-sm ${quietTextClass}`}
        >
          <ShieldCheck size={16} className={subtleTextClass} />
          {isOwner ? 'Owner controls' : 'View only'}
        </div>
      }
      expanded={expanded}
      onToggle={onToggle}
    >
      {isOwner && policyDraft ? (
        <div className="mt-4 space-y-3">
          <PolicyToggleRow
            title="Workspace access"
            description="Turn this integration on or off for the workspace."
            value={policyDraft.enabled}
            onToggle={() =>
              onPolicyDraftChange((current) =>
                current
                  ? { ...current, enabled: !current.enabled }
                  : current
              )
            }
            trueLabel="Enabled"
            falseLabel="Disabled"
            disabled={policySaving}
          />
          <PolicyToggleRow
            title="Chat reads"
            description="Allow Kodi to read from this integration during chat."
            value={policyDraft.chatReadsEnabled}
            onToggle={() =>
              onPolicyDraftChange((current) =>
                current
                  ? { ...current, chatReadsEnabled: !current.chatReadsEnabled }
                  : current
              )
            }
            trueLabel="Allowed"
            falseLabel="Blocked"
            disabled={policySaving}
          />
          <PolicyToggleRow
            title="Meeting reads"
            description="Allow this integration to be read during meeting workflows."
            value={policyDraft.meetingReadsEnabled}
            onToggle={() =>
              onPolicyDraftChange((current) =>
                current
                  ? {
                      ...current,
                      meetingReadsEnabled: !current.meetingReadsEnabled,
                    }
                  : current
              )
            }
            trueLabel="Allowed"
            falseLabel="Blocked"
            disabled={policySaving}
          />
          <PolicyToggleRow
            title="Draft support"
            description="Allow Kodi to prepare drafts before a write is executed."
            value={policyDraft.draftsEnabled}
            onToggle={() =>
              onPolicyDraftChange((current) =>
                current
                  ? { ...current, draftsEnabled: !current.draftsEnabled }
                  : current
              )
            }
            trueLabel="On"
            falseLabel="Off"
            disabled={policySaving}
          />
          <PolicyToggleRow
            title="Approval for writes"
            description="Keep writes behind approval before they execute."
            value={policyDraft.writesRequireApproval}
            onToggle={() =>
              onPolicyDraftChange((current) =>
                current
                  ? {
                      ...current,
                      writesRequireApproval: !current.writesRequireApproval,
                    }
                  : current
              )
            }
            trueLabel="Required"
            falseLabel="Direct"
            disabled={policySaving}
          />
          <PolicyToggleRow
            title="Admin actions"
            description="Allow high-risk administrative actions for this integration."
            value={policyDraft.adminActionsEnabled}
            onToggle={() =>
              onPolicyDraftChange((current) =>
                current
                  ? {
                      ...current,
                      adminActionsEnabled: !current.adminActionsEnabled,
                    }
                  : current
              )
            }
            trueLabel="Enabled"
            falseLabel="Disabled"
            disabled={policySaving}
          />

          {toolkitSlug === 'slack' && (
            <DefaultChannelField
              channelDraft={channelDraft}
              defaultChannel={defaultChannel}
              channelSaving={channelSaving}
              channelSaved={channelSaved}
              onChannelDraftChange={onChannelDraftChange}
              onSave={onSaveChannel}
              onClear={onClearChannel}
            />
          )}

          <div className="flex flex-wrap gap-2 border-t border-border pt-4">
            <Button
              onClick={onSavePolicy}
              disabled={!policyDirty || policySaving}
            >
              {policySaving ? 'Saving...' : 'Save defaults'}
            </Button>
            <Button
              onClick={onResetPolicy}
              variant="ghost"
              className="border border-border bg-card text-muted-foreground hover:bg-secondary hover:text-foreground"
              disabled={!policyDirty || policySaving}
            >
              Reset
            </Button>
          </div>
        </div>
      ) : (
        <div className="mt-4 rounded-lg border border-border bg-card p-5">
          <p className="text-sm font-medium text-foreground">
            Workspace policy is view-only here.
          </p>
          <p className={`mt-2 text-sm leading-7 ${quietTextClass}`}>
            Owners can change defaults for chat reads, meeting reads,
            drafts, approval gating, and administrative actions.
          </p>
        </div>
      )}
    </CollapsibleSection>
  )
}
