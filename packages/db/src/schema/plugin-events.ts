import { pgTable, text, timestamp, jsonb, uniqueIndex, index } from 'drizzle-orm/pg-core'
import { relations } from 'drizzle-orm'
import { instances } from './orgs'
import { openclawAgents } from './openclaw-agents'

/**
 * Per-instance subscription configuration. Tells the plugin which event
 * kinds it should emit and at what verbosity. Stored as a single jsonb
 * blob so adding new kinds doesn't require a migration; shape is owned
 * by the dual-communication protocol spec (M3).
 *
 * Example `subscriptions` value:
 * ```json
 * { "tool.invoke.after": "full", "heartbeat": "summary", "agent.provisioned": "full" }
 * ```
 */
export const pluginEventSubscriptions = pgTable('plugin_event_subscriptions', {
  instanceId: text('instance_id')
    .primaryKey()
    .references(() => instances.id, { onDelete: 'cascade' }),
  protocolVersion: text('protocol_version').notNull(),
  subscriptions: jsonb('subscriptions').notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
})

export const pluginEventSubscriptionsRelations = relations(
  pluginEventSubscriptions,
  ({ one }) => ({
    instance: one(instances, {
      fields: [pluginEventSubscriptions.instanceId],
      references: [instances.id],
    }),
  }),
)

export type PluginEventSubscription = typeof pluginEventSubscriptions.$inferSelect
export type NewPluginEventSubscription = typeof pluginEventSubscriptions.$inferInsert

/**
 * Append-only log of every event Kodi receives from any instance.
 * Dedupe via `(instance_id, idempotency_key)`. payload_json carries the
 * envelope's `payload` field only; envelope metadata (kind, version,
 * received_at) lives in columns for indexability.
 *
 * Retention policy lives in M8.
 */
export const pluginEventLog = pgTable(
  'plugin_event_log',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    instanceId: text('instance_id')
      .notNull()
      .references(() => instances.id, { onDelete: 'cascade' }),
    agentId: text('agent_id').references(() => openclawAgents.id, { onDelete: 'set null' }),
    eventKind: text('event_kind').notNull(),
    protocolVersion: text('protocol_version'),
    payloadJson: jsonb('payload_json'),
    idempotencyKey: text('idempotency_key').notNull(),
    receivedAt: timestamp('received_at').defaultNow().notNull(),
  },
  (table) => ({
    instanceIdempotencyUidx: uniqueIndex('plugin_event_log_instance_idempotency_uidx').on(
      table.instanceId,
      table.idempotencyKey,
    ),
    instanceIdx: index('plugin_event_log_instance_idx').on(table.instanceId),
    agentIdx: index('plugin_event_log_agent_idx').on(table.agentId),
    eventKindIdx: index('plugin_event_log_event_kind_idx').on(table.eventKind),
    receivedAtIdx: index('plugin_event_log_received_at_idx').on(table.receivedAt),
  }),
)

export const pluginEventLogRelations = relations(pluginEventLog, ({ one }) => ({
  instance: one(instances, {
    fields: [pluginEventLog.instanceId],
    references: [instances.id],
  }),
  agent: one(openclawAgents, {
    fields: [pluginEventLog.agentId],
    references: [openclawAgents.id],
  }),
}))

export type PluginEventLogRow = typeof pluginEventLog.$inferSelect
export type NewPluginEventLogRow = typeof pluginEventLog.$inferInsert

/**
 * Plugin bundle version registry. Each release of `kodi-bridge` lands here
 * with its S3 object key + sha256 for integrity verification by the plugin's
 * self-update module (M6). Version scheme: `YYYY-MM-DD-<sha>`.
 */
export const pluginVersions = pgTable('plugin_versions', {
  version: text('version').primaryKey(),
  bundleS3Key: text('bundle_s3_key').notNull(),
  sha256: text('sha256').notNull(),
  releasedAt: timestamp('released_at').defaultNow().notNull(),
  notes: text('notes'),
})

export type PluginVersion = typeof pluginVersions.$inferSelect
export type NewPluginVersion = typeof pluginVersions.$inferInsert
