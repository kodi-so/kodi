import { relations } from 'drizzle-orm'
import {
  index,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
} from 'drizzle-orm/pg-core'
import { user } from './auth'
import { meetingSessions } from './meetings'
import { organizations } from './orgs'
import {
  toolSessionRuns,
  toolSessionSourceTypeEnum,
} from './toolkit-access'

export const approvalRequestStatusEnum = pgEnum('approval_request_status', [
  'pending',
  'approved',
  'rejected',
  'expired',
])

export const approvalRequests = pgTable(
  'approval_requests',
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
    requestedByUserId: text('requested_by_user_id').references(() => user.id, {
      onDelete: 'set null',
    }),
    toolSessionRunId: text('tool_session_run_id').references(
      () => toolSessionRuns.id,
      { onDelete: 'set null' }
    ),
    sourceType: toolSessionSourceTypeEnum('source_type'),
    sourceId: text('source_id'),
    toolkitSlug: text('toolkit_slug'),
    connectedAccountId: text('connected_account_id'),
    action: text('action'),
    actionCategory: text('action_category'),
    approvalType: text('approval_type').notNull(),
    subjectType: text('subject_type').notNull(),
    subjectId: text('subject_id').notNull(),
    status: approvalRequestStatusEnum('status').notNull().default('pending'),
    previewPayload: jsonb('preview_payload').$type<Record<
      string,
      unknown
    > | null>(),
    requestPayload: jsonb('request_payload').$type<Record<
      string,
      unknown
    > | null>(),
    decidedByUserId: text('decided_by_user_id').references(() => user.id, {
      onDelete: 'set null',
    }),
    decidedAt: timestamp('decided_at'),
    expiresAt: timestamp('expires_at'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => ({
    orgStatusIdx: index('approval_requests_org_status_idx').on(
      table.orgId,
      table.status
    ),
    meetingSessionIdx: index('approval_requests_meeting_session_idx').on(
      table.meetingSessionId
    ),
    toolSessionIdx: index('approval_requests_tool_session_idx').on(
      table.toolSessionRunId
    ),
    subjectIdx: index('approval_requests_subject_idx').on(
      table.subjectType,
      table.subjectId
    ),
    sourceIdx: index('approval_requests_source_idx').on(
      table.sourceType,
      table.sourceId
    ),
    toolkitIdx: index('approval_requests_toolkit_idx').on(table.toolkitSlug),
    connectedAccountIdx: index('approval_requests_connected_account_idx').on(
      table.connectedAccountId
    ),
  })
)

export const approvalRequestsRelations = relations(
  approvalRequests,
  ({ one }) => ({
    org: one(organizations, {
      fields: [approvalRequests.orgId],
      references: [organizations.id],
    }),
    meetingSession: one(meetingSessions, {
      fields: [approvalRequests.meetingSessionId],
      references: [meetingSessions.id],
    }),
    requestedByUser: one(user, {
      fields: [approvalRequests.requestedByUserId],
      references: [user.id],
    }),
    toolSessionRun: one(toolSessionRuns, {
      fields: [approvalRequests.toolSessionRunId],
      references: [toolSessionRuns.id],
    }),
    decidedByUser: one(user, {
      fields: [approvalRequests.decidedByUserId],
      references: [user.id],
    }),
  })
)

export type ApprovalRequest = typeof approvalRequests.$inferSelect
export type NewApprovalRequest = typeof approvalRequests.$inferInsert
