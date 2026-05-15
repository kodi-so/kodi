import { relations, sql } from 'drizzle-orm'
import {
  boolean,
  check,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
} from 'drizzle-orm/pg-core'
import { user } from './auth'
import { meetingSessions } from './meetings'
import { orgMembers, organizations } from './orgs'

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

export const taskWorkflowStateTypeEnum = pgEnum('task_workflow_state_type', [
  'backlog',
  'started',
  'blocked',
  'completed',
  'canceled',
])

export const taskReviewStateEnum = pgEnum('task_review_state', [
  'not_required',
  'needs_review',
  'approved',
  'rejected',
])

export const taskExecutionStateEnum = pgEnum('task_execution_state', [
  'idle',
  'queued',
  'awaiting_approval',
  'running',
  'succeeded',
  'failed',
])

export const taskSyncStateEnum = pgEnum('task_sync_state', [
  'local',
  'queued',
  'syncing',
  'healthy',
  'stale',
  'blocked',
  'error',
])

export const taskAssigneeTypeEnum = pgEnum('task_assignee_type', [
  'user',
  'kodi',
  'agent',
  'unassigned',
])

export const taskActorTypeEnum = pgEnum('task_actor_type', [
  'user',
  'kodi',
  'system',
])

export const taskSourceTypeEnum = pgEnum('task_source_type', [
  'meeting',
  'manual',
  'chat',
  'import',
  'agent',
])

export const taskActivityTypeEnum = pgEnum('task_activity_type', [
  'created',
  'edited',
  'moved',
  'assigned',
  'approved',
  'rejected',
  'linked',
  'unlinked',
  'sync_succeeded',
  'sync_failed',
  'completed',
  'reopened',
  'execution_started',
  'execution_finished',
  'execution_failed',
])

export const openClawAgentTypeEnum = pgEnum('openclaw_agent_type', [
  'org',
  'member',
])

export const openClawAgentStatusEnum = pgEnum('openclaw_agent_status', [
  'provisioning',
  'active',
  'suspended',
  'deprovisioned',
  'failed',
])

export const openClawAgents = pgTable(
  'openclaw_agents',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    orgId: text('org_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    orgMemberId: text('org_member_id').references(() => orgMembers.id, {
      onDelete: 'cascade',
    }),
    agentType: openClawAgentTypeEnum('agent_type').notNull(),
    openclawAgentId: text('openclaw_agent_id').notNull(),
    slug: text('slug').notNull(),
    displayName: text('display_name').notNull(),
    description: text('description'),
    isDefault: boolean('is_default').notNull().default(false),
    status: openClawAgentStatusEnum('status').notNull().default('active'),
    metadata: jsonb('metadata').$type<Record<string, unknown> | null>(),
    composioUserId: text('composio_user_id'),
    composioSessionEnc: jsonb('composio_session_enc'),
    composioStatus: text('composio_status').notNull().default('pending'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at')
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => ({
    scopeMemberCheck: check(
      'openclaw_agents_scope_member_check',
      sql`(
        (${table.agentType} = 'org' and ${table.orgMemberId} is null) or
        (${table.agentType} = 'member' and ${table.orgMemberId} is not null)
      )`
    ),
    orgSlugUidx: uniqueIndex('openclaw_agents_org_slug_uidx').on(
      table.orgId,
      table.slug
    ),
    orgOpenclawAgentUidx: uniqueIndex('openclaw_agents_org_openclaw_agent_uidx').on(
      table.orgId,
      table.openclawAgentId
    ),
    orgAgentUidx: uniqueIndex('openclaw_agents_org_agent_uidx')
      .on(table.orgId)
      .where(sql`${table.agentType} = 'org'`),
    memberAgentUidx: uniqueIndex('openclaw_agents_member_agent_uidx')
      .on(table.orgId, table.orgMemberId)
      .where(sql`${table.agentType} = 'member'`),
    orgDefaultIdx: index('openclaw_agents_org_default_idx').on(
      table.orgId,
      table.isDefault
    ),
    orgMemberIdx: index('openclaw_agents_org_member_idx').on(
      table.orgId,
      table.orgMemberId
    ),
  })
)

export const taskWorkflowStates = pgTable(
  'task_workflow_states',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    orgId: text('org_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    slug: text('slug').notNull(),
    name: text('name').notNull(),
    description: text('description'),
    type: taskWorkflowStateTypeEnum('type').notNull(),
    sortOrder: integer('sort_order').notNull(),
    color: text('color'),
    isDefault: boolean('is_default').notNull().default(true),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at')
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => ({
    orgSlugUidx: uniqueIndex('task_workflow_states_org_slug_uidx').on(
      table.orgId,
      table.slug
    ),
    orgOrderIdx: index('task_workflow_states_org_order_idx').on(
      table.orgId,
      table.sortOrder
    ),
    orgTypeIdx: index('task_workflow_states_org_type_idx').on(
      table.orgId,
      table.type
    ),
  })
)

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
    workflowStateId: text('workflow_state_id').references(
      () => taskWorkflowStates.id,
      { onDelete: 'set null' }
    ),
    reviewState: taskReviewStateEnum('review_state')
      .notNull()
      .default('needs_review'),
    executionState: taskExecutionStateEnum('execution_state')
      .notNull()
      .default('idle'),
    syncState: taskSyncStateEnum('sync_state').notNull().default('local'),
    assigneeType: taskAssigneeTypeEnum('assignee_type')
      .notNull()
      .default('kodi'),
    assigneeUserId: text('assignee_user_id').references(() => user.id, {
      onDelete: 'set null',
    }),
    assigneeAgentId: text('assignee_agent_id').references(
      () => openClawAgents.id,
      { onDelete: 'set null' }
    ),
    completedAt: timestamp('completed_at'),
    completedByType: taskActorTypeEnum('completed_by_type'),
    completedByUserId: text('completed_by_user_id').references(() => user.id, {
      onDelete: 'set null',
    }),
    completedByAgentId: text('completed_by_agent_id').references(
      () => openClawAgents.id,
      { onDelete: 'set null' }
    ),
    sourceType: taskSourceTypeEnum('source_type').notNull().default('meeting'),
    sourceId: text('source_id'),
    linkedExternalSystem: text('linked_external_system'),
    linkedExternalId: text('linked_external_id'),
    linkedExternalUrl: text('linked_external_url'),
    linkedConnectedAccountId: text('linked_connected_account_id'),
    lastSyncedAt: timestamp('last_synced_at'),
    lastSyncError: text('last_sync_error'),
    externalSnapshot: jsonb('external_snapshot').$type<Record<
      string,
      unknown
    > | null>(),
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
    orgWorkflowIdx: index('work_items_org_workflow_idx').on(
      table.orgId,
      table.workflowStateId
    ),
    orgAssigneeIdx: index('work_items_org_assignee_idx').on(
      table.orgId,
      table.assigneeType,
      table.assigneeUserId,
      table.assigneeAgentId
    ),
    orgCompletionIdx: index('work_items_org_completion_idx').on(
      table.orgId,
      table.completedAt
    ),
    orgSyncIdx: index('work_items_org_sync_idx').on(
      table.orgId,
      table.syncState,
      table.lastSyncedAt
    ),
  })
)

export const taskActivities = pgTable(
  'task_activities',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    orgId: text('org_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    workItemId: text('work_item_id')
      .notNull()
      .references(() => workItems.id, { onDelete: 'cascade' }),
    eventType: taskActivityTypeEnum('event_type').notNull(),
    actorType: taskActorTypeEnum('actor_type').notNull(),
    actorUserId: text('actor_user_id').references(() => user.id, {
      onDelete: 'set null',
    }),
    actorAgentId: text('actor_agent_id').references(() => openClawAgents.id, {
      onDelete: 'set null',
    }),
    summary: text('summary'),
    fromValue: jsonb('from_value').$type<Record<string, unknown> | null>(),
    toValue: jsonb('to_value').$type<Record<string, unknown> | null>(),
    metadata: jsonb('metadata').$type<Record<string, unknown> | null>(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => ({
    taskCreatedIdx: index('task_activities_task_created_idx').on(
      table.workItemId,
      table.createdAt
    ),
    orgCreatedIdx: index('task_activities_org_created_idx').on(
      table.orgId,
      table.createdAt
    ),
    orgEventIdx: index('task_activities_org_event_idx').on(
      table.orgId,
      table.eventType
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
  workflowState: one(taskWorkflowStates, {
    fields: [workItems.workflowStateId],
    references: [taskWorkflowStates.id],
  }),
  assigneeUser: one(user, {
    fields: [workItems.assigneeUserId],
    references: [user.id],
  }),
  assigneeAgent: one(openClawAgents, {
    fields: [workItems.assigneeAgentId],
    references: [openClawAgents.id],
  }),
}))

export const taskWorkflowStatesRelations = relations(
  taskWorkflowStates,
  ({ one }) => ({
    org: one(organizations, {
      fields: [taskWorkflowStates.orgId],
      references: [organizations.id],
    }),
  })
)

export const openClawAgentsRelations = relations(openClawAgents, ({ one }) => ({
  org: one(organizations, {
    fields: [openClawAgents.orgId],
    references: [organizations.id],
  }),
  orgMember: one(orgMembers, {
    fields: [openClawAgents.orgMemberId],
    references: [orgMembers.id],
  }),
}))

export const taskActivitiesRelations = relations(
  taskActivities,
  ({ one }) => ({
    org: one(organizations, {
      fields: [taskActivities.orgId],
      references: [organizations.id],
    }),
    workItem: one(workItems, {
      fields: [taskActivities.workItemId],
      references: [workItems.id],
    }),
    actorUser: one(user, {
      fields: [taskActivities.actorUserId],
      references: [user.id],
    }),
    actorAgent: one(openClawAgents, {
      fields: [taskActivities.actorAgentId],
      references: [openClawAgents.id],
    }),
  })
)

export type WorkItem = typeof workItems.$inferSelect
export type NewWorkItem = typeof workItems.$inferInsert
export type TaskWorkflowState = typeof taskWorkflowStates.$inferSelect
export type NewTaskWorkflowState = typeof taskWorkflowStates.$inferInsert
export type TaskActivity = typeof taskActivities.$inferSelect
export type NewTaskActivity = typeof taskActivities.$inferInsert
export type OpenClawAgent = typeof openClawAgents.$inferSelect
export type NewOpenClawAgent = typeof openClawAgents.$inferInsert
