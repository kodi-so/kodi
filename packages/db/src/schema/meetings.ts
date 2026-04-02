import { relations } from 'drizzle-orm'
import {
  boolean,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  real,
  text,
  timestamp,
} from 'drizzle-orm/pg-core'
import { user } from './auth'
import { organizations } from './orgs'
import {
  conferenceProviderEnum,
  providerInstallations,
} from './provider-installations'

export const meetingSessionStatusEnum = pgEnum('meeting_session_status', [
  'scheduled',
  'preparing',
  'joining',
  'admitted',
  'listening',
  'processing',
  'ended',
  'live',
  'summarizing',
  'awaiting_approval',
  'executing',
  'completed',
  'failed',
])

export const meetingEventSourceEnum = pgEnum('meeting_event_source', [
  'zoom_webhook',
  'recall_webhook',
  'rtms',
  'kodi_ui',
  'agent',
  'worker',
])

export const meetingArtifactTypeEnum = pgEnum('meeting_artifact_type', [
  'summary',
  'decision_log',
  'goals',
  'action_items',
  'draft_ticket_batch',
  'execution_plan',
])

export const meetingSessions = pgTable(
  'meeting_sessions',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    orgId: text('org_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    provider: conferenceProviderEnum('provider').notNull(),
    providerInstallationId: text('provider_installation_id').references(
      () => providerInstallations.id,
      { onDelete: 'set null' }
    ),
    providerMeetingId: text('provider_meeting_id'),
    providerMeetingUuid: text('provider_meeting_uuid'),
    providerMeetingInstanceId: text('provider_meeting_instance_id'),
    providerBotSessionId: text('provider_bot_session_id'),
    hostUserId: text('host_user_id').references(() => user.id, {
      onDelete: 'set null',
    }),
    title: text('title'),
    agenda: text('agenda'),
    language: text('language'),
    status: meetingSessionStatusEnum('status').notNull().default('scheduled'),
    consentState: text('consent_state'),
    liveSummary: text('live_summary'),
    finalSummary: text('final_summary'),
    scheduledStartAt: timestamp('scheduled_start_at'),
    actualStartAt: timestamp('actual_start_at'),
    endedAt: timestamp('ended_at'),
    metadata: jsonb('metadata').$type<Record<string, unknown> | null>(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at')
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => ({
    orgStatusIdx: index('meeting_sessions_org_status_idx').on(
      table.orgId,
      table.status
    ),
    orgCreatedIdx: index('meeting_sessions_org_created_idx').on(
      table.orgId,
      table.createdAt
    ),
    providerMeetingIdx: index('meeting_sessions_provider_meeting_idx').on(
      table.provider,
      table.providerMeetingId
    ),
    providerMeetingInstanceIdx: index(
      'meeting_sessions_provider_instance_idx'
    ).on(table.provider, table.providerMeetingInstanceId),
    providerBotSessionIdx: index('meeting_sessions_provider_bot_session_idx').on(
      table.providerBotSessionId
    ),
  })
)

export const meetingParticipants = pgTable(
  'meeting_participants',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    meetingSessionId: text('meeting_session_id')
      .notNull()
      .references(() => meetingSessions.id, { onDelete: 'cascade' }),
    providerParticipantId: text('provider_participant_id'),
    displayName: text('display_name'),
    email: text('email'),
    joinedAt: timestamp('joined_at'),
    leftAt: timestamp('left_at'),
    isHost: boolean('is_host').notNull().default(false),
    isInternal: boolean('is_internal'),
    userId: text('user_id').references(() => user.id, {
      onDelete: 'set null',
    }),
    metadata: jsonb('metadata').$type<Record<string, unknown> | null>(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => ({
    meetingSessionIdx: index('meeting_participants_session_idx').on(
      table.meetingSessionId
    ),
    userIdx: index('meeting_participants_user_idx').on(table.userId),
  })
)

export const meetingEvents = pgTable(
  'meeting_events',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    meetingSessionId: text('meeting_session_id')
      .notNull()
      .references(() => meetingSessions.id, { onDelete: 'cascade' }),
    sequence: integer('sequence').notNull(),
    eventType: text('event_type').notNull(),
    source: meetingEventSourceEnum('source').notNull(),
    payload: jsonb('payload').$type<Record<string, unknown> | null>(),
    occurredAt: timestamp('occurred_at').defaultNow().notNull(),
  },
  (table) => ({
    meetingSessionSequenceIdx: index('meeting_events_session_sequence_idx').on(
      table.meetingSessionId,
      table.sequence
    ),
    meetingSessionTypeIdx: index('meeting_events_session_type_idx').on(
      table.meetingSessionId,
      table.eventType
    ),
  })
)

export const transcriptSegments = pgTable(
  'transcript_segments',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    meetingSessionId: text('meeting_session_id')
      .notNull()
      .references(() => meetingSessions.id, { onDelete: 'cascade' }),
    eventId: text('event_id').references(() => meetingEvents.id, {
      onDelete: 'set null',
    }),
    speakerParticipantId: text('speaker_participant_id').references(
      () => meetingParticipants.id,
      { onDelete: 'set null' }
    ),
    speakerName: text('speaker_name'),
    content: text('content').notNull(),
    startOffsetMs: integer('start_offset_ms'),
    endOffsetMs: integer('end_offset_ms'),
    confidence: real('confidence'),
    isPartial: boolean('is_partial').notNull().default(false),
    source: meetingEventSourceEnum('source').notNull().default('rtms'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => ({
    meetingSessionCreatedIdx: index(
      'transcript_segments_session_created_idx'
    ).on(table.meetingSessionId, table.createdAt),
    speakerIdx: index('transcript_segments_speaker_idx').on(
      table.speakerParticipantId
    ),
  })
)

export const meetingStateSnapshots = pgTable(
  'meeting_state_snapshots',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    meetingSessionId: text('meeting_session_id')
      .notNull()
      .references(() => meetingSessions.id, { onDelete: 'cascade' }),
    summary: text('summary'),
    rollingNotes: text('rolling_notes'),
    activeTopics: jsonb('active_topics').$type<string[] | null>(),
    decisions: jsonb('decisions').$type<Record<string, unknown>[] | null>(),
    openQuestions: jsonb('open_questions').$type<
      Record<string, unknown>[] | null
    >(),
    risks: jsonb('risks').$type<Record<string, unknown>[] | null>(),
    candidateTasks: jsonb('candidate_tasks').$type<
      Record<string, unknown>[] | null
    >(),
    candidateActionItems: jsonb('candidate_action_items').$type<
      Record<string, unknown>[] | null
    >(),
    draftActions: jsonb('draft_actions').$type<Record<string, unknown>[] | null>(),
    lastEventSequence: integer('last_event_sequence'),
    lastProcessedAt: timestamp('last_processed_at'),
    lastClassifiedAt: timestamp('last_classified_at'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => ({
    meetingSessionCreatedIdx: index(
      'meeting_state_snapshots_session_created_idx'
    ).on(table.meetingSessionId, table.createdAt),
  })
)

export const meetingArtifacts = pgTable(
  'meeting_artifacts',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    meetingSessionId: text('meeting_session_id')
      .notNull()
      .references(() => meetingSessions.id, { onDelete: 'cascade' }),
    artifactType: meetingArtifactTypeEnum('artifact_type').notNull(),
    title: text('title'),
    content: text('content'),
    structuredData: jsonb('structured_data').$type<
      Record<string, unknown> | Record<string, unknown>[] | null
    >(),
    status: text('status').notNull().default('generated'),
    createdBy: text('created_by'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => ({
    meetingSessionTypeIdx: index('meeting_artifacts_session_type_idx').on(
      table.meetingSessionId,
      table.artifactType
    ),
  })
)

export const meetingSessionsRelations = relations(
  meetingSessions,
  ({ one }) => ({
    org: one(organizations, {
      fields: [meetingSessions.orgId],
      references: [organizations.id],
    }),
    providerInstallation: one(providerInstallations, {
      fields: [meetingSessions.providerInstallationId],
      references: [providerInstallations.id],
    }),
    hostUser: one(user, {
      fields: [meetingSessions.hostUserId],
      references: [user.id],
    }),
  })
)

export const meetingParticipantsRelations = relations(
  meetingParticipants,
  ({ one }) => ({
    meetingSession: one(meetingSessions, {
      fields: [meetingParticipants.meetingSessionId],
      references: [meetingSessions.id],
    }),
    user: one(user, {
      fields: [meetingParticipants.userId],
      references: [user.id],
    }),
  })
)

export const meetingEventsRelations = relations(meetingEvents, ({ one }) => ({
  meetingSession: one(meetingSessions, {
    fields: [meetingEvents.meetingSessionId],
    references: [meetingSessions.id],
  }),
}))

export const transcriptSegmentsRelations = relations(
  transcriptSegments,
  ({ one }) => ({
    meetingSession: one(meetingSessions, {
      fields: [transcriptSegments.meetingSessionId],
      references: [meetingSessions.id],
    }),
    event: one(meetingEvents, {
      fields: [transcriptSegments.eventId],
      references: [meetingEvents.id],
    }),
    speakerParticipant: one(meetingParticipants, {
      fields: [transcriptSegments.speakerParticipantId],
      references: [meetingParticipants.id],
    }),
  })
)

export const meetingStateSnapshotsRelations = relations(
  meetingStateSnapshots,
  ({ one }) => ({
    meetingSession: one(meetingSessions, {
      fields: [meetingStateSnapshots.meetingSessionId],
      references: [meetingSessions.id],
    }),
  })
)

export const meetingArtifactsRelations = relations(
  meetingArtifacts,
  ({ one }) => ({
    meetingSession: one(meetingSessions, {
      fields: [meetingArtifacts.meetingSessionId],
      references: [meetingSessions.id],
    }),
  })
)

export type MeetingSession = typeof meetingSessions.$inferSelect
export type NewMeetingSession = typeof meetingSessions.$inferInsert
export type MeetingParticipant = typeof meetingParticipants.$inferSelect
export type NewMeetingParticipant = typeof meetingParticipants.$inferInsert
export type MeetingEvent = typeof meetingEvents.$inferSelect
export type NewMeetingEvent = typeof meetingEvents.$inferInsert
export type TranscriptSegment = typeof transcriptSegments.$inferSelect
export type NewTranscriptSegment = typeof transcriptSegments.$inferInsert
export type MeetingStateSnapshot = typeof meetingStateSnapshots.$inferSelect
export type NewMeetingStateSnapshot = typeof meetingStateSnapshots.$inferInsert
export type MeetingArtifact = typeof meetingArtifacts.$inferSelect
export type NewMeetingArtifact = typeof meetingArtifacts.$inferInsert
