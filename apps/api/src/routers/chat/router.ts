import { z } from 'zod'
import { desc, lt, eq, and } from 'drizzle-orm'
import { chatMessages } from '@kodi/db'
import { router, memberProcedure } from '../../trpc'

const WELCOME_MESSAGE =
  "Hey! I'm your Kodi agent. I'm here to help you grow your business — I can research leads, draft outreach emails, track your contacts, and surface opportunities you might be missing. What are you working on?"

export const chatRouter = router({
  /**
   * Returns the last N messages for an org, newest-last (chronological order).
   * Supports cursor pagination via `before` (a message id).
   * On first load (no messages), inserts a welcome message and returns it.
   * Requires caller to be an org member (enforced by memberProcedure).
   */
  getHistory: memberProcedure
    .input(
      z.object({
        orgId: z.string(),
        limit: z.number().int().min(1).max(100).default(50),
        before: z.string().optional(), // message id for cursor pagination
      })
    )
    .query(async ({ ctx, input }) => {
      // Membership enforced by memberProcedure middleware
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

      // On first load with no prior messages, seed the welcome message
      if (rows.length === 0 && !input.before) {
        const welcome = await ctx.db
          .insert(chatMessages)
          .values({
            orgId: input.orgId,
            userId: null,
            role: 'assistant',
            content: WELCOME_MESSAGE,
          })
          .returning()
        return welcome
      }

      // Return in chronological order (oldest first)
      return rows.reverse()
    }),
})
