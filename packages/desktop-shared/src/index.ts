import { z } from 'zod'

export const desktopUpdateChannelSchema = z.enum(['internal', 'beta', 'stable'])

export const desktopPlatformSchema = z.enum([
  'darwin',
  'win32',
  'linux',
  'unknown',
])

export const localSessionModeSchema = z.enum(['solo', 'room'])

export const calendarProviderSchema = z.enum([
  'google_calendar',
  'outlook_calendar',
])

export const meetingProviderSchema = z.enum(['zoom', 'google_meet', 'local'])

export const desktopPreferencesSchema = z.object({
  remindersEnabled: z.boolean(),
  reminderLeadTimeMinutes: z.number().int().min(0).max(60),
  moveAsideEnabled: z.boolean(),
  launchAtLogin: z.boolean(),
  defaultLocalSessionMode: localSessionModeSchema,
  updateChannel: desktopUpdateChannelSchema,
  activeCalendarConnectionIds: z.array(z.string()).nullable(),
})

export const desktopCapabilitySchema = z.object({
  externalMeetings: z.boolean(),
  localMeetings: z.boolean(),
  reminders: z.boolean(),
  moveAside: z.boolean(),
  loginItems: z.boolean(),
  autoUpdate: z.boolean(),
  platform: desktopPlatformSchema,
})

export const desktopMeetingSummarySchema = z.object({
  id: z.string(),
  title: z.string(),
  provider: meetingProviderSchema.or(z.string()),
  status: z.string(),
  startsAt: z.string().nullable(),
  endedAt: z.string().nullable(),
  liveSummary: z.string().nullable(),
})

export const desktopUpcomingMeetingSchema = z.object({
  id: z.string(),
  title: z.string(),
  startsAt: z.string(),
  endsAt: z.string().nullable(),
  calendarProvider: calendarProviderSchema,
  joinUrl: z.string().url().nullable(),
  conferenceProvider: meetingProviderSchema.nullable(),
  externalMeetingId: z.string().nullable(),
  responseStatus: z.string(),
  isSupported: z.boolean(),
  suggestedAction: z.enum(['join_with_kodi', 'start_local_note', 'open_event']),
  meetingSessionId: z.string().nullable(),
  duplicateGroupKey: z.string().nullable(),
})

export const desktopBootstrapSchema = z.object({
  org: z.object({
    id: z.string(),
    name: z.string(),
    slug: z.string().nullable(),
  }),
  user: z.object({
    id: z.string(),
    name: z.string(),
    email: z.string(),
  }),
  preferences: desktopPreferencesSchema,
  capabilities: desktopCapabilitySchema,
  activeLiveSession: desktopMeetingSummarySchema.nullable(),
  upcomingMeetings: z.array(desktopUpcomingMeetingSchema),
  recentMeetings: z.array(desktopMeetingSummarySchema),
  serverTime: z.string(),
})

export type DesktopPreferences = z.infer<typeof desktopPreferencesSchema>
export type DesktopCapability = z.infer<typeof desktopCapabilitySchema>
export type DesktopUpcomingMeeting = z.infer<
  typeof desktopUpcomingMeetingSchema
>
export type DesktopMeetingSummary = z.infer<typeof desktopMeetingSummarySchema>
export type DesktopBootstrap = z.infer<typeof desktopBootstrapSchema>

export function formatMeetingTime(value: string | Date) {
  const date = typeof value === 'string' ? new Date(value) : value
  return new Intl.DateTimeFormat(undefined, {
    hour: 'numeric',
    minute: '2-digit',
  }).format(date)
}

export function formatMeetingDay(value: string | Date) {
  const date = typeof value === 'string' ? new Date(value) : value
  const today = new Date()
  const tomorrow = new Date(today)
  tomorrow.setDate(today.getDate() + 1)

  if (date.toDateString() === today.toDateString()) return 'Today'
  if (date.toDateString() === tomorrow.toDateString()) return 'Tomorrow'

  return new Intl.DateTimeFormat(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  }).format(date)
}

export function suggestedActionLabel(
  action: DesktopUpcomingMeeting['suggestedAction']
) {
  if (action === 'join_with_kodi') return 'Join with Kodi'
  if (action === 'start_local_note') return 'Start local note'
  return 'Open event'
}
