import { relations } from 'drizzle-orm'
import {
  boolean,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
} from 'drizzle-orm/pg-core'
import { user } from './auth'
import { meetingSessions } from './meetings'
import { organizations } from './orgs'
import { conferenceProviderEnum } from './provider-installations'

export const calendarProviderEnum = pgEnum('calendar_provider', [
  'google_calendar',
  'outlook_calendar',
])

export const calendarResponseStatusEnum = pgEnum('calendar_response_status', [
  'accepted',
  'tentative',
  'declined',
  'needs_action',
  'unknown',
])

export const desktopUpdateChannelEnum = pgEnum('desktop_update_channel', [
  'internal',
  'beta',
  'stable',
])

export const desktopPlatformEnum = pgEnum('desktop_platform', [
  'darwin',
  'win32',
  'linux',
  'unknown',
])

export const desktopAuthCodes = pgTable(
  'desktop_auth_codes',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    orgId: text('org_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    deviceId: text('device_id').notNull(),
    codeHash: text('code_hash').notNull(),
    redirectUri: text('redirect_uri').notNull(),
    consumedAt: timestamp('consumed_at'),
    expiresAt: timestamp('expires_at').notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => ({
    codeHashUidx: uniqueIndex('desktop_auth_codes_hash_uidx').on(
      table.codeHash
    ),
    orgUserIdx: index('desktop_auth_codes_org_user_idx').on(
      table.orgId,
      table.userId
    ),
  })
)

export const desktopSessions = pgTable(
  'desktop_sessions',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    orgId: text('org_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    deviceId: text('device_id').notNull(),
    accessTokenHash: text('access_token_hash').notNull(),
    refreshTokenHash: text('refresh_token_hash').notNull(),
    accessTokenExpiresAt: timestamp('access_token_expires_at').notNull(),
    refreshTokenExpiresAt: timestamp('refresh_token_expires_at').notNull(),
    revokedAt: timestamp('revoked_at'),
    lastUsedAt: timestamp('last_used_at'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at')
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => ({
    accessTokenUidx: uniqueIndex('desktop_sessions_access_token_uidx').on(
      table.accessTokenHash
    ),
    refreshTokenUidx: uniqueIndex('desktop_sessions_refresh_token_uidx').on(
      table.refreshTokenHash
    ),
    orgUserDeviceIdx: index('desktop_sessions_org_user_device_idx').on(
      table.orgId,
      table.userId,
      table.deviceId
    ),
  })
)

export const desktopDevices = pgTable(
  'desktop_devices',
  {
    id: text('id').primaryKey(),
    orgId: text('org_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    platform: desktopPlatformEnum('platform').notNull().default('unknown'),
    appVersion: text('app_version'),
    updateChannel: desktopUpdateChannelEnum('update_channel')
      .notNull()
      .default('internal'),
    deviceName: text('device_name'),
    lastHeartbeatAt: timestamp('last_heartbeat_at'),
    activeMeetingSessionId: text('active_meeting_session_id').references(
      () => meetingSessions.id,
      { onDelete: 'set null' }
    ),
    diagnostics: jsonb('diagnostics').$type<Record<string, unknown> | null>(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at')
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => ({
    orgUserIdx: index('desktop_devices_org_user_idx').on(
      table.orgId,
      table.userId
    ),
    heartbeatIdx: index('desktop_devices_heartbeat_idx').on(
      table.lastHeartbeatAt
    ),
  })
)

export const desktopPreferences = pgTable(
  'desktop_preferences',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    orgId: text('org_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    remindersEnabled: boolean('reminders_enabled').notNull().default(true),
    reminderLeadTimeMinutes: integer('reminder_lead_time_minutes')
      .notNull()
      .default(1),
    moveAsideEnabled: boolean('move_aside_enabled').notNull().default(true),
    launchAtLogin: boolean('launch_at_login').notNull().default(false),
    defaultLocalSessionMode: text('default_local_session_mode')
      .notNull()
      .default('solo'),
    updateChannel: desktopUpdateChannelEnum('update_channel')
      .notNull()
      .default('internal'),
    activeCalendarConnectionIds: text('active_calendar_connection_ids').array(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at')
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => ({
    orgUserUidx: uniqueIndex('desktop_preferences_org_user_uidx').on(
      table.orgId,
      table.userId
    ),
  })
)

export const calendarEventCandidates = pgTable(
  'calendar_event_candidates',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    orgId: text('org_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    calendarProvider: calendarProviderEnum('calendar_provider').notNull(),
    connectedAccountId: text('connected_account_id').notNull(),
    externalEventId: text('external_event_id').notNull(),
    iCalUid: text('ical_uid'),
    title: text('title').notNull(),
    description: text('description'),
    location: text('location'),
    startsAt: timestamp('starts_at').notNull(),
    endsAt: timestamp('ends_at'),
    responseStatus: calendarResponseStatusEnum('response_status')
      .notNull()
      .default('unknown'),
    attendees: jsonb('attendees').$type<Array<
      Record<string, unknown>
    > | null>(),
    joinUrl: text('join_url'),
    conferenceProvider: conferenceProviderEnum('conference_provider'),
    externalMeetingId: text('external_meeting_id'),
    isCanceled: boolean('is_canceled').notNull().default(false),
    isLikelyMeeting: boolean('is_likely_meeting').notNull().default(true),
    duplicateGroupKey: text('duplicate_group_key'),
    meetingSessionId: text('meeting_session_id').references(
      () => meetingSessions.id,
      { onDelete: 'set null' }
    ),
    lastSyncedAt: timestamp('last_synced_at').defaultNow().notNull(),
    metadata: jsonb('metadata').$type<Record<string, unknown> | null>(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at')
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => ({
    sourceUidx: uniqueIndex('calendar_event_candidates_source_uidx').on(
      table.orgId,
      table.userId,
      table.calendarProvider,
      table.connectedAccountId,
      table.externalEventId
    ),
    orgUserStartIdx: index('calendar_event_candidates_org_user_start_idx').on(
      table.orgId,
      table.userId,
      table.startsAt
    ),
    meetingSessionIdx: index('calendar_event_candidates_session_idx').on(
      table.meetingSessionId
    ),
    duplicateIdx: index('calendar_event_candidates_duplicate_idx').on(
      table.orgId,
      table.userId,
      table.duplicateGroupKey
    ),
  })
)

export const desktopDevicesRelations = relations(desktopDevices, ({ one }) => ({
  org: one(organizations, {
    fields: [desktopDevices.orgId],
    references: [organizations.id],
  }),
  user: one(user, {
    fields: [desktopDevices.userId],
    references: [user.id],
  }),
  activeMeetingSession: one(meetingSessions, {
    fields: [desktopDevices.activeMeetingSessionId],
    references: [meetingSessions.id],
  }),
}))

export const calendarEventCandidatesRelations = relations(
  calendarEventCandidates,
  ({ one }) => ({
    org: one(organizations, {
      fields: [calendarEventCandidates.orgId],
      references: [organizations.id],
    }),
    user: one(user, {
      fields: [calendarEventCandidates.userId],
      references: [user.id],
    }),
    meetingSession: one(meetingSessions, {
      fields: [calendarEventCandidates.meetingSessionId],
      references: [meetingSessions.id],
    }),
  })
)

export type DesktopPreferences = typeof desktopPreferences.$inferSelect
export type CalendarEventCandidate = typeof calendarEventCandidates.$inferSelect
