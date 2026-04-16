import { TRPCError } from '@trpc/server'
import { z } from 'zod'
import {
  decideToolApprovalRequest,
  listToolApprovalRequests,
} from '../../lib/tool-access-approvals'
import { retryWorkItemSync } from '../../lib/meetings/work-item-sync'
import { router, memberProcedure } from '../../trpc'

export const approvalRouter = router({
  list: memberProcedure
    .input(
      z.object({
        status: z
          .enum(['pending', 'approved', 'rejected', 'expired'])
          .optional(),
        limit: z.number().int().min(1).max(100).default(50),
      })
    )
    .query(async ({ ctx, input }) => {
      const items = await listToolApprovalRequests({
        db: ctx.db,
        orgId: ctx.org.id,
        status: input.status,
        limit: input.limit,
      })

      return {
        items,
        summary: {
          pendingCount: items.filter((item) => item.status === 'pending').length,
          decidedCount: items.filter((item) => item.status !== 'pending').length,
        },
      }
    }),

  decide: memberProcedure
    .input(
      z.object({
        approvalRequestId: z.string().min(1),
        decision: z.enum(['approved', 'rejected']),
      })
    )
    .mutation(async ({ ctx, input }) => {
      try {
        return await decideToolApprovalRequest({
          approvalRequestId: input.approvalRequestId,
          db: ctx.db,
          decision: input.decision,
          orgId: ctx.org.id,
          decidedByUserId: ctx.session.user.id,
        })
      } catch (error) {
        throw new TRPCError({
          code: 'PRECONDITION_FAILED',
          message:
            error instanceof Error
              ? error.message
              : 'Failed to decide the approval request.',
        })
      }
    }),

  listByWorkItem: memberProcedure
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

      const runs = await ctx.db.query.toolActionRuns.findMany({
        where: (fields, { eq }) => eq(fields.workItemId, input.workItemId),
        orderBy: (fields, { desc }) => desc(fields.createdAt),
      })

      return runs.map((run) => ({
        id: run.id,
        action: run.action,
        toolkitSlug: run.toolkitSlug,
        status: run.status,
        targetText: run.targetText,
        error: run.error,
        attemptCount: run.attemptCount,
        idempotencyKey: run.idempotencyKey,
        startedAt: run.startedAt,
        completedAt: run.completedAt,
        createdAt: run.createdAt,
        approvalRequestId: run.approvalRequestId,
        responsePayload: run.responsePayload,
      }))
    }),

  retryRun: memberProcedure
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
            error instanceof Error ? error.message : 'Failed to retry the action run.',
        })
      }
    }),
})
