import { TRPCError } from '@trpc/server'
import {
  and,
  dashboardAssistantMessages,
  dashboardAssistantThreads,
  desc,
  eq,
  inArray,
} from '@kodi/db'
import { z } from 'zod'
import { runAssistantTurn } from '../../lib/assistant-chat'
import { emitDashboardAssistantMemoryUpdateEvent } from '../../lib/memory/chat-events'
import { memberProcedure, router } from '../../trpc'

const DASHBOARD_SYSTEM_PROMPT =
  'You are Kodi, a personal workspace analyst for the current user. Use the connected business context to answer one-off questions, surface relevant analytics and metrics when available, explain your reasoning clearly, and stay focused on the user’s immediate request. Treat this as a private direct-message conversation, not a team channel conversation.'

const DEFAULT_CONVERSATION_TITLE = 'Kodi'

function buildThreadTitle(message: string) {
  return message.trim().replace(/\s+/g, ' ').slice(0, 80) || 'New thread'
}

async function listDashboardThreadsForUser(
  db: any,
  orgId: string,
  userId: string
) {
  return (db as any).query.dashboardAssistantThreads.findMany({
    where: (table: typeof dashboardAssistantThreads, { and, eq }: any) =>
      and(eq(table.orgId, orgId), eq(table.createdBy, userId)),
    orderBy: (table: typeof dashboardAssistantThreads, { desc }: any) => [
      desc(table.updatedAt),
    ],
    limit: 30,
  })
}

async function getOrCreateDashboardConversationThread(
  db: any,
  orgId: string,
  userId: string
) {
  const existing = await listDashboardThreadsForUser(db, orgId, userId)
  const activeThread = existing[0]

  if (activeThread) {
    return {
      activeThread,
      threadIds: existing.map((thread: { id: string }) => thread.id),
    }
  }

  const [thread] = await db
    .insert(dashboardAssistantThreads)
    .values({
      orgId,
      createdBy: userId,
      title: DEFAULT_CONVERSATION_TITLE,
    })
    .returning()

  if (!thread) {
    throw new TRPCError({
      code: 'INTERNAL_SERVER_ERROR',
      message: 'Failed to create the private conversation.',
    })
  }

  return {
    activeThread: thread,
    threadIds: [thread.id],
  }
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
    return listDashboardThreadsForUser(ctx.db, ctx.org.id, ctx.session.user.id)
  }),

  getConversation: memberProcedure.query(async ({ ctx }) => {
    const threads = await listDashboardThreadsForUser(
      ctx.db,
      ctx.org.id,
      ctx.session.user.id
    )
    const threadIds = threads.map((thread: { id: string }) => thread.id)

    if (threadIds.length === 0) {
      return {
        threadId: null,
        messages: [],
      }
    }

    const rows = await (
      ctx.db as any
    ).query.dashboardAssistantMessages.findMany({
      where: (
        table: typeof dashboardAssistantMessages,
        { and, eq, inArray, isNull }: any
      ) =>
        and(
          eq(table.orgId, ctx.org.id),
          inArray(table.threadId, threadIds),
          isNull(table.deletedAt)
        ),
      orderBy: (table: typeof dashboardAssistantMessages, { asc }: any) => [
        asc(table.createdAt),
      ],
      limit: 500,
      with: {
        author: {
          columns: {
            name: true,
            image: true,
          },
        },
      },
    })

    return {
      threadId: threads[0]!.id,
      messages: rows.map((row: any) => ({
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
      })),
    }
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
          visibility: 'private',
          sessionKey: `dashboard-thread:${threadId}`,
          messageChannel: 'dashboard-private',
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

      try {
        await emitDashboardAssistantMemoryUpdateEvent({
          orgId,
          orgMemberId: ctx.membership.id,
          actorUserId,
          threadId: thread.id,
          userMessageId: userMessage.id,
          assistantMessageId: assistantMessage.id,
          userMessage: content,
          assistantMessage: responseText,
          conversationMode: 'thread',
        })
      } catch (error) {
        console.warn('[dashboard-assistant] memory event dispatch failed', {
          orgId,
          threadId: thread.id,
          userMessageId: userMessage.id,
          assistantMessageId: assistantMessage.id,
          error: error instanceof Error ? error.message : String(error),
        })
      }

      return {
        thread,
        userMessage,
        assistantMessage,
      }
    }),

  sendConversationMessage: memberProcedure
    .input(
      z.object({
        message: z.string().min(1),
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

      const { activeThread, threadIds } =
        await getOrCreateDashboardConversationThread(db, orgId, actorUserId)

      const historyRows =
        threadIds.length > 0
          ? await db.query.dashboardAssistantMessages.findMany({
              columns: {
                role: true,
                content: true,
              },
              where: (
                table: typeof dashboardAssistantMessages,
                { and, eq, inArray, isNull }: any
              ) =>
                and(
                  eq(table.orgId, orgId),
                  inArray(table.threadId, threadIds),
                  eq(table.status, 'sent'),
                  isNull(table.deletedAt)
                ),
              orderBy: (
                table: typeof dashboardAssistantMessages,
                { desc }: any
              ) => [desc(table.createdAt)],
              limit: 200,
            })
          : []

      const [userMessage] = await db
        .insert(dashboardAssistantMessages)
        .values({
          orgId,
          threadId: activeThread.id,
          userId: actorUserId,
          role: 'user',
          content,
          status: 'sent',
        })
        .returning()

      if (!userMessage) {
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to store the private message.',
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
          visibility: 'private',
          sessionKey: `dashboard-thread:${activeThread.id}`,
          messageChannel: 'dashboard-private',
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
          threadId: activeThread.id,
          userId: null,
          role: 'assistant',
          content: responseText,
          status: 'sent',
        })
        .returning()

      if (!assistantMessage) {
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to store the private reply.',
        })
      }

      await db
        .update(dashboardAssistantThreads)
        .set({
          updatedAt: new Date(),
          title:
            activeThread.title === DEFAULT_CONVERSATION_TITLE
              ? activeThread.title
              : buildThreadTitle(content),
        })
        .where(eq(dashboardAssistantThreads.id as any, activeThread.id))

      try {
        await emitDashboardAssistantMemoryUpdateEvent({
          orgId,
          orgMemberId: ctx.membership.id,
          actorUserId,
          threadId: activeThread.id,
          userMessageId: userMessage.id,
          assistantMessageId: assistantMessage.id,
          userMessage: content,
          assistantMessage: responseText,
          conversationMode: 'conversation',
        })
      } catch (error) {
        console.warn('[dashboard-assistant] memory event dispatch failed', {
          orgId,
          threadId: activeThread.id,
          userMessageId: userMessage.id,
          assistantMessageId: assistantMessage.id,
          error: error instanceof Error ? error.message : String(error),
        })
      }

      return {
        threadId: activeThread.id,
        userMessage,
        assistantMessage,
      }
    }),
})
