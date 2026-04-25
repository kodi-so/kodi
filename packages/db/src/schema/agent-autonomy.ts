import { pgTable, text, timestamp, jsonb } from 'drizzle-orm/pg-core'
import { relations } from 'drizzle-orm'
import { openclawAgents } from './openclaw-agents'
import { user } from './auth'

// App-layer enum (validated via zod in helpers/routers).
// Order is intentional — increasing autonomy from strict → yolo.
export type AutonomyLevel = 'strict' | 'normal' | 'lenient' | 'yolo'

// Override action: what to do when a tool name matches the glob.
export type AutonomyOverrideAction = 'allow' | 'ask' | 'deny'

// Map of glob (e.g. "slack.*", "gmail__send_email") → action.
export type AutonomyOverrides = Record<string, AutonomyOverrideAction>

/**
 * One row per agent that customizes its autonomy. Missing rows mean
 * "use defaults" (`{ autonomy_level: 'normal', overrides: null }`) — the
 * default lives in application code, not in a DB trigger, so absent rows
 * are an explicit "untouched" signal rather than implicit policy.
 */
export const agentAutonomyPolicies = pgTable('agent_autonomy_policies', {
  agentId: text('agent_id')
    .primaryKey()
    .references(() => openclawAgents.id, { onDelete: 'cascade' }),
  autonomyLevel: text('autonomy_level').notNull().default('normal'),
  overrides: jsonb('overrides').$type<AutonomyOverrides | null>(),
  updatedByUserId: text('updated_by_user_id').references(() => user.id, { onDelete: 'set null' }),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
})

export const agentAutonomyPoliciesRelations = relations(agentAutonomyPolicies, ({ one }) => ({
  agent: one(openclawAgents, {
    fields: [agentAutonomyPolicies.agentId],
    references: [openclawAgents.id],
  }),
  updatedBy: one(user, {
    fields: [agentAutonomyPolicies.updatedByUserId],
    references: [user.id],
  }),
}))

export type AgentAutonomyPolicy = typeof agentAutonomyPolicies.$inferSelect
export type NewAgentAutonomyPolicy = typeof agentAutonomyPolicies.$inferInsert
