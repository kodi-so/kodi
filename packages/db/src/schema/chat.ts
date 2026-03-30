import { pgTable, text, timestamp, pgEnum, index } from 'drizzle-orm/pg-core'
import { relations } from 'drizzle-orm'
import { organizations } from './orgs'

export const messageRoleEnum = pgEnum('message_role', ['user', 'assistant'])

export const chatMessages = pgTable(
  'chat_messages',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    orgId: text('org_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    userId: text('user_id'), // null for assistant messages
    role: messageRoleEnum('role').notNull(),
    content: text('content').notNull(),
    // 'pending' | 'sent' | 'error' — used to show retry UI on failure
    status: text('status').notNull().default('sent'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    deletedAt: timestamp('deleted_at'), // soft delete timestamp
  },
  (table) => ({
    orgCreatedIdx: index('chat_messages_org_created_idx').on(
      table.orgId,
      table.createdAt
    ),
  })
)

export const chatMessagesRelations = relations(chatMessages, ({ one }) => ({
  org: one(organizations, {
    fields: [chatMessages.orgId],
    references: [organizations.id],
  }),
}))

export type ChatMessage = typeof chatMessages.$inferSelect
export type NewChatMessage = typeof chatMessages.$inferInsert
