import {
  and,
  db,
  eq,
  openClawAgents,
  or,
  sql,
  taskActivities,
  taskWorkflowStates,
  workItems,
  type NewTaskActivity,
  type NewWorkItem,
  type TaskWorkflowState,
  type WorkItem,
} from '@kodi/db'
import { logActivity } from '../lib/activity'

type AnyDb = typeof db

export type TaskActor = {
  type: 'user' | 'kodi' | 'system'
  userId?: string | null
  agentId?: string | null
}

export type TaskBoardView =
  | 'assigned-to-kodi'
  | 'all-open'
  | 'completed-by-kodi'
  | 'meeting-derived'

export type TaskBoardFilters = {
  view?: TaskBoardView
  assignee?: 'kodi' | 'me' | 'unassigned' | 'all'
  sourceType?: 'meeting' | 'manual' | 'chat' | 'import' | 'agent' | 'all'
  linked?: 'linked' | 'unlinked' | 'all'
  completion?: 'open' | 'completed' | 'all'
  meetingOnly?: boolean
  search?: string | null
  limitPerLane?: number
}

export const DEFAULT_TASK_VIEWS = [
  {
    id: 'assigned-to-kodi',
    label: 'Assigned to Kodi',
    description: 'Open work Kodi is expected to carry.',
  },
  {
    id: 'all-open',
    label: 'All open tasks',
    description: 'Every task that is not done or canceled.',
  },
  {
    id: 'completed-by-kodi',
    label: 'Completed by Kodi',
    description: 'Tasks completed by the workspace agent.',
  },
  {
    id: 'meeting-derived',
    label: 'Meeting-derived tasks',
    description: 'Work extracted from meetings and post-call review.',
  },
] as const

const DEFAULT_WORKFLOW_STATES = [
  { slug: 'needs-review', name: 'Needs review', type: 'backlog', sortOrder: 10, color: 'amber' },
  { slug: 'todo', name: 'Todo', type: 'backlog', sortOrder: 20, color: 'zinc' },
  { slug: 'in-progress', name: 'In progress', type: 'started', sortOrder: 30, color: 'blue' },
  { slug: 'blocked', name: 'Blocked', type: 'blocked', sortOrder: 40, color: 'red' },
  { slug: 'done', name: 'Done', type: 'completed', sortOrder: 50, color: 'green' },
  { slug: 'canceled', name: 'Canceled', type: 'canceled', sortOrder: 60, color: 'zinc' },
] as const

export async function ensureTaskBoardFoundation(dbInstance: AnyDb, orgId: string) {
  const existingAgent = await dbInstance.query.openClawAgents.findFirst({
    where: (fields, { and: andFn, eq: eqFn }) =>
      andFn(eqFn(fields.orgId, orgId), eqFn(fields.slug, 'kodi')),
  })

  const [agent] = existingAgent
    ? [existingAgent]
    : await dbInstance
        .insert(openClawAgents)
        .values({
          orgId,
          orgMemberId: null,
          agentType: 'org',
          openclawAgentId: `kodi-agent-${orgId}`,
          slug: 'kodi',
          displayName: 'Kodi',
          description: 'Default Kodi workspace agent for task assignment.',
          isDefault: true,
          status: 'active',
          metadata: { source: 'task-board-foundation' },
        })
        .returning()

  const states = await dbInstance.query.taskWorkflowStates.findMany({
    where: (fields, { eq: eqFn }) => eqFn(fields.orgId, orgId),
    orderBy: (fields, { asc: ascFn }) => ascFn(fields.sortOrder),
  })

  const missing = DEFAULT_WORKFLOW_STATES.filter(
    (state) => !states.some((existing) => existing.slug === state.slug)
  )

  if (missing.length > 0) {
    await dbInstance.insert(taskWorkflowStates).values(
      missing.map((state) => ({
        orgId,
        slug: state.slug,
        name: state.name,
        type: state.type,
        sortOrder: state.sortOrder,
        color: state.color,
      }))
    )
  }

  const workflowStates = await dbInstance.query.taskWorkflowStates.findMany({
    where: (fields, { eq: eqFn }) => eqFn(fields.orgId, orgId),
    orderBy: (fields, { asc: ascFn }) => ascFn(fields.sortOrder),
  })

  return { agent: agent ?? null, workflowStates }
}

export function legacyStatusForState(
  state: Pick<TaskWorkflowState, 'slug' | 'type'>
): WorkItem['status'] {
  if (state.slug === 'needs-review') return 'draft'
  if (state.type === 'completed') return 'done'
  if (state.type === 'canceled') return 'cancelled'
  if (state.type === 'started') return 'executing'
  if (state.type === 'blocked') return 'failed'
  return 'approved'
}

export async function emitTaskActivity(
  dbInstance: AnyDb,
  input: Omit<NewTaskActivity, 'id' | 'createdAt'>
) {
  await dbInstance.insert(taskActivities).values(input)
}

async function logTaskMutation(params: {
  db: AnyDb
  orgId: string
  actor: TaskActor
  workItemId: string
  eventType: NewTaskActivity['eventType']
  summary: string
  fromValue?: Record<string, unknown> | null
  toValue?: Record<string, unknown> | null
  metadata?: Record<string, unknown> | null
}) {
  await emitTaskActivity(params.db, {
    orgId: params.orgId,
    workItemId: params.workItemId,
    eventType: params.eventType,
    actorType: params.actor.type,
    actorUserId: params.actor.userId ?? null,
    actorAgentId: params.actor.agentId ?? null,
    summary: params.summary,
    fromValue: params.fromValue ?? null,
    toValue: params.toValue ?? null,
    metadata: params.metadata ?? null,
  })

  await logActivity(
    params.db,
    params.orgId,
    `task.${params.eventType}`,
    {
      workItemId: params.workItemId,
      actorType: params.actor.type,
      summary: params.summary,
    },
    params.actor.userId ?? null
  )
}

export async function listTaskBoard(params: {
  db: AnyDb
  orgId: string
  currentUserId: string
  filters: TaskBoardFilters
}) {
  const { workflowStates } = await ensureTaskBoardFoundation(params.db, params.orgId)
  const limitPerLane = params.filters.limitPerLane ?? 50
  const view = params.filters.view ?? 'assigned-to-kodi'
  const filters = normalizeViewFilters(view, params.filters)
  const where = buildWorkItemWhere({
    orgId: params.orgId,
    currentUserId: params.currentUserId,
    filters,
  })

  const rows = await params.db.query.workItems.findMany({
    where,
    with: {
      workflowState: true,
      assigneeUser: true,
      assigneeAgent: true,
    },
    orderBy: (fields, { desc: descFn }) => descFn(fields.updatedAt),
    limit: Math.min(workflowStates.length * limitPerLane, 300),
  })

  const lanes = workflowStates.map((state) => {
    const laneRows = rows.filter((item) => item.workflowStateId === state.id)
    const cappedRows =
      state.type === 'completed' ? laneRows.slice(0, Math.min(limitPerLane, 25)) : laneRows.slice(0, limitPerLane)

    return {
      state,
      count: laneRows.length,
      hasMore: laneRows.length > cappedRows.length,
      items: cappedRows.map(shapeTaskCard),
    }
  })

  return {
    views: DEFAULT_TASK_VIEWS,
    activeView: view,
    lanes,
    filters,
  }
}

function normalizeViewFilters(
  view: TaskBoardView,
  filters: TaskBoardFilters
): TaskBoardFilters {
  if (view === 'assigned-to-kodi') {
    return { ...filters, assignee: filters.assignee ?? 'kodi', completion: filters.completion ?? 'open' }
  }
  if (view === 'all-open') {
    return { ...filters, completion: filters.completion ?? 'open', assignee: filters.assignee ?? 'all' }
  }
  if (view === 'completed-by-kodi') {
    return { ...filters, completion: 'completed', assignee: filters.assignee ?? 'all' }
  }
  if (view === 'meeting-derived') {
    return { ...filters, sourceType: 'meeting', meetingOnly: true, assignee: filters.assignee ?? 'all' }
  }
  return filters
}

function buildWorkItemWhere(params: {
  orgId: string
  currentUserId: string
  filters: TaskBoardFilters
}) {
  return (fields: any, ops: any) => {
    const clauses = [ops.eq(fields.orgId, params.orgId)]

    if (params.filters.assignee === 'kodi') {
      clauses.push(ops.eq(fields.assigneeType, 'kodi'))
    } else if (params.filters.assignee === 'me') {
      clauses.push(
        ops.and(
          ops.eq(fields.assigneeType, 'user'),
          ops.eq(fields.assigneeUserId, params.currentUserId)
        )
      )
    } else if (params.filters.assignee === 'unassigned') {
      clauses.push(ops.eq(fields.assigneeType, 'unassigned'))
    }

    if (params.filters.sourceType && params.filters.sourceType !== 'all') {
      clauses.push(ops.eq(fields.sourceType, params.filters.sourceType))
    }

    if (params.filters.meetingOnly) {
      clauses.push(ops.isNotNull(fields.meetingSessionId))
    }

    if (params.filters.linked === 'linked') {
      clauses.push(ops.isNotNull(fields.linkedExternalId))
    } else if (params.filters.linked === 'unlinked') {
      clauses.push(ops.isNull(fields.linkedExternalId))
    }

    if (params.filters.completion === 'open') {
      clauses.push(ops.isNull(fields.completedAt))
    } else if (params.filters.completion === 'completed') {
      clauses.push(ops.isNotNull(fields.completedAt))
    }

    const search = params.filters.search?.trim()
    if (search) {
      const pattern = `%${search.replaceAll('%', '\\%').replaceAll('_', '\\_')}%`
      clauses.push(
        or(
          sql`${fields.title} ilike ${pattern}`,
          sql`${fields.description} ilike ${pattern}`
        )
      )
    }

    return ops.and(...clauses)
  }
}

function shapeTaskCard(item: WorkItem & Record<string, any>) {
  return {
    id: item.id,
    title: item.title,
    description: item.description,
    kind: item.kind,
    priority: item.priority,
    dueAt: item.dueAt,
    status: item.status,
    workflowStateId: item.workflowStateId,
    reviewState: item.reviewState,
    executionState: item.executionState,
    syncState: item.syncState,
    assigneeType: item.assigneeType,
    assigneeUser: item.assigneeUser
      ? { id: item.assigneeUser.id, name: item.assigneeUser.name, email: item.assigneeUser.email }
      : null,
    assigneeAgent: item.assigneeAgent
      ? { id: item.assigneeAgent.id, displayName: item.assigneeAgent.displayName }
      : null,
    completedAt: item.completedAt,
    completedByType: item.completedByType,
    sourceType: item.sourceType,
    meetingSessionId: item.meetingSessionId,
    linkedExternalSystem: item.linkedExternalSystem ?? item.externalSystem,
    linkedExternalId: item.linkedExternalId ?? item.externalId,
    linkedExternalUrl: item.linkedExternalUrl ?? externalUrlFromMetadata(item.metadata),
    lastSyncedAt: item.lastSyncedAt,
    lastSyncError: item.lastSyncError,
    updatedAt: item.updatedAt,
    createdAt: item.createdAt,
  }
}

export async function getTaskDetail(params: {
  db: AnyDb
  orgId: string
  workItemId: string
}) {
  const item = await params.db.query.workItems.findFirst({
    where: (fields, { and: andFn, eq: eqFn }) =>
      andFn(eqFn(fields.id, params.workItemId), eqFn(fields.orgId, params.orgId)),
    with: {
      workflowState: true,
      assigneeUser: true,
      assigneeAgent: true,
    },
  })

  if (!item) return null

  const [activities, approvals, runs] = await Promise.all([
    listTaskActivity(params),
    params.db.query.approvalRequests.findMany({
      where: (fields, { and: andFn, eq: eqFn }) =>
        andFn(
          eqFn(fields.orgId, params.orgId),
          eqFn(fields.subjectType, 'work_item'),
          eqFn(fields.subjectId, params.workItemId)
        ),
      orderBy: (fields, { desc: descFn }) => descFn(fields.createdAt),
      limit: 20,
    }),
    params.db.query.toolActionRuns.findMany({
      where: (fields, { and: andFn, eq: eqFn }) =>
        andFn(eqFn(fields.orgId, params.orgId), eqFn(fields.workItemId, params.workItemId)),
      orderBy: (fields, { desc: descFn }) => descFn(fields.createdAt),
      limit: 20,
    }),
  ])

  return {
    item: shapeTaskCard(item),
    raw: item,
    activities,
    approvals,
    runs,
  }
}

export async function listTaskActivity(params: {
  db: AnyDb
  orgId: string
  workItemId: string
}) {
  return params.db.query.taskActivities.findMany({
    where: (fields, { and: andFn, eq: eqFn }) =>
      andFn(eqFn(fields.orgId, params.orgId), eqFn(fields.workItemId, params.workItemId)),
    orderBy: (fields, { desc: descFn }) => descFn(fields.createdAt),
    limit: 100,
  })
}

export async function createTask(params: {
  db: AnyDb
  orgId: string
  actorUserId: string
  title: string
  description?: string | null
  kind?: NewWorkItem['kind']
  priority?: string | null
  dueAt?: Date | null
  workflowStateId?: string | null
  assigneeType?: 'user' | 'kodi' | 'agent' | 'unassigned'
  assigneeUserId?: string | null
  assigneeAgentId?: string | null
  sourceType?: NewWorkItem['sourceType']
  meetingSessionId?: string | null
  sourceArtifactId?: string | null
  metadata?: Record<string, unknown> | null
}) {
  const foundation = await ensureTaskBoardFoundation(params.db, params.orgId)
  const workflowState =
    foundation.workflowStates.find((state) => state.id === params.workflowStateId) ??
    foundation.workflowStates.find((state) => state.slug === 'todo') ??
    foundation.workflowStates[0]

  const assigneeType = params.assigneeType ?? 'kodi'
  const [created] = await params.db
    .insert(workItems)
    .values({
      orgId: params.orgId,
      meetingSessionId: params.meetingSessionId ?? null,
      sourceArtifactId: params.sourceArtifactId ?? null,
      kind: params.kind ?? 'task',
      title: params.title,
      description: params.description ?? null,
      status: workflowState ? legacyStatusForState(workflowState) : 'approved',
      workflowStateId: workflowState?.id ?? null,
      reviewState: params.sourceType === 'meeting' ? 'needs_review' : 'not_required',
      executionState: 'idle',
      syncState: 'local',
      assigneeType,
      assigneeUserId: assigneeType === 'user' ? params.assigneeUserId ?? params.actorUserId : null,
      assigneeAgentId: assigneeType === 'kodi' ? foundation.agent?.id ?? null : params.assigneeAgentId ?? null,
      sourceType: params.sourceType ?? (params.meetingSessionId ? 'meeting' : 'manual'),
      sourceId: params.meetingSessionId ?? params.sourceArtifactId ?? null,
      priority: params.priority ?? null,
      dueAt: params.dueAt ?? null,
      metadata: params.metadata ?? null,
    })
    .returning()

  if (!created) {
    throw new Error('Failed to create task.')
  }

  await logTaskMutation({
    db: params.db,
    orgId: params.orgId,
    actor: { type: 'user', userId: params.actorUserId },
    workItemId: created.id,
    eventType: 'created',
    summary: 'Task created.',
    toValue: { title: created.title, workflowStateId: created.workflowStateId },
  })

  return created
}

export async function updateTask(params: {
  db: AnyDb
  orgId: string
  actorUserId: string
  workItemId: string
  title?: string
  description?: string | null
  kind?: NewWorkItem['kind']
  priority?: string | null
  dueAt?: Date | null
  workflowStateId?: string | null
  assigneeType?: 'user' | 'kodi' | 'agent' | 'unassigned'
  assigneeUserId?: string | null
  assigneeAgentId?: string | null
  metadata?: Record<string, unknown> | null
}) {
  const existing = await requireTask(params.db, params.orgId, params.workItemId)
  const foundation = await ensureTaskBoardFoundation(params.db, params.orgId)
  const nextWorkflowState = params.workflowStateId
    ? foundation.workflowStates.find((state) => state.id === params.workflowStateId)
    : undefined
  const assigneeType = params.assigneeType ?? existing.assigneeType

  const [updated] = await params.db
    .update(workItems)
    .set({
      title: params.title ?? existing.title,
      description: params.description !== undefined ? params.description : existing.description,
      kind: params.kind ?? existing.kind,
      priority: params.priority !== undefined ? params.priority : existing.priority,
      dueAt: params.dueAt !== undefined ? params.dueAt : existing.dueAt,
      workflowStateId: params.workflowStateId !== undefined ? params.workflowStateId : existing.workflowStateId,
      status: nextWorkflowState ? legacyStatusForState(nextWorkflowState) : existing.status,
      assigneeType,
      assigneeUserId:
        assigneeType === 'user'
          ? params.assigneeUserId ?? existing.assigneeUserId ?? params.actorUserId
          : null,
      assigneeAgentId:
        assigneeType === 'kodi'
          ? foundation.agent?.id ?? existing.assigneeAgentId
          : assigneeType === 'agent'
            ? params.assigneeAgentId ?? existing.assigneeAgentId
            : null,
      metadata: params.metadata !== undefined ? params.metadata : existing.metadata,
      updatedAt: new Date(),
    })
    .where(and(eq(workItems.id, params.workItemId), eq(workItems.orgId, params.orgId)))
    .returning()

  if (!updated) {
    throw new Error('Failed to update task.')
  }

  await logTaskMutation({
    db: params.db,
    orgId: params.orgId,
    actor: { type: 'user', userId: params.actorUserId },
    workItemId: params.workItemId,
    eventType: 'edited',
    summary: 'Task edited.',
    fromValue: taskChangeSnapshot(existing),
    toValue: taskChangeSnapshot(updated),
  })

  if (existing.workflowStateId !== updated.workflowStateId) {
    await logTaskMutation({
      db: params.db,
      orgId: params.orgId,
      actor: { type: 'user', userId: params.actorUserId },
      workItemId: params.workItemId,
      eventType: 'moved',
      summary: 'Task moved.',
      fromValue: { workflowStateId: existing.workflowStateId },
      toValue: { workflowStateId: updated.workflowStateId },
    })
  }

  if (
    existing.assigneeType !== updated.assigneeType ||
    existing.assigneeUserId !== updated.assigneeUserId ||
    existing.assigneeAgentId !== updated.assigneeAgentId
  ) {
    await logTaskMutation({
      db: params.db,
      orgId: params.orgId,
      actor: { type: 'user', userId: params.actorUserId },
      workItemId: params.workItemId,
      eventType: 'assigned',
      summary: 'Task reassigned.',
      fromValue: taskAssigneeSnapshot(existing),
      toValue: taskAssigneeSnapshot(updated),
    })
  }

  return updated
}

export async function moveTask(params: {
  db: AnyDb
  orgId: string
  actorUserId: string
  workItemId: string
  workflowStateId: string
}) {
  const state = await params.db.query.taskWorkflowStates.findFirst({
    where: (fields, { and: andFn, eq: eqFn }) =>
      andFn(eqFn(fields.id, params.workflowStateId), eqFn(fields.orgId, params.orgId)),
  })
  if (!state) throw new Error('Workflow state not found.')

  return updateTask({
    db: params.db,
    orgId: params.orgId,
    actorUserId: params.actorUserId,
    workItemId: params.workItemId,
    workflowStateId: state.id,
  })
}

export async function approveTask(params: {
  db: AnyDb
  orgId: string
  actorUserId: string
  workItemId: string
}) {
  const { workflowStates } = await ensureTaskBoardFoundation(params.db, params.orgId)
  const todo = workflowStates.find((state) => state.slug === 'todo')
  const [updated] = await params.db
    .update(workItems)
    .set({
      reviewState: 'approved',
      status: 'approved',
      workflowStateId: todo?.id ?? null,
      updatedAt: new Date(),
    })
    .where(and(eq(workItems.id, params.workItemId), eq(workItems.orgId, params.orgId)))
    .returning()

  await logTaskMutation({
    db: params.db,
    orgId: params.orgId,
    actor: { type: 'user', userId: params.actorUserId },
    workItemId: params.workItemId,
    eventType: 'approved',
    summary: 'Task approved.',
    toValue: { reviewState: 'approved', workflowStateId: todo?.id ?? null },
  })

  return updated
}

export async function rejectTask(params: {
  db: AnyDb
  orgId: string
  actorUserId: string
  workItemId: string
}) {
  const { workflowStates } = await ensureTaskBoardFoundation(params.db, params.orgId)
  const canceled = workflowStates.find((state) => state.slug === 'canceled')
  const [updated] = await params.db
    .update(workItems)
    .set({
      reviewState: 'rejected',
      status: 'cancelled',
      workflowStateId: canceled?.id ?? null,
      completedAt: new Date(),
      completedByType: 'user',
      completedByUserId: params.actorUserId,
      updatedAt: new Date(),
    })
    .where(and(eq(workItems.id, params.workItemId), eq(workItems.orgId, params.orgId)))
    .returning()

  await logTaskMutation({
    db: params.db,
    orgId: params.orgId,
    actor: { type: 'user', userId: params.actorUserId },
    workItemId: params.workItemId,
    eventType: 'rejected',
    summary: 'Task rejected.',
    toValue: { reviewState: 'rejected', workflowStateId: canceled?.id ?? null },
  })

  return updated
}

export async function completeTask(params: {
  db: AnyDb
  orgId: string
  actor: TaskActor
  workItemId: string
}) {
  const { workflowStates, agent } = await ensureTaskBoardFoundation(params.db, params.orgId)
  const done = workflowStates.find((state) => state.slug === 'done')
  const [updated] = await params.db
    .update(workItems)
    .set({
      status: 'done',
      workflowStateId: done?.id ?? null,
      completedAt: new Date(),
      completedByType: params.actor.type,
      completedByUserId: params.actor.userId ?? null,
      completedByAgentId: params.actor.agentId ?? (params.actor.type === 'kodi' ? agent?.id ?? null : null),
      executionState: params.actor.type === 'kodi' ? 'succeeded' : undefined,
      updatedAt: new Date(),
    } as never)
    .where(and(eq(workItems.id, params.workItemId), eq(workItems.orgId, params.orgId)))
    .returning()

  await logTaskMutation({
    db: params.db,
    orgId: params.orgId,
    actor: params.actor,
    workItemId: params.workItemId,
    eventType: 'completed',
    summary: 'Task completed.',
    toValue: { completedByType: params.actor.type, workflowStateId: done?.id ?? null },
  })

  return updated
}

export async function reopenTask(params: {
  db: AnyDb
  orgId: string
  actorUserId: string
  workItemId: string
}) {
  const { workflowStates } = await ensureTaskBoardFoundation(params.db, params.orgId)
  const todo = workflowStates.find((state) => state.slug === 'todo')
  const [updated] = await params.db
    .update(workItems)
    .set({
      status: 'approved',
      workflowStateId: todo?.id ?? null,
      completedAt: null,
      completedByType: null,
      completedByUserId: null,
      completedByAgentId: null,
      updatedAt: new Date(),
    })
    .where(and(eq(workItems.id, params.workItemId), eq(workItems.orgId, params.orgId)))
    .returning()

  await logTaskMutation({
    db: params.db,
    orgId: params.orgId,
    actor: { type: 'user', userId: params.actorUserId },
    workItemId: params.workItemId,
    eventType: 'reopened',
    summary: 'Task reopened.',
    toValue: { workflowStateId: todo?.id ?? null },
  })

  return updated
}

export async function markTaskLinked(params: {
  db: AnyDb
  orgId: string
  actorUserId: string
  workItemId: string
  externalSystem: string
  externalId: string | null
  externalUrl: string | null
  connectedAccountId?: string | null
  snapshot?: Record<string, unknown> | null
}) {
  const [updated] = await params.db
    .update(workItems)
    .set({
      externalSystem: params.externalSystem,
      externalId: params.externalId ?? undefined,
      linkedExternalSystem: params.externalSystem,
      linkedExternalId: params.externalId,
      linkedExternalUrl: params.externalUrl,
      linkedConnectedAccountId: params.connectedAccountId ?? null,
      syncState: 'healthy',
      lastSyncedAt: new Date(),
      lastSyncError: null,
      externalSnapshot: params.snapshot ?? {
        system: params.externalSystem,
        id: params.externalId,
        url: params.externalUrl,
      },
      updatedAt: new Date(),
    } as never)
    .where(and(eq(workItems.id, params.workItemId), eq(workItems.orgId, params.orgId)))
    .returning()

  await logTaskMutation({
    db: params.db,
    orgId: params.orgId,
    actor: { type: 'user', userId: params.actorUserId },
    workItemId: params.workItemId,
    eventType: 'linked',
    summary: `Task linked to ${params.externalSystem}.`,
    toValue: { externalSystem: params.externalSystem, externalId: params.externalId, externalUrl: params.externalUrl },
  })

  return updated
}

export async function recordTaskSyncFailure(params: {
  db: AnyDb
  orgId: string
  actorUserId?: string | null
  workItemId: string
  message: string
}) {
  await params.db
    .update(workItems)
    .set({
      syncState: 'error',
      lastSyncError: params.message,
      updatedAt: new Date(),
    })
    .where(and(eq(workItems.id, params.workItemId), eq(workItems.orgId, params.orgId)))

  await logTaskMutation({
    db: params.db,
    orgId: params.orgId,
    actor: { type: params.actorUserId ? 'user' : 'system', userId: params.actorUserId ?? null },
    workItemId: params.workItemId,
    eventType: 'sync_failed',
    summary: 'Task sync failed.',
    metadata: { message: params.message },
  })
}

export async function ingestTaskExecutionEvent(params: {
  db: AnyDb
  orgId: string
  workItemId: string
  executionState: 'queued' | 'awaiting_approval' | 'running' | 'succeeded' | 'failed'
  summary: string
  metadata?: Record<string, unknown> | null
}) {
  const eventType =
    params.executionState === 'running'
      ? 'execution_started'
      : params.executionState === 'failed'
        ? 'execution_failed'
        : params.executionState === 'succeeded'
          ? 'execution_finished'
          : 'edited'

  await params.db
    .update(workItems)
    .set({
      executionState: params.executionState,
      updatedAt: new Date(),
    })
    .where(and(eq(workItems.id, params.workItemId), eq(workItems.orgId, params.orgId)))

  await logTaskMutation({
    db: params.db,
    orgId: params.orgId,
    actor: { type: 'kodi' },
    workItemId: params.workItemId,
    eventType,
    summary: params.summary,
    metadata: params.metadata ?? null,
  })
}

async function requireTask(dbInstance: AnyDb, orgId: string, workItemId: string) {
  const item = await dbInstance.query.workItems.findFirst({
    where: (fields, { and: andFn, eq: eqFn }) =>
      andFn(eqFn(fields.id, workItemId), eqFn(fields.orgId, orgId)),
  })
  if (!item) throw new Error('Task not found.')
  return item
}

function taskChangeSnapshot(item: WorkItem | undefined) {
  if (!item) return null
  return {
    title: item.title,
    description: item.description,
    priority: item.priority,
    dueAt: item.dueAt,
    workflowStateId: item.workflowStateId,
  }
}

function taskAssigneeSnapshot(item: WorkItem) {
  return {
    assigneeType: item.assigneeType,
    assigneeUserId: item.assigneeUserId,
    assigneeAgentId: item.assigneeAgentId,
  }
}

function externalUrlFromMetadata(metadata: Record<string, unknown> | null) {
  if (!metadata) return null
  return typeof metadata.externalUrl === 'string'
    ? metadata.externalUrl
    : typeof metadata.external_url === 'string'
      ? metadata.external_url
      : null
}
