export type ActivityItem = {
  id: string
  orgId: string
  userId: string | null
  action: string
  metadata?: unknown
  createdAt: Date | string
}

/**
 * Returns a human-readable label for an activity log item.
 */
export function activityLabel(item: ActivityItem): string {
  const meta = item.metadata as Record<string, string> | null
  switch (item.action) {
    case 'member.invited':
      return `Invited ${meta?.email ?? 'someone'} to join`
    case 'member.joined':
      return `${meta?.name ?? 'Someone'} joined the team`
    case 'member.removed':
      return `${meta?.name ?? 'A member'} was removed`
    case 'invite.revoked':
      return `Invite for ${meta?.email ?? 'someone'} was revoked`
    default:
      return item.action
  }
}

/**
 * Returns a relative timestamp string, e.g. "2 minutes ago", "3 hours ago", "just now".
 */
export function relativeTime(date: Date): string {
  const now = Date.now()
  const diffMs = now - new Date(date).getTime()
  const diffSec = Math.floor(diffMs / 1000)
  const diffMin = Math.floor(diffSec / 60)
  const diffHour = Math.floor(diffMin / 60)
  const diffDay = Math.floor(diffHour / 24)

  if (diffSec < 60) return 'just now'
  if (diffMin < 60) return `${diffMin} minute${diffMin === 1 ? '' : 's'} ago`
  if (diffHour < 24) return `${diffHour} hour${diffHour === 1 ? '' : 's'} ago`
  return `${diffDay} day${diffDay === 1 ? '' : 's'} ago`
}

/** Icon emoji for each action type */
export function activityIcon(action: string): string {
  switch (action) {
    case 'member.invited':
      return '✉️'
    case 'member.joined':
      return '🙌'
    case 'member.removed':
      return '👋'
    case 'invite.revoked':
      return '🚫'
    default:
      return '📋'
  }
}
