import { initTRPC, TRPCError } from '@trpc/server'
import { z, ZodError } from 'zod'
import type { TRPCContext, OrgMemberWithOrg } from './context'
import type { Organization } from '@kodi/db'

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

// ── Auth middleware ────────────────────────────────────────────────────────

/** Validates session cookie/header via better-auth */
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

// ── RBAC middleware ────────────────────────────────────────────────────────

/** All org-scoped procedure inputs must include orgId */
const orgScopedInput = z.object({ orgId: z.string() })

/**
 * requireMember — caller must be any member of the org.
 * Enriches context with membership, org, and userRole.
 */
export const requireMember = isAuthed.unstable_pipe(
  async ({ ctx, getRawInput, next }) => {
    const rawInput = await getRawInput()
    const parsed = orgScopedInput.safeParse(rawInput)
    if (!parsed.success) {
      throw new TRPCError({ code: 'BAD_REQUEST', message: 'orgId required' })
    }

    const membership = await ctx.getOrgMembership(parsed.data.orgId)
    if (!membership) {
      throw new TRPCError({ code: 'FORBIDDEN', message: 'Not a member of this org' })
    }

    return next({
      ctx: {
        ...ctx,
        membership: membership as OrgMemberWithOrg,
        org: membership.org as Organization,
        userRole: membership.role,
      },
    })
  },
)

/**
 * requireOwner — caller must have role='owner'.
 * Stacks on top of requireMember, so org context is already available.
 */
export const requireOwner = requireMember.unstable_pipe(async ({ ctx, next }) => {
  if (ctx.userRole !== 'owner') {
    throw new TRPCError({ code: 'FORBIDDEN', message: 'Owner access required' })
  }
  return next()
})

/** Drop-in replacement for protectedProcedure on org-scoped member routes */
export const memberProcedure = t.procedure.use(requireMember)

/** Drop-in replacement for protectedProcedure on org-scoped owner-only routes */
export const ownerProcedure = t.procedure.use(requireOwner)
