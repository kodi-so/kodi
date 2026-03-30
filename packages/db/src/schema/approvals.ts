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
    approvalType: text('approval_type').notNull(),
    subjectType: text('subject_type').notNull(),
    subjectId: text('subject_id').notNull(),
    status: approvalRequestStatusEnum('status').notNull().default('pending'),
    previewPayload: jsonb('preview_payload').$type<Record<
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
    subjectIdx: index('approval_requests_subject_idx').on(
      table.subjectType,
      table.subjectId
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
    decidedByUser: one(user, {
      fields: [approvalRequests.decidedByUserId],
      references: [user.id],
    }),
  })
)

export type ApprovalRequest = typeof approvalRequests.$inferSelect
export type NewApprovalRequest = typeof approvalRequests.$inferInsert
