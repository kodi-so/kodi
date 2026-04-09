import { TRPCError } from '@trpc/server'
import { dashboardAssistantMessages, dashboardAssistantThreads, eq } from '@kodi/db'
import { z } from 'zod'
import { runAssistantTurn } from '../../lib/assistant-chat'
import { memberProcedure, router } from '../../trpc'

const DASHBOARD_SYSTEM_PROMPT =
  'You are Kodi, a personal workspace analyst for the current user. Use the connected business context to answer one-off questions, surface relevant analytics and metrics when available, explain your reasoning clearly, and stay focused on the user’s immediate request. Treat this as a private thread, not a team channel conversation.'

function buildThreadTitle(message: string) {
  return message.trim().replace(/\s+/g, ' ').slice(0, 80) || 'New thread'
}

async function getDashboardThreadOrThrow(
  db: any,
  orgId: string,
  threadId: string,
  userId: string
) {
  const thread = await db.query.dashboardAssistantThreads.findFirst({
    where: (table: typeof dashboardAssistantThreads, { and, eq }: any) =>
      and(
        eq(table.id, threadId),
        eq(table.orgId, orgId),
        eq(table.createdBy, userId)
      ),
  })

  if (!thread) {
    throw new TRPCError({
      code: 'NOT_FOUND',
      message: 'Dashboard thread not found.',
    })
  }

  return thread
}

export const dashboardAssistantRouter = router({
  listThreads: memberProcedure.query(async ({ ctx }) => {
    return (ctx.db as any).query.dashboardAssistantThreads.findMany({
      where: (table: typeof dashboardAssistantThreads, { and, eq }: any) =>
        and(
          eq(table.orgId, ctx.org.id),
          eq(table.createdBy, ctx.session.user.id)
        ),
      orderBy: (table: typeof dashboardAssistantThreads, { desc }: any) => [
        desc(table.updatedAt),
      ],
      limit: 30,
    })
  }),

  getThreadMessages: memberProcedure
    .input(
      z.object({
        threadId: z.string(),
        limit: z.number().int().min(1).max(500).default(300),
      })
    )
    .query(async ({ ctx, input }) => {
      await getDashboardThreadOrThrow(
        ctx.db,
        ctx.org.id,
        input.threadId,
        ctx.session.user.id
      )

      const rows = await (
        ctx.db as any
      ).query.dashboardAssistantMessages.findMany({
        where: (
          table: typeof dashboardAssistantMessages,
          { and, eq, isNull }: any
        ) =>
          and(
            eq(table.orgId, ctx.org.id),
            eq(table.threadId, input.threadId),
            isNull(table.deletedAt)
          ),
        orderBy: (table: typeof dashboardAssistantMessages, { asc }: any) => [
          asc(table.createdAt),
        ],
        limit: input.limit,
        with: {
          author: {
            columns: {
              name: true,
              image: true,
            },
          },
        },
      })

      return rows.map((row: any) => ({
        id: row.id,
        orgId: row.orgId,
        threadId: row.threadId,
        userId: row.userId,
        role: row.role,
        content: row.content,
        status: row.status,
        createdAt: row.createdAt,
        userName: row.author?.name ?? null,
        userImage: row.author?.image ?? null,
      }))
    }),

  sendMessage: memberProcedure
    .input(
      z.object({
        message: z.string().min(1),
        threadId: z.string().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const db: any = ctx.db
      const orgId = ctx.org.id
      const actorUserId = ctx.session.user.id
      const content = input.message.trim()

      if (!content) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'Message is required.',
        })
      }

      let threadId = input.threadId

      if (threadId) {
        await getDashboardThreadOrThrow(db, orgId, threadId, actorUserId)
      } else {
        const [thread] = await db
          .insert(dashboardAssistantThreads)
          .values({
            orgId,
            createdBy: actorUserId,
            title: buildThreadTitle(content),
          })
          .returning()

        if (!thread) {
          throw new TRPCError({
            code: 'INTERNAL_SERVER_ERROR',
            message: 'Failed to create the dashboard thread.',
          })
        }

        threadId = thread.id
      }

      const historyRows = await db.query.dashboardAssistantMessages.findMany({
        columns: {
          role: true,
          content: true,
        },
        where: (
          table: typeof dashboardAssistantMessages,
          { and, eq, isNull }: any
        ) =>
          and(
            eq(table.orgId, orgId),
            eq(table.threadId, threadId),
            eq(table.status, 'sent'),
            isNull(table.deletedAt)
          ),
        orderBy: (table: typeof dashboardAssistantMessages, { desc }: any) => [
          desc(table.createdAt),
        ],
        limit: 200,
      })

      const [userMessage] = await db
        .insert(dashboardAssistantMessages)
        .values({
          orgId,
          threadId,
          userId: actorUserId,
          role: 'user',
          content,
          status: 'sent',
        })
        .returning()

      if (!userMessage) {
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to store the dashboard message.',
        })
      }

      let responseText: string

      try {
        const result = await runAssistantTurn({
          db,
          orgId,
          actorUserId,
          sourceId: userMessage.id,
          userMessage: content,
          history: historyRows,
          systemPrompt: DASHBOARD_SYSTEM_PROMPT,
        })

        responseText = result.content
      } catch (error) {
        await db
          .update(dashboardAssistantMessages)
          .set({ status: 'error' })
          .where(eq(dashboardAssistantMessages.id as any, userMessage.id))

        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message:
            error instanceof Error ? error.message : 'Failed to reach instance',
        })
      }

      const [assistantMessage] = await db
        .insert(dashboardAssistantMessages)
        .values({
          orgId,
          threadId,
          userId: null,
          role: 'assistant',
          content: responseText,
          status: 'sent',
        })
        .returning()

      if (!assistantMessage) {
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to store the dashboard reply.',
        })
      }

      const [thread] = await db
        .update(dashboardAssistantThreads)
        .set({ updatedAt: new Date() })
        .where(eq(dashboardAssistantThreads.id as any, threadId))
        .returning({
          id: dashboardAssistantThreads.id,
          orgId: dashboardAssistantThreads.orgId,
          createdBy: dashboardAssistantThreads.createdBy,
          title: dashboardAssistantThreads.title,
          createdAt: dashboardAssistantThreads.createdAt,
          updatedAt: dashboardAssistantThreads.updatedAt,
        })

      if (!thread) {
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to update the dashboard thread.',
        })
      }

      return {
        thread,
        userMessage,
        assistantMessage,
      }
    }),
})
