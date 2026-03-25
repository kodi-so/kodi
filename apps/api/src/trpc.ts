import { initTRPC, TRPCError } from '@trpc/server'
import { ZodError } from 'zod'
import type { TRPCContext } from './context'

const t = initTRPC.context<TRPCContext>().create({
  errorFormatter({ shape, error }) {
    return {
      ...shape,
      data: {
        ...shape.data,
        zodError: error.cause instanceof ZodError ? error.cause.flatten() : null,
      },
    }
  },
})

export const router = t.router
export const publicProcedure = t.procedure
export const middleware = t.middleware

// Auth middleware — validates session cookie/header via better-auth
const isAuthed = middleware(async ({ ctx, next }) => {
  const session = ctx.session
  if (!session?.user) {
    throw new TRPCError({ code: 'UNAUTHORIZED' })
  }
  return next({
    ctx: {
      ...ctx,
      session,
    },
  })
})

export const protectedProcedure = t.procedure.use(isAuthed)
