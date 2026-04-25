'use client'

import { trpc } from '@/lib/trpc'

export type ToolAccessCatalog = Awaited<
  ReturnType<typeof trpc.toolAccess.getCatalog.query>
>

export type ToolAccessItem = ToolAccessCatalog['items'][number]

export type ToolAccessToolkitDetail = Awaited<
  ReturnType<typeof trpc.toolAccess.getToolkitDetail.query>
>

export type PolicyDraft = Pick<
  ToolAccessToolkitDetail['policy'],
  | 'enabled'
  | 'chatReadsEnabled'
  | 'meetingReadsEnabled'
  | 'draftsEnabled'
  | 'writesRequireApproval'
  | 'adminActionsEnabled'
>

export function getToolkitMonogram(name: string): string {
  const letters = name
    .split(/[\s_-]+/)
    .map((part) => part[0])
    .filter(Boolean)
    .slice(0, 2)
    .join('')
  return letters.toUpperCase() || name.slice(0, 2).toUpperCase()
}

export function formatAuthMode(mode: string): string {
  switch (mode) {
    case 'custom':
      return 'Custom auth'
    case 'managed':
      return 'Managed auth'
    case 'no_auth':
      return 'No auth'
    default:
      return 'Unknown auth'
  }
}

export function createPolicyDraft(
  policy: ToolAccessToolkitDetail['policy'] | ToolAccessItem['policy']
): PolicyDraft {
  return {
    enabled: policy.enabled,
    chatReadsEnabled: policy.chatReadsEnabled,
    meetingReadsEnabled: policy.meetingReadsEnabled,
    draftsEnabled: policy.draftsEnabled,
    writesRequireApproval: policy.writesRequireApproval,
    adminActionsEnabled: policy.adminActionsEnabled,
  }
}

export function isPolicyDraftDirty(
  draft: PolicyDraft | null,
  policy: ToolAccessToolkitDetail['policy'] | null
): boolean {
  if (!draft || !policy) return false
  return (
    draft.enabled !== policy.enabled ||
    draft.chatReadsEnabled !== policy.chatReadsEnabled ||
    draft.meetingReadsEnabled !== policy.meetingReadsEnabled ||
    draft.draftsEnabled !== policy.draftsEnabled ||
    draft.writesRequireApproval !== policy.writesRequireApproval ||
    draft.adminActionsEnabled !== policy.adminActionsEnabled
  )
}
