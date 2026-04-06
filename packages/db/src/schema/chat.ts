import { relations } from 'drizzle-orm'
import {
  AnyPgColumn,
  index,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
} from 'drizzle-orm/pg-core'
import { organizations } from './orgs'
import { user } from './auth'

export const messageRoleEnum = pgEnum('message_role', ['user', 'assistant'])

export const chatChannels = pgTable(
  'chat_channels',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    orgId: text('org_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    slug: text('slug').notNull(),
    createdBy: text('created_by').references(() => user.id, {
      onDelete: 'set null',
    }),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => ({
    orgCreatedIdx: index('chat_channels_org_created_idx').on(
      table.orgId,
      table.createdAt
    ),
    orgSlugUidx: uniqueIndex('chat_channels_org_slug_uidx').on(
      table.orgId,
      table.slug
    ),
  })
)

export const chatMessages = pgTable(
  'chat_messages',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    orgId: text('org_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    channelId: text('channel_id')
      .notNull()
      .references(() => chatChannels.id, { onDelete: 'cascade' }),
    threadRootMessageId: text('thread_root_message_id').references(
      (): AnyPgColumn => chatMessages.id,
      { onDelete: 'cascade' }
    ),
    userId: text('user_id'),
    role: messageRoleEnum('role').notNull(),
    content: text('content').notNull(),
    status: text('status').notNull().default('sent'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    deletedAt: timestamp('deleted_at'),
  },
  (table) => ({
    orgCreatedIdx: index('chat_messages_org_created_idx').on(
      table.orgId,
      table.createdAt
    ),
    channelCreatedIdx: index('chat_messages_channel_created_idx').on(
      table.channelId,
      table.createdAt
    ),
    threadCreatedIdx: index('chat_messages_thread_created_idx').on(
      table.threadRootMessageId,
      table.createdAt
    ),
  })
)

export const chatChannelsRelations = relations(
  chatChannels,
  ({ one, many }) => ({
    org: one(organizations, {
      fields: [chatChannels.orgId],
      references: [organizations.id],
    }),
    creator: one(user, {
      fields: [chatChannels.createdBy],
      references: [user.id],
    }),
    messages: many(chatMessages),
  })
)

export const chatMessagesRelations = relations(
  chatMessages,
  ({ one, many }) => ({
    org: one(organizations, {
      fields: [chatMessages.orgId],
      references: [organizations.id],
    }),
    channel: one(chatChannels, {
      fields: [chatMessages.channelId],
      references: [chatChannels.id],
    }),
    threadRoot: one(chatMessages, {
      fields: [chatMessages.threadRootMessageId],
      references: [chatMessages.id],
      relationName: 'chat_thread_root',
    }),
    replies: many(chatMessages, {
      relationName: 'chat_thread_root',
    }),
  })
)

export type ChatChannel = typeof chatChannels.$inferSelect
export type NewChatChannel = typeof chatChannels.$inferInsert
export type ChatMessage = typeof chatMessages.$inferSelect
export type NewChatMessage = typeof chatMessages.$inferInsert
