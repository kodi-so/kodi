type MeetingBotIdentityInput = {
  orgName: string
  orgSlug: string
  emailDomain?: string
  displayNameOverride?: string | null
}

export type MeetingBotIdentity = {
  shortName: string
  displayName: string
  inviteEmail: string
  inviteEmailLocalPart: string
  inviteInstructions: string[]
}

const DEFAULT_MEETING_BOT_EMAIL_DOMAIN = 'kodi.so'

function sanitizeOrgSlug(orgSlug: string) {
  const normalized = orgSlug
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/-{2,}/g, '-')
    .replace(/^-+|-+$/g, '')

  return normalized || 'workspace'
}

function buildDisplayName(
  orgName: string,
  displayNameOverride?: string | null
) {
  const trimmedOverride = displayNameOverride?.trim()
  if (trimmedOverride) {
    return trimmedOverride
  }

  const trimmedName = orgName.trim()
  if (!trimmedName || trimmedName.toLowerCase() === 'personal') {
    return 'Kodi'
  }

  return `Kodi for ${trimmedName}`
}

export function deriveMeetingBotIdentity(
  input: MeetingBotIdentityInput
): MeetingBotIdentity {
  const safeSlug = sanitizeOrgSlug(input.orgSlug)
  const inviteEmailLocalPart = `meet+${safeSlug}`
  const emailDomain = input.emailDomain ?? DEFAULT_MEETING_BOT_EMAIL_DOMAIN

  return {
    shortName: 'Kodi',
    displayName: buildDisplayName(
      input.orgName,
      input.displayNameOverride
    ),
    inviteEmail: `${inviteEmailLocalPart}@${emailDomain}`,
    inviteEmailLocalPart,
    inviteInstructions: [
      'Use this as the stable workspace meeting-agent identity.',
      'For a live meeting right now, start Kodi from a Google Meet or Zoom URL on the Meetings page.',
      'Invite-by-email automation will build on this same address in the next phase.',
    ],
  }
}
