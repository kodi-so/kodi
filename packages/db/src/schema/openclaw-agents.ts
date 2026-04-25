import { pgTable, text, timestamp, jsonb, uniqueIndex, index } from 'drizzle-orm/pg-core'
import { relations, sql } from 'drizzle-orm'
import { organizations, instances } from './orgs'
import { user } from './auth'

// Status enums kept at the app layer (validated via zod in routers) so future
// values can land without a Postgres enum migration. See KOD-354 spec.
export type OpenClawAgentStatus =
  | 'provisioning'
  | 'active'
  | 'suspended'
  | 'deprovisioned'
  | 'failed'

export type OpenClawAgentComposioStatus =
  | 'pending'
  | 'active'
  | 'failed'
  | 'disconnected'
  | 'skipped'

/**
 * One row per OpenClaw agent inside one instance.
 *
 * - `user_id = null` denotes the org-level agent (single row per instance).
 * - `composio_session_enc` holds AES-256-GCM encrypted session metadata
 *   following the same pattern as `instances.gateway_token`.
 * - The `(instance_id, user_id)` unique partial index allows the
 *   single-org-agent (null user_id) row to coexist while preventing
 *   duplicate per-user rows.
 */
export const openclawAgents = pgTable(
  'openclaw_agents',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    instanceId: text('instance_id')
      .notNull()
      .references(() => instances.id, { onDelete: 'cascade' }),
    orgId: text('org_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    userId: text('user_id').references(() => user.id, { onDelete: 'cascade' }),
    openclawAgentId: text('openclaw_agent_id').notNull(),
    composioUserId: text('composio_user_id'),
    composioSessionEnc: jsonb('composio_session_enc'),
    composioStatus: text('composio_status').notNull().default('pending'),
    status: text('status').notNull().default('provisioning'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (table) => ({
    instanceUserUniqueIdx: uniqueIndex('openclaw_agents_instance_user_uidx')
      .on(table.instanceId, table.userId)
      .where(sql`${table.userId} IS NOT NULL`),
    instanceOpenclawAgentUniqueIdx: uniqueIndex('openclaw_agents_instance_agentid_uidx').on(
      table.instanceId,
      table.openclawAgentId,
    ),
    orgStatusIdx: index('openclaw_agents_org_status_idx').on(table.orgId, table.status),
    instanceIdx: index('openclaw_agents_instance_idx').on(table.instanceId),
  }),
)

export const openclawAgentsRelations = relations(openclawAgents, ({ one }) => ({
  instance: one(instances, {
    fields: [openclawAgents.instanceId],
    references: [instances.id],
  }),
  org: one(organizations, {
    fields: [openclawAgents.orgId],
    references: [organizations.id],
  }),
  user: one(user, {
    fields: [openclawAgents.userId],
    references: [user.id],
  }),
}))

export type OpenClawAgent = typeof openclawAgents.$inferSelect
export type NewOpenClawAgent = typeof openclawAgents.$inferInsert
