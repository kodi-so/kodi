import { relations } from 'drizzle-orm'
import { index, pgTable, text, timestamp } from 'drizzle-orm/pg-core'
import { organizations } from './orgs'
import { user } from './auth'
import { messageRoleEnum } from './chat'

export const dashboardAssistantThreads = pgTable(
  'dashboard_assistant_threads',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    orgId: text('org_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    createdBy: text('created_by')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    title: text('title').notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (table) => ({
    orgUpdatedIdx: index('dashboard_assistant_threads_org_updated_idx').on(
      table.orgId,
      table.updatedAt
    ),
    createdByUpdatedIdx: index(
      'dashboard_assistant_threads_created_by_updated_idx'
    ).on(table.createdBy, table.updatedAt),
  })
)

export const dashboardAssistantMessages = pgTable(
  'dashboard_assistant_messages',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    orgId: text('org_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    threadId: text('thread_id')
      .notNull()
      .references(() => dashboardAssistantThreads.id, { onDelete: 'cascade' }),
    userId: text('user_id').references(() => user.id, { onDelete: 'set null' }),
    role: messageRoleEnum('role').notNull(),
    content: text('content').notNull(),
    status: text('status').notNull().default('sent'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    deletedAt: timestamp('deleted_at'),
  },
  (table) => ({
    orgCreatedIdx: index('dashboard_assistant_messages_org_created_idx').on(
      table.orgId,
      table.createdAt
    ),
    threadCreatedIdx: index(
      'dashboard_assistant_messages_thread_created_idx'
    ).on(table.threadId, table.createdAt),
  })
)

export const dashboardAssistantThreadsRelations = relations(
  dashboardAssistantThreads,
  ({ one, many }) => ({
    org: one(organizations, {
      fields: [dashboardAssistantThreads.orgId],
      references: [organizations.id],
    }),
    creator: one(user, {
      fields: [dashboardAssistantThreads.createdBy],
      references: [user.id],
    }),
    messages: many(dashboardAssistantMessages),
  })
)

export const dashboardAssistantMessagesRelations = relations(
  dashboardAssistantMessages,
  ({ one }) => ({
    org: one(organizations, {
      fields: [dashboardAssistantMessages.orgId],
      references: [organizations.id],
    }),
    thread: one(dashboardAssistantThreads, {
      fields: [dashboardAssistantMessages.threadId],
      references: [dashboardAssistantThreads.id],
    }),
    author: one(user, {
      fields: [dashboardAssistantMessages.userId],
      references: [user.id],
    }),
  })
)

export type DashboardAssistantThread =
  typeof dashboardAssistantThreads.$inferSelect
export type NewDashboardAssistantThread =
  typeof dashboardAssistantThreads.$inferInsert
export type DashboardAssistantMessage =
  typeof dashboardAssistantMessages.$inferSelect
export type NewDashboardAssistantMessage =
  typeof dashboardAssistantMessages.$inferInsert
