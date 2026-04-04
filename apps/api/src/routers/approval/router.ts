import { TRPCError } from '@trpc/server'
import { z } from 'zod'
import {
  decideToolApprovalRequest,
  listToolApprovalRequests,
} from '../../lib/tool-access-approvals'
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
})
