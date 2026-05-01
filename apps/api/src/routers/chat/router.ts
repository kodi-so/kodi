import { TRPCError } from '@trpc/server'
import { z } from 'zod'
import { and, asc, chatChannels, chatMessages, desc, eq, inArray, isNull, lt, or, user } from '@kodi/db'
import { runAssistantTurn } from '../../lib/assistant-chat'
import { emitAppChatMemoryUpdateEvent } from '../../lib/memory/chat-events'
import { memberProcedure, router } from '../../trpc'

const SYSTEM_PROMPT =
  'You are Kodi, a helpful AI teammate for employees and teams. You help users reason through discussions, answer questions using available business context, capture decisions, clarify next steps, and suggest or execute follow-up work across connected tools. Be concise, practical, and collaborative.'

const DEFAULT_CHANNEL_NAME = 'general'

function normalizeChannelName(name: string) {
  return name.trim().replace(/\s+/g, ' ')
}

function slugifyChannelName(name: string) {
  return normalizeChannelName(name)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48)
}

async function ensureDefaultChannel(db: any, orgId: string) {
  const existing = await db.query.chatChannels.findFirst({
    where: and(
      eq(chatChannels.orgId, orgId),
      eq(chatChannels.slug, DEFAULT_CHANNEL_NAME)
    ),
  })

  if (existing) return existing

  const [created] = await db
    .insert(chatChannels)
    .values({
      id: `general_${orgId}`,
      orgId,
      name: DEFAULT_CHANNEL_NAME,
      slug: DEFAULT_CHANNEL_NAME,
    })
    .onConflictDoNothing()
    .returning()

  if (created) return created

  const fallback = await db.query.chatChannels.findFirst({
    where: and(
      eq(chatChannels.orgId, orgId),
      eq(chatChannels.slug, DEFAULT_CHANNEL_NAME)
    ),
  })

  if (!fallback) {
    throw new TRPCError({
      code: 'INTERNAL_SERVER_ERROR',
      message: 'Failed to create the default channel.',
    })
  }

  return fallback
}

async function getChannelOrThrow(db: any, orgId: string, channelId: string) {
  const channel = await db.query.chatChannels.findFirst({
    where: and(eq(chatChannels.id, channelId), eq(chatChannels.orgId, orgId)),
  })

  if (!channel) {
    throw new TRPCError({
      code: 'NOT_FOUND',
      message: 'Channel not found.',
    })
  }

  return channel
}

async function buildUniqueSlug(db: any, orgId: string, name: string) {
  const base = slugifyChannelName(name) || 'channel'
  let slug = base
  let suffix = 2

  while (true) {
    const existing = await db.query.chatChannels.findFirst({
      where: and(eq(chatChannels.orgId, orgId), eq(chatChannels.slug, slug)),
    })

    if (!existing) return slug

    slug = `${base}-${suffix}`
    suffix += 1
  }
}

const baseMessageSelect = {
  id: chatMessages.id,
  orgId: chatMessages.orgId,
  channelId: chatMessages.channelId,
  threadRootMessageId: chatMessages.threadRootMessageId,
  userId: chatMessages.userId,
  role: chatMessages.role,
  content: chatMessages.content,
  status: chatMessages.status,
  createdAt: chatMessages.createdAt,
  deletedAt: chatMessages.deletedAt,
  userName: user.name,
  userImage: user.image,
}

export const chatRouter = router({
  listChannels: memberProcedure.query(async ({ ctx }) => {
    await ensureDefaultChannel(ctx.db, ctx.org.id)

    return ctx.db
      .select({
        id: chatChannels.id,
        orgId: chatChannels.orgId,
        name: chatChannels.name,
        slug: chatChannels.slug,
        createdBy: chatChannels.createdBy,
        createdAt: chatChannels.createdAt,
      })
      .from(chatChannels)
      .where(eq(chatChannels.orgId, ctx.org.id))
      .orderBy(asc(chatChannels.createdAt))
  }),

  createChannel: memberProcedure
    .input(
      z.object({
        name: z.string().min(1).max(50),
      })
    )
    .mutation(async ({ ctx, input }) => {
      await ensureDefaultChannel(ctx.db, ctx.org.id)

      const name = normalizeChannelName(input.name)
      if (!name) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'Channel name is required.',
        })
      }

      const slug = await buildUniqueSlug(ctx.db, ctx.org.id, name)

      const [channel] = await ctx.db
        .insert(chatChannels)
        .values({
          orgId: ctx.org.id,
          name,
          slug,
          createdBy: ctx.session.user.id,
        })
        .returning()

      return channel
    }),

  getChannelMessages: memberProcedure
    .input(
      z.object({
        channelId: z.string(),
        limit: z.number().int().min(1).max(100).default(50),
        cursor: z.string().optional(),
      })
    )
    .query(async ({ ctx, input }) => {
      await ensureDefaultChannel(ctx.db, ctx.org.id)
      await getChannelOrThrow(ctx.db, ctx.org.id, input.channelId)

      let cursorCreatedAt: Date | null = null
      if (input.cursor) {
        const cursorRow = await ctx.db.query.chatMessages.findFirst({
          where: and(
            eq(chatMessages.id, input.cursor),
            eq(chatMessages.orgId, ctx.org.id)
          ),
          columns: { createdAt: true },
        })
        if (cursorRow) cursorCreatedAt = cursorRow.createdAt
      }

      const rootFilters = [
        eq(chatMessages.orgId, ctx.org.id),
        eq(chatMessages.channelId, input.channelId),
        isNull(chatMessages.threadRootMessageId),
        isNull(chatMessages.deletedAt),
      ]
      if (cursorCreatedAt) {
        rootFilters.push(lt(chatMessages.createdAt, cursorCreatedAt))
      }

      const rootRows = await ctx.db
        .select({ id: chatMessages.id })
        .from(chatMessages)
        .where(and(...rootFilters))
        .orderBy(desc(chatMessages.createdAt))
        .limit(input.limit + 1)

      const hasMore = rootRows.length > input.limit
      const pageRootIds = (hasMore ? rootRows.slice(0, input.limit) : rootRows).map(
        (row) => row.id
      )
      const nextCursor = hasMore
        ? (pageRootIds[pageRootIds.length - 1] ?? null)
        : null

      if (pageRootIds.length === 0) {
        return { messages: [], nextCursor: null }
      }

      const messages = await ctx.db
        .select(baseMessageSelect)
        .from(chatMessages)
        .leftJoin(user, eq(chatMessages.userId, user.id))
        .where(
          and(
            eq(chatMessages.orgId, ctx.org.id),
            eq(chatMessages.channelId, input.channelId),
            isNull(chatMessages.deletedAt),
            or(
              inArray(chatMessages.id, pageRootIds),
              inArray(chatMessages.threadRootMessageId, pageRootIds)
            )
          )
        )
        .orderBy(asc(chatMessages.createdAt))

      return { messages, nextCursor }
    }),

  sendMessage: memberProcedure
    .input(
      z.object({
        channelId: z.string(),
        message: z.string().min(1),
        threadRootMessageId: z.string().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const orgId = ctx.org.id

      await ensureDefaultChannel(ctx.db, orgId)
      await getChannelOrThrow(ctx.db, orgId, input.channelId)

      let historyRows: { role: 'user' | 'assistant'; content: string }[] = []

      if (input.threadRootMessageId) {
        const threadRoot = await ctx.db.query.chatMessages.findFirst({
          where: and(
            eq(chatMessages.id, input.threadRootMessageId),
            eq(chatMessages.orgId, orgId),
            eq(chatMessages.channelId, input.channelId),
            isNull(chatMessages.threadRootMessageId),
            isNull(chatMessages.deletedAt)
          ),
        })

        if (!threadRoot) {
          throw new TRPCError({
            code: 'NOT_FOUND',
            message: 'Thread not found.',
          })
        }

        historyRows = await ctx.db
          .select({
            role: chatMessages.role,
            content: chatMessages.content,
          })
          .from(chatMessages)
          .where(
            and(
              eq(chatMessages.orgId, orgId),
              eq(chatMessages.channelId, input.channelId),
              eq(chatMessages.status, 'sent'),
              isNull(chatMessages.deletedAt),
              or(
                eq(chatMessages.id, input.threadRootMessageId),
                eq(chatMessages.threadRootMessageId, input.threadRootMessageId)
              )
            )
          )
          .orderBy(desc(chatMessages.createdAt))
          .limit(200)
      }

      const [userMessage] = await ctx.db
        .insert(chatMessages)
        .values({
          orgId,
          channelId: input.channelId,
          threadRootMessageId: input.threadRootMessageId ?? null,
          userId: ctx.session.user.id,
          role: 'user',
          content: input.message,
          status: 'pending',
        })
        .returning()

      if (!userMessage) {
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to store the user message.',
        })
      }

      let responseText: string

      try {
        const result = await runAssistantTurn({
          db: ctx.db,
          orgId,
          actorUserId: ctx.session.user.id,
          sourceId: userMessage.id,
          userMessage: input.message,
          history: historyRows,
          visibility: 'shared',
          sessionKey: `chat-thread:${input.threadRootMessageId ?? userMessage.id}`,
          messageChannel: 'chat',
          systemPrompt: SYSTEM_PROMPT,
        })

        responseText = result.content
      } catch (error) {
        await ctx.db
          .update(chatMessages)
          .set({ status: 'error' })
          .where(eq(chatMessages.id, userMessage.id))

        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message:
            error instanceof Error ? error.message : 'Failed to reach instance',
        })
      }

      const effectiveThreadRootMessageId =
        input.threadRootMessageId ?? userMessage.id

      const [assistantMessage] = await ctx.db
        .insert(chatMessages)
        .values({
          orgId,
          channelId: input.channelId,
          threadRootMessageId: effectiveThreadRootMessageId,
          userId: null,
          role: 'assistant',
          content: responseText,
          status: 'sent',
        })
        .returning()

      if (!assistantMessage) {
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to store the assistant reply.',
        })
      }

      const [sentUserMessage] = await ctx.db
        .update(chatMessages)
        .set({ status: 'sent' })
        .where(eq(chatMessages.id, userMessage.id))
        .returning()

      try {
        await emitAppChatMemoryUpdateEvent({
          orgId,
          orgMemberId: ctx.membership.id,
          actorUserId: ctx.session.user.id,
          channelId: input.channelId,
          threadId: effectiveThreadRootMessageId,
          userMessageId: userMessage.id,
          assistantMessageId: assistantMessage.id,
          userMessage: input.message,
          assistantMessage: responseText,
        })
      } catch (error) {
        console.warn('[chat] memory event dispatch failed', {
          orgId,
          channelId: input.channelId,
          threadId: effectiveThreadRootMessageId,
          userMessageId: userMessage.id,
          assistantMessageId: assistantMessage.id,
          error: error instanceof Error ? error.message : String(error),
        })
      }

      return {
        userMessage: sentUserMessage ?? { ...userMessage, status: 'sent' },
        assistantMessage,
        threadRootMessageId: effectiveThreadRootMessageId,
      }
    }),
})
