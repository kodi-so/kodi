import type { MeetingProviderSlug } from './events'

export type MeetingIdentityClassification = 'internal' | 'external' | 'unknown'

export type MeetingOrgIdentityMember = {
  userId: string
  name: string | null
  email: string
}

export type MeetingOrgIdentityDirectory = {
  members: Array<
    MeetingOrgIdentityMember & {
      normalizedEmail: string
      normalizedName: string | null
      emailDomain: string | null
    }
  >
  internalDomains: string[]
}

export type ResolvedMeetingParticipantIdentity = {
  stableParticipantKey: string
  providerIdentity: {
    providerParticipantId: string | null
    displayName: string | null
    email: string | null
  }
  classification: MeetingIdentityClassification
  confidence: number
  matchedBy: 'email_exact' | 'name_exact' | 'email_domain' | 'none'
  matchedUserId: string | null
  matchedUserEmail: string | null
  rejoinCount: number
}

function slugify(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

export function normalizeMeetingEmail(value: string | null | undefined) {
  return value?.trim().toLowerCase() ?? null
}

export function normalizeMeetingName(value: string | null | undefined) {
  const normalized = value?.trim().toLowerCase() ?? null
  return normalized && normalized.length > 0 ? normalized : null
}

export function extractEmailDomain(value: string | null | undefined) {
  const normalized = normalizeMeetingEmail(value)
  if (!normalized) return null

  const [, domain] = normalized.split('@')
  return domain ?? null
}

export function buildParticipantStableKey(input: {
  providerParticipantId?: string | null
  email?: string | null
  displayName?: string | null
}) {
  if (input.providerParticipantId) {
    return `provider:${input.providerParticipantId}`
  }

  const normalizedEmail = normalizeMeetingEmail(input.email)
  if (normalizedEmail) {
    return `email:${normalizedEmail}`
  }

  const normalizedName = normalizeMeetingName(input.displayName)
  if (normalizedName) {
    return `name:${slugify(normalizedName)}`
  }

  return 'participant:unknown'
}

export function buildMeetingOrgIdentityDirectory(
  members: MeetingOrgIdentityMember[]
): MeetingOrgIdentityDirectory {
  const normalizedMembers = members.map((member) => ({
    ...member,
    normalizedEmail: normalizeMeetingEmail(member.email) ?? member.email,
    normalizedName: normalizeMeetingName(member.name),
    emailDomain: extractEmailDomain(member.email),
  }))

  const internalDomains = [
    ...new Set(
      normalizedMembers
        .map((member) => member.emailDomain)
        .filter((domain): domain is string => Boolean(domain))
    ),
  ]

  return {
    members: normalizedMembers,
    internalDomains,
  }
}

export function resolveMeetingParticipantIdentity(input: {
  provider: MeetingProviderSlug
  participant: {
    providerParticipantId?: string | null
    displayName?: string | null
    email?: string | null
  }
  directory: MeetingOrgIdentityDirectory
  rejoinCount?: number
}): ResolvedMeetingParticipantIdentity {
  const normalizedEmail = normalizeMeetingEmail(input.participant.email)
  const normalizedName = normalizeMeetingName(input.participant.displayName)
  const emailDomain = extractEmailDomain(input.participant.email)

  const byEmail = normalizedEmail
    ? input.directory.members.find(
        (member) => member.normalizedEmail === normalizedEmail
      )
    : null

  if (byEmail) {
    return {
      stableParticipantKey: buildParticipantStableKey(input.participant),
      providerIdentity: {
        providerParticipantId: input.participant.providerParticipantId ?? null,
        displayName: input.participant.displayName ?? null,
        email: input.participant.email ?? null,
      },
      classification: 'internal',
      confidence: 1,
      matchedBy: 'email_exact',
      matchedUserId: byEmail.userId,
      matchedUserEmail: byEmail.email,
      rejoinCount: input.rejoinCount ?? 0,
    }
  }

  const nameMatches = normalizedName
    ? input.directory.members.filter(
        (member) => member.normalizedName === normalizedName
      )
    : []

  if (nameMatches.length === 1) {
    const match = nameMatches[0]!
    return {
      stableParticipantKey: buildParticipantStableKey(input.participant),
      providerIdentity: {
        providerParticipantId: input.participant.providerParticipantId ?? null,
        displayName: input.participant.displayName ?? null,
        email: input.participant.email ?? null,
      },
      classification: 'internal',
      confidence: 0.72,
      matchedBy: 'name_exact',
      matchedUserId: match.userId,
      matchedUserEmail: match.email,
      rejoinCount: input.rejoinCount ?? 0,
    }
  }

  if (emailDomain && input.directory.internalDomains.includes(emailDomain)) {
    return {
      stableParticipantKey: buildParticipantStableKey(input.participant),
      providerIdentity: {
        providerParticipantId: input.participant.providerParticipantId ?? null,
        displayName: input.participant.displayName ?? null,
        email: input.participant.email ?? null,
      },
      classification: 'internal',
      confidence: 0.45,
      matchedBy: 'email_domain',
      matchedUserId: null,
      matchedUserEmail: null,
      rejoinCount: input.rejoinCount ?? 0,
    }
  }

  if (normalizedEmail || normalizedName) {
    return {
      stableParticipantKey: buildParticipantStableKey(input.participant),
      providerIdentity: {
        providerParticipantId: input.participant.providerParticipantId ?? null,
        displayName: input.participant.displayName ?? null,
        email: input.participant.email ?? null,
      },
      classification: normalizedEmail ? 'external' : 'unknown',
      confidence: normalizedEmail ? 0.92 : 0.3,
      matchedBy: 'none',
      matchedUserId: null,
      matchedUserEmail: null,
      rejoinCount: input.rejoinCount ?? 0,
    }
  }

  return {
    stableParticipantKey: buildParticipantStableKey(input.participant),
    providerIdentity: {
      providerParticipantId: input.participant.providerParticipantId ?? null,
      displayName: input.participant.displayName ?? null,
      email: input.participant.email ?? null,
    },
    classification: 'unknown',
    confidence: 0.1,
    matchedBy: 'none',
    matchedUserId: null,
    matchedUserEmail: null,
    rejoinCount: input.rejoinCount ?? 0,
  }
}
