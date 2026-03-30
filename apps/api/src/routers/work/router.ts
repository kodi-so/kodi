import { z } from 'zod'
import { router, memberProcedure } from '../../trpc'

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
})
