import { relations } from 'drizzle-orm'
import {
  boolean,
  index,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
} from 'drizzle-orm/pg-core'
import { user } from './auth'
import { organizations } from './orgs'

export const toolkitConnections = pgTable(
  'toolkit_connections',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    orgId: text('org_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    toolkitSlug: text('toolkit_slug').notNull(),
    toolkitName: text('toolkit_name'),
    authConfigId: text('auth_config_id'),
    authConfigSource: text('auth_config_source'),
    connectedAccountId: text('connected_account_id').notNull(),
    connectedAccountStatus: text('connected_account_status'),
    connectedAccountLabel: text('connected_account_label'),
    externalUserId: text('external_user_id'),
    externalUserEmail: text('external_user_email'),
    scopes: text('scopes').array(),
    metadata: jsonb('metadata').$type<Record<string, unknown> | null>(),
    lastValidatedAt: timestamp('last_validated_at'),
    lastErrorAt: timestamp('last_error_at'),
    errorMessage: text('error_message'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at')
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => ({
    orgUserConnectedAccountUidx: uniqueIndex(
      'toolkit_connections_org_user_connected_account_uidx'
    ).on(table.orgId, table.userId, table.connectedAccountId),
    orgUserToolkitIdx: index('toolkit_connections_org_user_toolkit_idx').on(
      table.orgId,
      table.userId,
      table.toolkitSlug
    ),
    orgStatusIdx: index('toolkit_connections_org_status_idx').on(
      table.orgId,
      table.connectedAccountStatus
    ),
  })
)

export const toolkitPolicies = pgTable(
  'toolkit_policies',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    orgId: text('org_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    toolkitSlug: text('toolkit_slug').notNull(),
    enabled: boolean('enabled').notNull().default(true),
    chatReadsEnabled: boolean('chat_reads_enabled').notNull().default(true),
    meetingReadsEnabled: boolean('meeting_reads_enabled')
      .notNull()
      .default(true),
    draftsEnabled: boolean('drafts_enabled').notNull().default(true),
    writesRequireApproval: boolean('writes_require_approval')
      .notNull()
      .default(true),
    adminActionsEnabled: boolean('admin_actions_enabled')
      .notNull()
      .default(false),
    allowedActionPatterns: text('allowed_action_patterns').array(),
    createdByUserId: text('created_by_user_id').references(() => user.id, {
      onDelete: 'set null',
    }),
    updatedByUserId: text('updated_by_user_id').references(() => user.id, {
      onDelete: 'set null',
    }),
    metadata: jsonb('metadata').$type<Record<string, unknown> | null>(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at')
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => ({
    orgToolkitUidx: uniqueIndex('toolkit_policies_org_toolkit_uidx').on(
      table.orgId,
      table.toolkitSlug
    ),
    orgEnabledIdx: index('toolkit_policies_org_enabled_idx').on(
      table.orgId,
      table.enabled
    ),
  })
)

export const toolkitConnectionsRelations = relations(
  toolkitConnections,
  ({ one }) => ({
    org: one(organizations, {
      fields: [toolkitConnections.orgId],
      references: [organizations.id],
    }),
    user: one(user, {
      fields: [toolkitConnections.userId],
      references: [user.id],
    }),
  })
)

export const toolkitPoliciesRelations = relations(
  toolkitPolicies,
  ({ one }) => ({
    org: one(organizations, {
      fields: [toolkitPolicies.orgId],
      references: [organizations.id],
    }),
    createdByUser: one(user, {
      fields: [toolkitPolicies.createdByUserId],
      references: [user.id],
    }),
    updatedByUser: one(user, {
      fields: [toolkitPolicies.updatedByUserId],
      references: [user.id],
    }),
  })
)

export type ToolkitConnection = typeof toolkitConnections.$inferSelect
export type NewToolkitConnection = typeof toolkitConnections.$inferInsert
export type ToolkitPolicy = typeof toolkitPolicies.$inferSelect
export type NewToolkitPolicy = typeof toolkitPolicies.$inferInsert
