import { z } from 'zod'
import { router, memberProcedure } from '../../trpc'
import { TRPCError } from '@trpc/server'
import { eq, workItems, toolActionRuns } from '@kodi/db'
import {
  queueWorkItemSync,
  retryWorkItemSync,
  type WorkItemSyncTarget,
} from '../../lib/meetings/work-item-sync'

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

      // Build metadata patch — preserve existing metadata, update ownerHint if provided
      const metadataPatch: Record<string, unknown> =
        input.ownerHint !== undefined
          ? { ...(item.metadata ?? {}), ownerHint: input.ownerHint }
          : (item.metadata ?? {})

      const [updated] = await ctx.db
        .update(workItems)
        .set({
          title: input.title ?? item.title,
          description:
            input.description !== undefined ? input.description : item.description,
          kind:
            input.kind !== undefined
              ? (input.kind as typeof item.kind)
              : item.kind,
          priority:
            input.priority !== undefined ? input.priority : item.priority,
          dueAt:
            input.dueAt !== undefined
              ? input.dueAt !== null
                ? new Date(input.dueAt)
                : null
              : item.dueAt,
          metadata: metadataPatch,
          updatedAt: new Date(),
        })
        .where(eq(workItems.id as never, input.workItemId as never) as never)
        .returning()

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

      const [updated] = await ctx.db
        .update(workItems)
        .set({ status: 'approved', updatedAt: new Date() })
        .where(eq(workItems.id as never, input.workItemId as never) as never)
        .returning()

      return updated ?? item
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

      const [updated] = await ctx.db
        .update(workItems)
        .set({ status: 'cancelled', updatedAt: new Date() })
        .where(eq(workItems.id as never, input.workItemId as never) as never)
        .returning()

      return updated ?? item
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
