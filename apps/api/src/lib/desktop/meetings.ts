import {
  calendarEventCandidates,
  db,
  desktopDevices,
  desktopPreferences,
  meetingSessions,
} from '@kodi/db'
import { TRPCError } from '@trpc/server'
import {
  inferMeetingProviderFromUrl,
  resolveMeetingIdFromJoinUrl,
} from '../meetings/provider-url'
import { featureFlags } from '../features'

type Database = typeof db
type CalendarCandidate = typeof calendarEventCandidates.$inferSelect
type DesktopPreference = typeof desktopPreferences.$inferSelect

const LIVE_STATUSES = [
  'preparing',
  'joining',
  'admitted',
  'listening',
  'processing',
  'live',
] as const

export const DEFAULT_DESKTOP_PREFERENCES = {
  remindersEnabled: true,
  reminderLeadTimeMinutes: 1,
  moveAsideEnabled: true,
  launchAtLogin: false,
  defaultLocalSessionMode: 'solo' as const,
  updateChannel: 'internal' as const,
  activeCalendarConnectionIds: null as string[] | null,
}

export function normalizeJoinMetadata(joinUrl: string | null | undefined) {
  if (!joinUrl) return { conferenceProvider: null, externalMeetingId: null }
  const inferred = inferMeetingProviderFromUrl(joinUrl)
  const conferenceProvider: 'zoom' | 'google_meet' | null =
    inferred === 'zoom' || inferred === 'google_meet' ? inferred : null
  return {
    conferenceProvider,
    externalMeetingId: conferenceProvider
      ? resolveMeetingIdFromJoinUrl(joinUrl, conferenceProvider)
      : null,
  }
}

export function duplicateGroupKey(input: {
  iCalUid?: string | null
  title: string
  startsAt: Date
  joinUrl?: string | null
}) {
  if (input.iCalUid) return `ical:${input.iCalUid}`
  if (input.joinUrl) return `url:${input.joinUrl}`
  return [
    'title-start',
    input.title.trim().toLowerCase().replace(/\s+/g, ' '),
    input.startsAt.toISOString(),
  ].join(':')
}

export async function getDesktopPreferences(
  database: Database,
  input: { orgId: string; userId: string }
): Promise<DesktopPreference> {
  const existing = await database.query.desktopPreferences.findFirst({
    where: (fields, { and, eq }) =>
      and(eq(fields.orgId, input.orgId), eq(fields.userId, input.userId)),
  })
  if (existing) return existing

  const [created] = await database
    .insert(desktopPreferences)
    .values({
      orgId: input.orgId,
      userId: input.userId,
      ...DEFAULT_DESKTOP_PREFERENCES,
    })
    .returning()
  if (!created) throw new Error('Failed to create desktop preferences.')
  return created
}

export function serializePreferences(row: DesktopPreference) {
  return {
    remindersEnabled: row.remindersEnabled,
    reminderLeadTimeMinutes: row.reminderLeadTimeMinutes,
    moveAsideEnabled: row.moveAsideEnabled,
    launchAtLogin: row.launchAtLogin,
    defaultLocalSessionMode:
      row.defaultLocalSessionMode === 'room'
        ? ('room' as const)
        : ('solo' as const),
    updateChannel: row.updateChannel,
    activeCalendarConnectionIds: row.activeCalendarConnectionIds ?? null,
  }
}

function serializeMeeting(row: typeof meetingSessions.$inferSelect) {
  return {
    id: row.id,
    title: row.title ?? 'Untitled meeting',
    provider: row.provider,
    status: row.status,
    startsAt:
      row.actualStartAt?.toISOString() ??
      row.scheduledStartAt?.toISOString() ??
      row.createdAt.toISOString(),
    endedAt: row.endedAt?.toISOString() ?? null,
    liveSummary: row.liveSummary ?? row.finalSummary ?? null,
  }
}

export function serializeUpcoming(row: CalendarCandidate) {
  const isSupported =
    !row.isCanceled &&
    row.isLikelyMeeting &&
    Boolean(row.joinUrl && row.conferenceProvider)
  return {
    id: row.id,
    title: row.title,
    startsAt: row.startsAt.toISOString(),
    endsAt: row.endsAt?.toISOString() ?? null,
    calendarProvider: row.calendarProvider,
    joinUrl: row.joinUrl,
    conferenceProvider:
      row.conferenceProvider === 'zoom' ||
      row.conferenceProvider === 'google_meet'
        ? row.conferenceProvider
        : null,
    externalMeetingId: row.externalMeetingId,
    responseStatus: row.responseStatus,
    isSupported,
    suggestedAction: isSupported
      ? ('join_with_kodi' as const)
      : ('start_local_note' as const),
    meetingSessionId: row.meetingSessionId,
    duplicateGroupKey: row.duplicateGroupKey,
  }
}

export async function listUpcomingDesktopMeetings(
  database: Database,
  input: {
    orgId: string
    userId: string
    from?: Date
    to?: Date
    limit?: number
  }
) {
  const now = input.from ?? new Date()
  const horizon = input.to ?? new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000)
  const rows = await database.query.calendarEventCandidates.findMany({
    where: (fields, { and, eq, gte, lte }) =>
      and(
        eq(fields.orgId, input.orgId),
        eq(fields.userId, input.userId),
        gte(fields.startsAt, now),
        lte(fields.startsAt, horizon)
      ),
    orderBy: (fields, { asc }) => asc(fields.startsAt),
    limit: Math.min(input.limit ?? 20, 50),
  })

  const seen = new Set<string>()
  return rows.filter((row) => {
    if (!row.duplicateGroupKey) return true
    if (seen.has(row.duplicateGroupKey)) return false
    seen.add(row.duplicateGroupKey)
    return true
  })
}

export async function listRecentDesktopMeetings(
  database: Database,
  input: { orgId: string; limit?: number }
) {
  const rows = await database.query.meetingSessions.findMany({
    where: (fields, { eq }) => eq(fields.orgId, input.orgId),
    orderBy: (fields, { desc }) => desc(fields.updatedAt),
    limit: Math.min(input.limit ?? 8, 20),
  })
  return rows.map(serializeMeeting)
}

export async function getActiveLiveSession(
  database: Database,
  input: { orgId: string; userId: string; deviceId?: string | null }
) {
  if (input.deviceId) {
    const device = await database.query.desktopDevices.findFirst({
      where: (fields, { and, eq }) =>
        and(eq(fields.id, input.deviceId!), eq(fields.orgId, input.orgId)),
    })
    if (device?.activeMeetingSessionId) {
      const meeting = await database.query.meetingSessions.findFirst({
        where: (fields, { and, eq }) =>
          and(
            eq(fields.id, device.activeMeetingSessionId!),
            eq(fields.orgId, input.orgId)
          ),
      })
      if (meeting && LIVE_STATUSES.includes(meeting.status as never)) {
        return serializeMeeting(meeting)
      }
    }
  }

  const meeting = await database.query.meetingSessions.findFirst({
    where: (fields, { and, eq, inArray }) =>
      and(eq(fields.orgId, input.orgId), inArray(fields.status, LIVE_STATUSES)),
    orderBy: (fields, { desc }) => desc(fields.updatedAt),
  })
  return meeting ? serializeMeeting(meeting) : null
}

export async function buildDesktopBootstrap(
  database: Database,
  input: {
    org: { id: string; name: string; slug: string | null }
    user: { id: string; name: string; email: string }
    platform: 'darwin' | 'win32' | 'linux' | 'unknown'
    deviceId?: string | null
  }
) {
  const [preferences, upcoming, recent, activeLiveSession] = await Promise.all([
    getDesktopPreferences(database, {
      orgId: input.org.id,
      userId: input.user.id,
    }),
    listUpcomingDesktopMeetings(database, {
      orgId: input.org.id,
      userId: input.user.id,
      limit: 12,
    }),
    listRecentDesktopMeetings(database, { orgId: input.org.id, limit: 8 }),
    getActiveLiveSession(database, {
      orgId: input.org.id,
      userId: input.user.id,
      deviceId: input.deviceId,
    }),
  ])

  return {
    org: input.org,
    user: input.user,
    preferences: serializePreferences(preferences),
    capabilities: {
      externalMeetings: featureFlags.meetingIntelligence,
      localMeetings: featureFlags.localMeetings,
      reminders: featureFlags.desktopApp,
      moveAside: true,
      loginItems: input.platform === 'darwin' || input.platform === 'win32',
      autoUpdate: true,
      platform: input.platform,
    },
    activeLiveSession,
    upcomingMeetings: upcoming.map(serializeUpcoming),
    recentMeetings: recent,
    serverTime: new Date().toISOString(),
  }
}

export async function upsertCalendarEventCandidate(
  database: Database,
  input: {
    orgId: string
    userId: string
    calendarProvider: 'google_calendar' | 'outlook_calendar'
    connectedAccountId: string
    externalEventId: string
    iCalUid?: string | null
    title: string
    description?: string | null
    location?: string | null
    startsAt: Date
    endsAt?: Date | null
    responseStatus?:
      | 'accepted'
      | 'tentative'
      | 'declined'
      | 'needs_action'
      | 'unknown'
    attendees?: Array<Record<string, unknown>> | null
    joinUrl?: string | null
    isCanceled?: boolean
    isLikelyMeeting?: boolean
    metadata?: Record<string, unknown> | null
  }
) {
  const { conferenceProvider, externalMeetingId } = normalizeJoinMetadata(
    input.joinUrl
  )
  const values = {
    orgId: input.orgId,
    userId: input.userId,
    calendarProvider: input.calendarProvider,
    connectedAccountId: input.connectedAccountId,
    externalEventId: input.externalEventId,
    iCalUid: input.iCalUid ?? null,
    title: input.title,
    description: input.description ?? null,
    location: input.location ?? null,
    startsAt: input.startsAt,
    endsAt: input.endsAt ?? null,
    responseStatus: input.responseStatus ?? 'unknown',
    attendees: input.attendees ?? null,
    joinUrl: input.joinUrl ?? null,
    conferenceProvider,
    externalMeetingId,
    isCanceled: input.isCanceled ?? false,
    isLikelyMeeting: input.isLikelyMeeting ?? true,
    duplicateGroupKey: duplicateGroupKey(input),
    lastSyncedAt: new Date(),
    metadata: input.metadata ?? null,
  }

  const [row] = await database
    .insert(calendarEventCandidates)
    .values(values)
    .onConflictDoUpdate({
      target: [
        calendarEventCandidates.orgId,
        calendarEventCandidates.userId,
        calendarEventCandidates.calendarProvider,
        calendarEventCandidates.connectedAccountId,
        calendarEventCandidates.externalEventId,
      ],
      set: { ...values, updatedAt: new Date() },
    })
    .returning()

  if (!row) throw new Error('Failed to upsert calendar event candidate.')
  return row
}

export async function ensureCalendarEventCandidateForLaunch(
  database: Database,
  input: { orgId: string; userId: string; calendarEventId: string }
) {
  const event = await database.query.calendarEventCandidates.findFirst({
    where: (fields, { and, eq }) =>
      and(
        eq(fields.id, input.calendarEventId),
        eq(fields.orgId, input.orgId),
        eq(fields.userId, input.userId)
      ),
  })

  if (!event) {
    throw new TRPCError({
      code: 'NOT_FOUND',
      message: 'Scheduled calendar event not found.',
    })
  }

  return event
}
