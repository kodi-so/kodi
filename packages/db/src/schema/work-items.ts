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

export const workItemKindEnum = pgEnum('work_item_kind', [
  'goal',
  'outcome',
  'task',
  'ticket',
  'follow_up',
])

export const workItemStatusEnum = pgEnum('work_item_status', [
  'draft',
  'approved',
  'synced',
  'executing',
  'done',
  'cancelled',
  'failed',
])

export const workItems = pgTable(
  'work_items',
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
    sourceArtifactId: text('source_artifact_id'),
    kind: workItemKindEnum('kind').notNull(),
    title: text('title').notNull(),
    description: text('description'),
    ownerUserId: text('owner_user_id').references(() => user.id, {
      onDelete: 'set null',
    }),
    status: workItemStatusEnum('status').notNull().default('draft'),
    priority: text('priority'),
    dueAt: timestamp('due_at'),
    externalSystem: text('external_system'),
    externalId: text('external_id'),
    metadata: jsonb('metadata').$type<Record<string, unknown> | null>(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at')
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => ({
    orgStatusIdx: index('work_items_org_status_idx').on(
      table.orgId,
      table.status
    ),
    orgCreatedIdx: index('work_items_org_created_idx').on(
      table.orgId,
      table.createdAt
    ),
    meetingSessionIdx: index('work_items_meeting_session_idx').on(
      table.meetingSessionId
    ),
  })
)

export const workItemsRelations = relations(workItems, ({ one }) => ({
  org: one(organizations, {
    fields: [workItems.orgId],
    references: [organizations.id],
  }),
  meetingSession: one(meetingSessions, {
    fields: [workItems.meetingSessionId],
    references: [meetingSessions.id],
  }),
  ownerUser: one(user, {
    fields: [workItems.ownerUserId],
    references: [user.id],
  }),
}))

export type WorkItem = typeof workItems.$inferSelect
export type NewWorkItem = typeof workItems.$inferInsert
