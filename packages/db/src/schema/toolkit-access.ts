import { relations } from 'drizzle-orm'
import {
  boolean,
  index,
  jsonb,
  pgEnum,
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

export const toolkitAccountPreferences = pgTable(
  'toolkit_account_preferences',
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
    preferredConnectedAccountId: text(
      'preferred_connected_account_id'
    ).notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at')
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => ({
    orgUserToolkitUidx: uniqueIndex(
      'toolkit_account_preferences_org_user_toolkit_uidx'
    ).on(table.orgId, table.userId, table.toolkitSlug),
    orgUserAccountIdx: index(
      'toolkit_account_preferences_org_user_account_idx'
    ).on(table.orgId, table.userId, table.preferredConnectedAccountId),
  })
)

export const toolSessionSourceTypeEnum = pgEnum('tool_session_source_type', [
  'chat',
  'meeting',
  'system',
])

export const toolSessionRuns = pgTable(
  'tool_session_runs',
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
    composioSessionId: text('composio_session_id').notNull(),
    sourceType: toolSessionSourceTypeEnum('source_type').notNull(),
    sourceId: text('source_id'),
    enabledToolkits: text('enabled_toolkits').array().notNull(),
    connectedAccountOverrides: jsonb(
      'connected_account_overrides'
    ).$type<Record<string, string> | null>(),
    manageConnectionsInChat: boolean('manage_connections_in_chat')
      .notNull()
      .default(false),
    workbenchEnabled: boolean('workbench_enabled').notNull().default(false),
    metadata: jsonb('metadata').$type<Record<string, unknown> | null>(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    expiredAt: timestamp('expired_at'),
  },
  (table) => ({
    composioSessionIdUidx: uniqueIndex(
      'tool_session_runs_composio_session_id_uidx'
    ).on(table.composioSessionId),
    orgUserCreatedIdx: index('tool_session_runs_org_user_created_idx').on(
      table.orgId,
      table.userId,
      table.createdAt
    ),
    sourceIdx: index('tool_session_runs_source_idx').on(
      table.sourceType,
      table.sourceId
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

export const toolkitAccountPreferencesRelations = relations(
  toolkitAccountPreferences,
  ({ one }) => ({
    org: one(organizations, {
      fields: [toolkitAccountPreferences.orgId],
      references: [organizations.id],
    }),
    user: one(user, {
      fields: [toolkitAccountPreferences.userId],
      references: [user.id],
    }),
  })
)

export const toolSessionRunsRelations = relations(
  toolSessionRuns,
  ({ one }) => ({
    org: one(organizations, {
      fields: [toolSessionRuns.orgId],
      references: [organizations.id],
    }),
    user: one(user, {
      fields: [toolSessionRuns.userId],
      references: [user.id],
    }),
  })
)

export type ToolkitConnection = typeof toolkitConnections.$inferSelect
export type NewToolkitConnection = typeof toolkitConnections.$inferInsert
export type ToolkitPolicy = typeof toolkitPolicies.$inferSelect
export type NewToolkitPolicy = typeof toolkitPolicies.$inferInsert
export type ToolkitAccountPreference =
  typeof toolkitAccountPreferences.$inferSelect
export type NewToolkitAccountPreference =
  typeof toolkitAccountPreferences.$inferInsert
export type ToolSessionRun = typeof toolSessionRuns.$inferSelect
export type NewToolSessionRun = typeof toolSessionRuns.$inferInsert
