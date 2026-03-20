import { z } from 'zod'
import { router, publicProcedure } from '../trpc'
import { users } from '@kodi/db'
import { eq } from 'drizzle-orm'

export const usersRouter = router({
  list: publicProcedure.query(async ({ ctx }) => {
    return ctx.db.select().from(users)
  }),
  byId: publicProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ ctx, input }) => {
      const [user] = await ctx.db.select().from(users).where(eq(users.id, input.id))
      return user ?? null
    }),
})
