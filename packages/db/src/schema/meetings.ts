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
  uniqueIndex,
} from 'drizzle-orm/pg-core'
import { user } from './auth'
import { organizations } from './orgs'
import {
  conferenceProviderEnum,
  providerInstallations,
} from './provider-installations'
import { meetingParticipationModeValues } from '../lib/meeting-copilot'

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

export const meetingAnswerStatusEnum = pgEnum('meeting_answer_status', [
  'requested',
  'preparing',
  'grounded',
  'suppressed',
  'delivered_to_ui',
  'delivered_to_chat',
  'failed',
  'canceled',
  'stale',
])

export const meetingAnswerEventTypeEnum = pgEnum('meeting_answer_event_type', [
  'requested',
  'generating',
  'grounded',
  'suppressed',
  'canceled',
  'delivering_to_ui',
  'delivered_to_ui',
  'delivering_to_chat',
  'delivered_to_chat',
  'failed',
  'stale',
])

export const meetingParticipationModeEnum = pgEnum(
  'meeting_participation_mode',
  meetingParticipationModeValues
)

export const meetingAdapterHealthStatusEnum = pgEnum(
  'meeting_adapter_health_status',
  ['healthy', 'degraded', 'down']
)

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

export const meetingCopilotSettings = pgTable('meeting_copilot_settings', {
  orgId: text('org_id')
    .primaryKey()
    .references(() => organizations.id, { onDelete: 'cascade' }),
  botDisplayName: text('bot_display_name'),
  defaultParticipationMode: meetingParticipationModeEnum(
    'default_participation_mode'
  )
    .notNull()
    .default('chat_enabled'),
  chatResponsesRequireExplicitAsk: boolean(
    'chat_responses_require_explicit_ask'
  )
    .notNull()
    .default(true),
  voiceResponsesRequireExplicitPrompt: boolean(
    'voice_responses_require_explicit_prompt'
  )
    .notNull()
    .default(true),
  allowMeetingHostControls: boolean('allow_meeting_host_controls')
    .notNull()
    .default(true),
  consentNoticeEnabled: boolean('consent_notice_enabled')
    .notNull()
    .default(true),
  transcriptRetentionDays: integer('transcript_retention_days')
    .notNull()
    .default(30),
  artifactRetentionDays: integer('artifact_retention_days')
    .notNull()
    .default(180),
  updatedBy: text('updated_by').references(() => user.id, {
    onDelete: 'set null',
  }),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at')
    .defaultNow()
    .$onUpdate(() => new Date())
    .notNull(),
})

export const meetingSessionControls = pgTable(
  'meeting_session_controls',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    orgId: text('org_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    meetingSessionId: text('meeting_session_id')
      .notNull()
      .references(() => meetingSessions.id, { onDelete: 'cascade' }),
    participationMode: meetingParticipationModeEnum('participation_mode')
      .notNull()
      .default('chat_enabled'),
    allowHostControls: boolean('allow_host_controls').notNull().default(true),
    liveResponsesDisabled: boolean('live_responses_disabled')
      .notNull()
      .default(false),
    liveResponsesDisabledReason: text('live_responses_disabled_reason'),
    updatedBy: text('updated_by').references(() => user.id, {
      onDelete: 'set null',
    }),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at')
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => ({
    meetingSessionIdx: uniqueIndex('meeting_session_controls_session_uidx').on(
      table.meetingSessionId
    ),
    orgMeetingIdx: index('meeting_session_controls_org_session_idx').on(
      table.orgId,
      table.meetingSessionId
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
    dedupeKey: text('dedupe_key'),
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
    meetingSessionDedupeUidx: uniqueIndex(
      'meeting_events_session_dedupe_uidx'
    ).on(table.meetingSessionId, table.dedupeKey),
  })
)

export const meetingSessionHealth = pgTable(
  'meeting_session_health',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    meetingSessionId: text('meeting_session_id')
      .notNull()
      .references(() => meetingSessions.id, { onDelete: 'cascade' }),
    provider: conferenceProviderEnum('provider').notNull(),
    status: meetingAdapterHealthStatusEnum('status').notNull(),
    lifecycleState: text('lifecycle_state'),
    detail: text('detail'),
    metadata: jsonb('metadata').$type<Record<string, unknown> | null>(),
    observedAt: timestamp('observed_at').notNull(),
    updatedAt: timestamp('updated_at')
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => ({
    meetingSessionUidx: uniqueIndex('meeting_session_health_session_uidx').on(
      table.meetingSessionId
    ),
    meetingSessionObservedIdx: index(
      'meeting_session_health_session_observed_idx'
    ).on(table.meetingSessionId, table.observedAt),
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
    health: one(meetingSessionHealth, {
      fields: [meetingSessions.id],
      references: [meetingSessionHealth.meetingSessionId],
    }),
    controls: one(meetingSessionControls, {
      fields: [meetingSessions.id],
      references: [meetingSessionControls.meetingSessionId],
    }),
  })
)

export const meetingCopilotSettingsRelations = relations(
  meetingCopilotSettings,
  ({ one }) => ({
    org: one(organizations, {
      fields: [meetingCopilotSettings.orgId],
      references: [organizations.id],
    }),
    updatedByUser: one(user, {
      fields: [meetingCopilotSettings.updatedBy],
      references: [user.id],
    }),
  })
)

export const meetingSessionControlsRelations = relations(
  meetingSessionControls,
  ({ one }) => ({
    org: one(organizations, {
      fields: [meetingSessionControls.orgId],
      references: [organizations.id],
    }),
    meetingSession: one(meetingSessions, {
      fields: [meetingSessionControls.meetingSessionId],
      references: [meetingSessions.id],
    }),
    updatedByUser: one(user, {
      fields: [meetingSessionControls.updatedBy],
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

export const meetingSessionHealthRelations = relations(
  meetingSessionHealth,
  ({ one }) => ({
    meetingSession: one(meetingSessions, {
      fields: [meetingSessionHealth.meetingSessionId],
      references: [meetingSessions.id],
    }),
  })
)

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

export const meetingAnswers = pgTable(
  'meeting_answers',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    meetingSessionId: text('meeting_session_id')
      .notNull()
      .references(() => meetingSessions.id, { onDelete: 'cascade' }),
    orgId: text('org_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    requestedByUserId: text('requested_by_user_id').references(() => user.id, {
      onDelete: 'set null',
    }),
    source: text('source').notNull().default('ui'),
    question: text('question').notNull(),
    answerText: text('answer_text'),
    status: meetingAnswerStatusEnum('status').notNull().default('requested'),
    suppressionReason: text('suppression_reason'),
    groundingContext: jsonb('grounding_context').$type<Record<string, unknown> | null>(),
    deliveredToZoomChatAt: timestamp('delivered_to_zoom_chat_at'),
    canceledAt: timestamp('canceled_at'),
    staleAt: timestamp('stale_at'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at')
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => ({
    meetingSessionIdx: index('meeting_answers_session_idx').on(table.meetingSessionId),
    orgIdx: index('meeting_answers_org_idx').on(table.orgId),
    meetingSessionStatusIdx: index('meeting_answers_session_status_idx').on(
      table.meetingSessionId,
      table.status
    ),
  })
)

export const meetingAnswerEvents = pgTable(
  'meeting_answer_events',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    answerId: text('answer_id')
      .notNull()
      .references(() => meetingAnswers.id, { onDelete: 'cascade' }),
    meetingSessionId: text('meeting_session_id')
      .notNull()
      .references(() => meetingSessions.id, { onDelete: 'cascade' }),
    eventType: meetingAnswerEventTypeEnum('event_type').notNull(),
    metadata: jsonb('metadata').$type<Record<string, unknown> | null>(),
    occurredAt: timestamp('occurred_at').defaultNow().notNull(),
  },
  (table) => ({
    answerIdx: index('meeting_answer_events_answer_idx').on(table.answerId),
    meetingSessionIdx: index('meeting_answer_events_session_idx').on(table.meetingSessionId),
  })
)

export const meetingAnswersRelations = relations(meetingAnswers, ({ one, many }) => ({
  meetingSession: one(meetingSessions, {
    fields: [meetingAnswers.meetingSessionId],
    references: [meetingSessions.id],
  }),
  org: one(organizations, {
    fields: [meetingAnswers.orgId],
    references: [organizations.id],
  }),
  requestedByUser: one(user, {
    fields: [meetingAnswers.requestedByUserId],
    references: [user.id],
  }),
  events: many(meetingAnswerEvents),
}))

export const meetingAnswerEventsRelations = relations(meetingAnswerEvents, ({ one }) => ({
  answer: one(meetingAnswers, {
    fields: [meetingAnswerEvents.answerId],
    references: [meetingAnswers.id],
  }),
  meetingSession: one(meetingSessions, {
    fields: [meetingAnswerEvents.meetingSessionId],
    references: [meetingSessions.id],
  }),
}))

export type MeetingSession = typeof meetingSessions.$inferSelect
export type NewMeetingSession = typeof meetingSessions.$inferInsert
export type MeetingCopilotSetting = typeof meetingCopilotSettings.$inferSelect
export type NewMeetingCopilotSetting = typeof meetingCopilotSettings.$inferInsert
export type MeetingSessionControl = typeof meetingSessionControls.$inferSelect
export type NewMeetingSessionControl = typeof meetingSessionControls.$inferInsert
export type MeetingParticipant = typeof meetingParticipants.$inferSelect
export type NewMeetingParticipant = typeof meetingParticipants.$inferInsert
export type MeetingEvent = typeof meetingEvents.$inferSelect
export type NewMeetingEvent = typeof meetingEvents.$inferInsert
export type MeetingSessionHealth = typeof meetingSessionHealth.$inferSelect
export type NewMeetingSessionHealth = typeof meetingSessionHealth.$inferInsert
export type TranscriptSegment = typeof transcriptSegments.$inferSelect
export type NewTranscriptSegment = typeof transcriptSegments.$inferInsert
export type MeetingStateSnapshot = typeof meetingStateSnapshots.$inferSelect
export type NewMeetingStateSnapshot = typeof meetingStateSnapshots.$inferInsert
export type MeetingArtifact = typeof meetingArtifacts.$inferSelect
export type NewMeetingArtifact = typeof meetingArtifacts.$inferInsert
export type MeetingAnswer = typeof meetingAnswers.$inferSelect
export type NewMeetingAnswer = typeof meetingAnswers.$inferInsert
export type MeetingAnswerEvent = typeof meetingAnswerEvents.$inferSelect
export type NewMeetingAnswerEvent = typeof meetingAnswerEvents.$inferInsert
export type MeetingAnswerStatus = (typeof meetingAnswerStatusEnum.enumValues)[number]
export type MeetingAnswerEventType = (typeof meetingAnswerEventTypeEnum.enumValues)[number]
