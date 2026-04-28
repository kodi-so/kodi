import { z } from 'zod'
import { router, memberProcedure } from '../../trpc'
import { TRPCError } from '@trpc/server'
import { eq, workItems, toolActionRuns, toolkitPolicies } from '@kodi/db'
import {
  queueWorkItemSync,
  retryWorkItemSync,
  type WorkItemSyncTarget,
} from '../../lib/meetings/work-item-sync'
import {
  approveTask,
  completeTask,
  createTask,
  getTaskDetail,
  listTaskActivity,
  listTaskBoard,
  moveTask,
  rejectTask,
  reopenTask,
  updateTask,
} from '../../services/tasks'

const boardViewSchema = z.enum([
  'assigned-to-kodi',
  'all-open',
  'completed-by-kodi',
  'meeting-derived',
])

const assigneeSchema = z.enum(['kodi', 'me', 'unassigned', 'all'])
const sourceTypeSchema = z.enum(['meeting', 'manual', 'chat', 'import', 'agent', 'all'])
const linkedSchema = z.enum(['linked', 'unlinked', 'all'])
const completionSchema = z.enum(['open', 'completed', 'all'])

function isTaskBoardSchemaError(error: unknown) {
  const message =
    error instanceof Error
      ? error.message
      : typeof error === 'object' && error !== null && 'message' in error
        ? String((error as { message?: unknown }).message)
        : ''

  return (
    message.includes('openclaw_agents') ||
    message.includes('task_workflow_states') ||
    message.includes('task_activities') ||
    message.includes('workflow_state_id') ||
    message.includes('assignee_type')
  )
}

function taskBoardSchemaError(error: unknown) {
  if (!isTaskBoardSchemaError(error)) return null
  return new TRPCError({
    code: 'PRECONDITION_FAILED',
    message:
      'Task board database migration has not been applied yet. Run the latest database migrations, then reload Tasks.',
  })
}

export const workRouter = router({
  list: memberProcedure
    .input(
      z.object({
        limit: z.number().int().min(1).max(100).default(20),
      })
    )
    .query(async ({ ctx, input }) => {
      return ctx.db.query.workItems.findMany({
        where: (fields, { eq }) => eq(fields.orgId, ctx.org.id),
        orderBy: (fields, { desc }) => desc(fields.createdAt),
        limit: input.limit,
      })
    }),

  getById: memberProcedure
    .input(
      z.object({
        workItemId: z.string(),
      })
    )
    .query(async ({ ctx, input }) => {
      return ctx.db.query.workItems.findFirst({
        where: (fields, { and, eq }) =>
          and(eq(fields.id, input.workItemId), eq(fields.orgId, ctx.org.id)),
      })
    }),

  listByMeeting: memberProcedure
    .input(
      z.object({
        meetingSessionId: z.string(),
      })
    )
    .query(async ({ ctx, input }) => {
      return ctx.db.query.workItems.findMany({
        where: (fields, { and, eq }) =>
          and(
            eq(fields.orgId, ctx.org.id),
            eq(fields.meetingSessionId, input.meetingSessionId)
          ),
        orderBy: (fields, { asc }) => asc(fields.createdAt),
      })
    }),

  board: memberProcedure
    .input(
      z.object({
        view: boardViewSchema.default('assigned-to-kodi'),
        assignee: assigneeSchema.optional(),
        sourceType: sourceTypeSchema.optional(),
        linked: linkedSchema.optional(),
        completion: completionSchema.optional(),
        meetingOnly: z.boolean().optional(),
        search: z.string().trim().max(200).nullable().optional(),
        limitPerLane: z.number().int().min(5).max(100).optional(),
      })
    )
    .query(async ({ ctx, input }) => {
      try {
        return await listTaskBoard({
          db: ctx.db,
          orgId: ctx.org.id,
          currentUserId: ctx.session.user.id,
          filters: input,
        })
      } catch (error) {
        const schemaError = taskBoardSchemaError(error)
        if (schemaError) throw schemaError
        throw error
      }
    }),

  detail: memberProcedure
    .input(
      z.object({
        workItemId: z.string(),
      })
    )
    .query(async ({ ctx, input }) => {
      let detail: Awaited<ReturnType<typeof getTaskDetail>>
      try {
        detail = await getTaskDetail({
          db: ctx.db,
          orgId: ctx.org.id,
          workItemId: input.workItemId,
        })
      } catch (error) {
        const schemaError = taskBoardSchemaError(error)
        if (schemaError) throw schemaError
        throw error
      }

      if (!detail) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Task not found.' })
      }

      return detail
    }),

  activity: memberProcedure
    .input(
      z.object({
        workItemId: z.string(),
      })
    )
    .query(async ({ ctx, input }) => {
      try {
        return await listTaskActivity({
          db: ctx.db,
          orgId: ctx.org.id,
          workItemId: input.workItemId,
        })
      } catch (error) {
        const schemaError = taskBoardSchemaError(error)
        if (schemaError) throw schemaError
        throw error
      }
    }),

  create: memberProcedure
    .input(
      z.object({
        title: z.string().trim().min(1).max(500),
        description: z.string().trim().max(5000).nullable().optional(),
        kind: z.enum(['goal', 'outcome', 'task', 'ticket', 'follow_up']).default('task'),
        priority: z.string().trim().max(50).nullable().optional(),
        dueAt: z.string().datetime().nullable().optional(),
        workflowStateId: z.string().nullable().optional(),
        assigneeType: z.enum(['user', 'kodi', 'agent', 'unassigned']).default('kodi'),
        assigneeUserId: z.string().nullable().optional(),
        assigneeAgentId: z.string().nullable().optional(),
        sourceType: z.enum(['meeting', 'manual', 'chat', 'import', 'agent']).default('manual'),
        trackInLinear: z.boolean().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      let created: Awaited<ReturnType<typeof createTask>>
      try {
        created = await createTask({
          db: ctx.db,
          orgId: ctx.org.id,
          actorUserId: ctx.session.user.id,
          title: input.title,
          description: input.description,
          kind: input.kind,
          priority: input.priority,
          dueAt: input.dueAt ? new Date(input.dueAt) : input.dueAt === null ? null : undefined,
          workflowStateId: input.workflowStateId,
          assigneeType: input.assigneeType,
          assigneeUserId: input.assigneeUserId,
          assigneeAgentId: input.assigneeAgentId,
          sourceType: input.sourceType,
        })
      } catch (error) {
        const schemaError = taskBoardSchemaError(error)
        if (schemaError) throw schemaError
        throw error
      }

      const linearPolicy = await ctx.db.query.toolkitPolicies.findFirst({
        where: (fields, { and, eq }) =>
          and(eq(fields.orgId, ctx.org.id), eq(fields.toolkitSlug, 'linear')),
        columns: { metadata: true },
      })
      const linearDefaults =
        linearPolicy?.metadata &&
        typeof linearPolicy.metadata['linearTaskDefaults'] === 'object' &&
        linearPolicy.metadata['linearTaskDefaults'] !== null
          ? (linearPolicy.metadata['linearTaskDefaults'] as { trackByDefault?: boolean })
          : null
      const shouldTrackInLinear =
        input.trackInLinear ?? linearDefaults?.trackByDefault ?? false

      if (shouldTrackInLinear) {
        await queueWorkItemSync({
          db: ctx.db,
          orgId: ctx.org.id,
          actorUserId: ctx.session.user.id,
          workItem: created,
          target: 'linear',
        })
      }

      return created
    }),

  update: memberProcedure
    .input(
      z.object({
        workItemId: z.string(),
        title: z.string().trim().min(1).max(500).optional(),
        description: z.string().trim().max(5000).nullable().optional(),
        kind: z.enum(['goal', 'outcome', 'task', 'ticket', 'follow_up']).optional(),
        priority: z.string().trim().max(50).nullable().optional(),
        dueAt: z.string().datetime().nullable().optional(),
        ownerHint: z.string().trim().max(200).nullable().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const item = await ctx.db.query.workItems.findFirst({
        where: (fields, { and, eq }) =>
          and(
            eq(fields.id, input.workItemId),
            eq(fields.orgId, ctx.org.id)
          ),
      })

      if (!item) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Work item not found.' })
      }

      const metadataPatch: Record<string, unknown> =
        input.ownerHint !== undefined
          ? { ...(item.metadata ?? {}), ownerHint: input.ownerHint }
          : (item.metadata ?? {})

      const updated = await updateTask({
        db: ctx.db,
        orgId: ctx.org.id,
        actorUserId: ctx.session.user.id,
        workItemId: input.workItemId,
        title: input.title,
        description: input.description,
        kind: input.kind,
        priority: input.priority,
        dueAt:
          input.dueAt !== undefined
            ? input.dueAt !== null
              ? new Date(input.dueAt)
              : null
            : undefined,
        metadata: metadataPatch,
      })

      if (!updated) {
        throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Failed to update work item.' })
      }

      return updated
    }),

  approve: memberProcedure
    .input(
      z.object({
        workItemId: z.string(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const item = await ctx.db.query.workItems.findFirst({
        where: (fields, { and, eq }) =>
          and(
            eq(fields.id, input.workItemId),
            eq(fields.orgId, ctx.org.id)
          ),
        columns: { id: true, status: true },
      })

      if (!item) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Work item not found.' })
      }

      return approveTask({
        db: ctx.db,
        orgId: ctx.org.id,
        actorUserId: ctx.session.user.id,
        workItemId: input.workItemId,
      })
    }),

  reject: memberProcedure
    .input(
      z.object({
        workItemId: z.string(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const item = await ctx.db.query.workItems.findFirst({
        where: (fields, { and, eq }) =>
          and(
            eq(fields.id, input.workItemId),
            eq(fields.orgId, ctx.org.id)
          ),
        columns: { id: true, status: true },
      })

      if (!item) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Work item not found.' })
      }

      return rejectTask({
        db: ctx.db,
        orgId: ctx.org.id,
        actorUserId: ctx.session.user.id,
        workItemId: input.workItemId,
      })
    }),

  move: memberProcedure
    .input(
      z.object({
        workItemId: z.string(),
        workflowStateId: z.string(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      try {
        return await moveTask({
          db: ctx.db,
          orgId: ctx.org.id,
          actorUserId: ctx.session.user.id,
          workItemId: input.workItemId,
          workflowStateId: input.workflowStateId,
        })
      } catch (error) {
        throw new TRPCError({
          code: 'PRECONDITION_FAILED',
          message: error instanceof Error ? error.message : 'Failed to move task.',
        })
      }
    }),

  complete: memberProcedure
    .input(z.object({ workItemId: z.string(), actorType: z.enum(['user', 'kodi']).default('user') }))
    .mutation(async ({ ctx, input }) => {
      return completeTask({
        db: ctx.db,
        orgId: ctx.org.id,
        actor: { type: input.actorType, userId: input.actorType === 'user' ? ctx.session.user.id : null },
        workItemId: input.workItemId,
      })
    }),

  reopen: memberProcedure
    .input(z.object({ workItemId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      return reopenTask({
        db: ctx.db,
        orgId: ctx.org.id,
        actorUserId: ctx.session.user.id,
        workItemId: input.workItemId,
      })
    }),

  queueSync: memberProcedure
    .input(
      z.object({
        workItemId: z.string(),
        target: z.enum(['linear', 'github']),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const item = await ctx.db.query.workItems.findFirst({
        where: (fields, { and, eq }) =>
          and(
            eq(fields.id, input.workItemId),
            eq(fields.orgId, ctx.org.id)
          ),
      })

      if (!item) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Work item not found.' })
      }

      if (item.status !== 'approved') {
        throw new TRPCError({
          code: 'PRECONDITION_FAILED',
          message: 'Work item must be approved before it can be synced.',
        })
      }

      try {
        const result = await queueWorkItemSync({
          db: ctx.db,
          orgId: ctx.org.id,
          actorUserId: ctx.session.user.id,
          workItem: item,
          target: input.target as WorkItemSyncTarget,
        })

        return result
      } catch (error) {
        throw new TRPCError({
          code: 'PRECONDITION_FAILED',
          message:
            error instanceof Error ? error.message : 'Failed to queue work item sync.',
        })
      }
    }),

  listRuns: memberProcedure
    .input(
      z.object({
        workItemId: z.string(),
      })
    )
    .query(async ({ ctx, input }) => {
      // Verify work item belongs to org
      const item = await ctx.db.query.workItems.findFirst({
        where: (fields, { and, eq }) =>
          and(
            eq(fields.id, input.workItemId),
            eq(fields.orgId, ctx.org.id)
          ),
        columns: { id: true },
      })

      if (!item) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Work item not found.' })
      }

      return ctx.db.query.toolActionRuns.findMany({
        where: (fields, { eq }) => eq(fields.workItemId, input.workItemId),
        orderBy: (fields, { desc }) => desc(fields.createdAt),
      })
    }),

  retrySync: memberProcedure
    .input(
      z.object({
        runId: z.string(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      try {
        const result = await retryWorkItemSync({
          db: ctx.db,
          orgId: ctx.org.id,
          actorUserId: ctx.session.user.id,
          originalRunId: input.runId,
        })

        return result
      } catch (error) {
        throw new TRPCError({
          code: 'PRECONDITION_FAILED',
          message:
            error instanceof Error ? error.message : 'Failed to retry work item sync.',
        })
      }
    }),
})
