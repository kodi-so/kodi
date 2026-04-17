import { pgTable, text, timestamp, jsonb, index } from 'drizzle-orm/pg-core'
import { relations } from 'drizzle-orm'
import { organizations } from './orgs'

export const activityLog = pgTable(
  'activity_log',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    orgId: text('org_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    userId: text('user_id'), // null for agent-initiated actions
    action: text('action').notNull(), // e.g. 'member.invited', 'member.joined', 'member.removed'
    metadata: jsonb('metadata'), // action-specific context
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => ({
    orgCreatedIdx: index('activity_log_org_created_idx').on(
      table.orgId,
      table.createdAt
    ),
  })
)

export const activityLogRelations = relations(activityLog, ({ one }) => ({
  org: one(organizations, {
    fields: [activityLog.orgId],
    references: [organizations.id],
  }),
}))

export type ActivityItem = typeof activityLog.$inferSelect
export type NewActivityItem = typeof activityLog.$inferInsert
