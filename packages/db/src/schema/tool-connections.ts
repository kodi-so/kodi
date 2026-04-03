import { relations } from 'drizzle-orm'
import {
  integer,
  index,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
} from 'drizzle-orm/pg-core'
import { approvalRequests } from './approvals'
import { user } from './auth'
import { meetingSessions } from './meetings'
import { organizations } from './orgs'
import { toolSessionRuns, toolSessionSourceTypeEnum } from './toolkit-access'
import { workItems } from './work-items'

export const toolProviderEnum = pgEnum('tool_provider', [
  'linear',
  'github',
  'slack',
  'jira',
  'notion',
  'zoom',
])

export const toolConnectionStatusEnum = pgEnum('tool_connection_status', [
  'pending',
  'active',
  'error',
  'revoked',
])

export const toolActionRunStatusEnum = pgEnum('tool_action_run_status', [
  'pending',
  'running',
  'succeeded',
  'failed',
  'cancelled',
])

export const toolActionCategoryEnum = pgEnum('tool_action_category', [
  'read',
  'draft',
  'write',
  'admin',
])

export const toolConnections = pgTable(
  'tool_connections',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    orgId: text('org_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    tool: toolProviderEnum('tool').notNull(),
    status: toolConnectionStatusEnum('status').notNull().default('pending'),
    connectedByUserId: text('connected_by_user_id').references(() => user.id, {
      onDelete: 'set null',
    }),
    externalAccountId: text('external_account_id'),
    displayName: text('display_name'),
    credentialsCiphertext: text('credentials_ciphertext'),
    scopes: text('scopes').array(),
    metadata: jsonb('metadata').$type<Record<string, unknown> | null>(),
    lastValidatedAt: timestamp('last_validated_at'),
    errorMessage: text('error_message'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at')
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => ({
    orgToolIdx: index('tool_connections_org_tool_idx').on(
      table.orgId,
      table.tool
    ),
    orgStatusIdx: index('tool_connections_org_status_idx').on(
      table.orgId,
      table.status
    ),
  })
)

export const toolActionRuns = pgTable(
  'tool_action_runs',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    orgId: text('org_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    meetingSessionId: text('meeting_session_id').references(
      () => meetingSessions.id,
      { onDelete: 'set null' }
    ),
    workItemId: text('work_item_id').references(() => workItems.id, {
      onDelete: 'set null',
    }),
    actorUserId: text('actor_user_id').references(() => user.id, {
      onDelete: 'set null',
    }),
    approvalRequestId: text('approval_request_id').references(
      () => approvalRequests.id,
      { onDelete: 'set null' }
    ),
    toolConnectionId: text('tool_connection_id').references(
      () => toolConnections.id,
      { onDelete: 'set null' }
    ),
    tool: toolProviderEnum('tool'),
    toolkitSlug: text('toolkit_slug'),
    connectedAccountId: text('connected_account_id'),
    toolSessionRunId: text('tool_session_run_id').references(
      () => toolSessionRuns.id,
      { onDelete: 'set null' }
    ),
    sourceType: toolSessionSourceTypeEnum('source_type'),
    sourceId: text('source_id'),
    action: text('action').notNull(),
    actionCategory: toolActionCategoryEnum('action_category'),
    targetText: text('target_text'),
    idempotencyKey: text('idempotency_key'),
    attemptCount: integer('attempt_count').notNull().default(0),
    status: toolActionRunStatusEnum('status').notNull().default('pending'),
    requestPayload: jsonb('request_payload').$type<Record<
      string,
      unknown
    > | null>(),
    responsePayload: jsonb('response_payload').$type<Record<
      string,
      unknown
    > | null>(),
    transitionHistory: jsonb('transition_history').$type<
      Array<Record<string, unknown>> | null
    >(),
    externalLogId: text('external_log_id'),
    error: text('error'),
    startedAt: timestamp('started_at'),
    completedAt: timestamp('completed_at'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => ({
    orgStatusIdx: index('tool_action_runs_org_status_idx').on(
      table.orgId,
      table.status
    ),
    workItemIdx: index('tool_action_runs_work_item_idx').on(table.workItemId),
    meetingSessionIdx: index('tool_action_runs_meeting_session_idx').on(
      table.meetingSessionId
    ),
    actorUserIdx: index('tool_action_runs_actor_user_idx').on(
      table.actorUserId
    ),
    approvalRequestIdx: index('tool_action_runs_approval_request_idx').on(
      table.approvalRequestId
    ),
    toolkitSlugIdx: index('tool_action_runs_toolkit_slug_idx').on(
      table.toolkitSlug
    ),
    toolSessionRunIdx: index('tool_action_runs_tool_session_run_idx').on(
      table.toolSessionRunId
    ),
    sourceIdx: index('tool_action_runs_source_idx').on(
      table.sourceType,
      table.sourceId
    ),
    orgIdempotencyUidx: uniqueIndex('tool_action_runs_org_idempotency_uidx').on(
      table.orgId,
      table.idempotencyKey
    ),
  })
)

export const toolConnectionsRelations = relations(
  toolConnections,
  ({ one }) => ({
    org: one(organizations, {
      fields: [toolConnections.orgId],
      references: [organizations.id],
    }),
    connectedByUser: one(user, {
      fields: [toolConnections.connectedByUserId],
      references: [user.id],
    }),
  })
)

export const toolActionRunsRelations = relations(toolActionRuns, ({ one }) => ({
  org: one(organizations, {
    fields: [toolActionRuns.orgId],
    references: [organizations.id],
  }),
  meetingSession: one(meetingSessions, {
    fields: [toolActionRuns.meetingSessionId],
    references: [meetingSessions.id],
  }),
  workItem: one(workItems, {
    fields: [toolActionRuns.workItemId],
    references: [workItems.id],
  }),
  actorUser: one(user, {
    fields: [toolActionRuns.actorUserId],
    references: [user.id],
  }),
  approvalRequest: one(approvalRequests, {
    fields: [toolActionRuns.approvalRequestId],
    references: [approvalRequests.id],
  }),
  toolConnection: one(toolConnections, {
    fields: [toolActionRuns.toolConnectionId],
    references: [toolConnections.id],
  }),
  toolSessionRun: one(toolSessionRuns, {
    fields: [toolActionRuns.toolSessionRunId],
    references: [toolSessionRuns.id],
  }),
}))

export type ToolConnection = typeof toolConnections.$inferSelect
export type NewToolConnection = typeof toolConnections.$inferInsert
export type ToolActionRun = typeof toolActionRuns.$inferSelect
export type NewToolActionRun = typeof toolActionRuns.$inferInsert
