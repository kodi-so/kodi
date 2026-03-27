import { z } from 'zod'
import { desc, lt, eq, and } from 'drizzle-orm'
import { chatMessages } from '@kodi/db'
import { router, protectedProcedure } from '../../trpc'

export const chatRouter = router({
  /**
   * Returns the last N messages for an org, newest-last (chronological order).
   * Supports cursor pagination via `before` (a message id).
   */
  getHistory: protectedProcedure
    .input(
      z.object({
        orgId: z.string(),
        limit: z.number().int().min(1).max(100).default(50),
        before: z.string().optional(), // message id for cursor pagination
      })
    )
    .query(async ({ ctx, input }) => {
      // TODO: verify user is org member (add in KOD-18 after org membership check helper exists)
      const conditions = [eq(chatMessages.orgId, input.orgId)]

      if (input.before) {
        const cursor = await ctx.db.query.chatMessages.findFirst({
          where: eq(chatMessages.id, input.before),
        })
        if (cursor) {
          conditions.push(lt(chatMessages.createdAt, cursor.createdAt))
        }
      }

      const rows = await ctx.db
        .select()
        .from(chatMessages)
        .where(and(...conditions))
        .orderBy(desc(chatMessages.createdAt))
        .limit(input.limit)

      // Return in chronological order (oldest first)
      return rows.reverse()
    }),
})
