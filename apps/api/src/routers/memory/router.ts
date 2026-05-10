import { z } from 'zod'
import { memberProcedure, router } from '../../trpc'
import {
  getMemoryManifest,
  listMemoryDirectory,
  readMemoryPath,
  searchMemory,
} from '../../lib/memory/service'

const memoryScopeSchema = z.enum(['org', 'member'])
const memorySearchScopeSchema = z.enum(['org', 'member', 'all'])

export const memoryRouter = router({
  manifest: memberProcedure
    .input(
      z.object({
        scope: memoryScopeSchema,
      })
    )
    .query(async ({ ctx, input }) => {
      return getMemoryManifest(ctx.db, {
        orgId: ctx.org.id,
        orgMemberId: ctx.membership.id,
        org: ctx.org,
        orgMember: ctx.membership,
        scope: input.scope,
      })
    }),

  listDirectory: memberProcedure
    .input(
      z.object({
        scope: memoryScopeSchema,
        path: z.string().trim().optional(),
      })
    )
    .query(async ({ ctx, input }) => {
      return listMemoryDirectory(ctx.db, {
        orgId: ctx.org.id,
        orgMemberId: ctx.membership.id,
        org: ctx.org,
        orgMember: ctx.membership,
        scope: input.scope,
        path: input.path,
      })
    }),

  readPath: memberProcedure
    .input(
      z.object({
        scope: memoryScopeSchema,
        path: z.string().trim().min(1),
      })
    )
    .query(async ({ ctx, input }) => {
      return readMemoryPath(ctx.db, {
        orgId: ctx.org.id,
        orgMemberId: ctx.membership.id,
        org: ctx.org,
        orgMember: ctx.membership,
        scope: input.scope,
        path: input.path,
      })
    }),

  search: memberProcedure
    .input(
      z.object({
        scope: memorySearchScopeSchema.default('all'),
        query: z.string().trim().min(1).max(200),
        limit: z.number().int().min(1).max(20).default(10),
      })
    )
    .query(async ({ ctx, input }) => {
      return searchMemory(ctx.db, {
        orgId: ctx.org.id,
        orgMemberId: ctx.membership.id,
        org: ctx.org,
        orgMember: ctx.membership,
        scope: input.scope,
        query: input.query,
        limit: input.limit,
      })
    }),
})
