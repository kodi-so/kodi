import { z } from 'zod'
import { desc, lt, eq, and, isNull } from 'drizzle-orm'
import { chatMessages, instances, decrypt } from '@kodi/db'
import { router, memberProcedure } from '../../trpc'
import { TRPCError } from '@trpc/server'

const WELCOME_MESSAGE =
  "Hey! I'm your Kodi agent. I'm here to help you grow your business — I can research leads, draft outreach emails, track your contacts, and surface opportunities you might be missing. What are you working on?"

const SYSTEM_PROMPT =
  "You are Kodi, a business growth assistant. You help users research leads, draft outreach emails, track contacts, and surface opportunities. Be concise and actionable."

// ~4 chars per token is a rough but safe estimate for English text
const CHARS_PER_TOKEN = 4
// Reserve tokens for the system prompt, the new user message, and the model's reply
const MAX_HISTORY_TOKENS = 200_000

/**
 * Builds the messages array for OpenClaw, filling from newest to oldest
 * until we approach the context window budget.
 */
function buildMessagesWithHistory(
  history: { role: 'user' | 'assistant'; content: string }[],
  newUserMessage: string,
): { role: string; content: string }[] {
  const systemMsg = { role: 'system', content: SYSTEM_PROMPT }

  // Budget remaining after system prompt + new message
  let budgetChars =
    MAX_HISTORY_TOKENS * CHARS_PER_TOKEN -
    SYSTEM_PROMPT.length -
    newUserMessage.length

  // history is already newest-first — walk backwards to fill budget
  const included: { role: string; content: string }[] = []
  for (const msg of history) {
    const cost = msg.content.length
    if (budgetChars - cost < 0) break
    budgetChars -= cost
    included.push({ role: msg.role, content: msg.content })
  }

  // Reverse so oldest is first (chronological order)
  included.reverse()

  return [systemMsg, ...included, { role: 'user', content: newUserMessage }]
}

export const chatRouter = router({
  /**
   * Deletes a message by ID (soft delete via deletedAt timestamp).
   * Requires caller to be an org member.
   * Only allows deletion of messages belonging to the org.
   */
  deleteMessage: memberProcedure
    .input(
      z.object({
        messageId: z.string(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      // Find message and verify it belongs to the verified org
      const message = await ctx.db.query.chatMessages.findFirst({
        where: eq(chatMessages.id, input.messageId),
      })

      if (!message) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Message not found' })
      }

      if (message.orgId !== ctx.org.id) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Message not found',
        })
      }

      if (message.deletedAt) {
        throw new TRPCError({
          code: 'PRECONDITION_FAILED',
          message: 'Message already deleted',
        })
      }

      // Soft delete by setting deletedAt timestamp
      const [deleted] = await ctx.db
        .update(chatMessages)
        .set({ deletedAt: new Date() })
        .where(eq(chatMessages.id, input.messageId))
        .returning()

      return deleted
    }),

  /**
   * Returns the last N messages for an org, newest-last (chronological order).
   * Supports cursor pagination via `before` (a message id).
   * On first load (no messages), inserts a welcome message and returns it.
   * Requires caller to be an org member (enforced by memberProcedure).
   * Excludes soft-deleted messages.
   */
  getHistory: memberProcedure
    .input(
      z.object({
        limit: z.number().int().min(1).max(100).default(50),
        before: z.string().optional(), // message id for cursor pagination
      })
    )
    .query(async ({ ctx, input }) => {
      const orgId = ctx.org.id
      const conditions = [eq(chatMessages.orgId, orgId), isNull(chatMessages.deletedAt)]

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
            orgId,
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

  /**
   * Forwards a user message to the org's OpenClaw instance and persists both sides.
   * Requires caller to be an org member.
   */
  sendMessage: memberProcedure
    .input(
      z.object({
        message: z.string().min(1),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const orgId = ctx.org.id

      // Look up the org's instance
      const instance = await ctx.db.query.instances.findFirst({
        where: eq(instances.orgId, orgId),
      })
      if (!instance) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'No instance found for this org' })
      }
      if (instance.status !== 'running') {
        throw new TRPCError({
          code: 'PRECONDITION_FAILED',
          message: `Instance is not ready (current status: ${instance.status})`,
        })
      }

      // Resolve instance URL (instanceUrl → hostname fallback → OPENCLAW_DEV_URL env)
      let instanceUrl: string | undefined
      if (instance.instanceUrl) {
        instanceUrl = instance.instanceUrl
      } else if (instance.hostname) {
        instanceUrl = `https://${instance.hostname}`
      } else if (process.env.OPENCLAW_DEV_URL) {
        instanceUrl = process.env.OPENCLAW_DEV_URL
      }
      if (!instanceUrl) {
        throw new TRPCError({
          code: 'PRECONDITION_FAILED',
          message: 'Instance has no reachable URL (instanceUrl, hostname, or OPENCLAW_DEV_URL required)',
        })
      }

      // Fetch conversation history (newest-first) and persist user message in parallel
      const [historyRows, userMessageRows] = await Promise.all([
        ctx.db
          .select({ role: chatMessages.role, content: chatMessages.content })
          .from(chatMessages)
          .where(and(
            eq(chatMessages.orgId, orgId),
            eq(chatMessages.status, 'sent'),
            isNull(chatMessages.deletedAt),
          ))
          .orderBy(desc(chatMessages.createdAt))
          .limit(200),
        ctx.db
          .insert(chatMessages)
          .values({
            orgId,
            userId: ctx.session.user.id,
            role: 'user',
            content: input.message,
            status: 'sent',
          })
          .returning(),
      ])
      const userMessage = userMessageRows[0]!

      // Build context-aware messages array
      const messages = buildMessagesWithHistory(historyRows, input.message)

      // Build auth header — decrypt gatewayToken if present
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
      }
      if (instance.gatewayToken) {
        try {
          const token = decrypt(instance.gatewayToken)
          if (token) {
            headers['Authorization'] = `Bearer ${token}`
          }
        } catch {
          // Decryption failed — attempt request without auth (don't hard-fail)
        }
      }

      // Forward to OpenClaw via OpenAI-compatible /v1/chat/completions
      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), 60_000)

      let responseText: string
      try {
        const res = await fetch(`${instanceUrl}/v1/chat/completions`, {
          method: 'POST',
          headers,
          body: JSON.stringify({
            model: 'openclaw:main',
            messages,
          }),
          signal: controller.signal,
        })
        clearTimeout(timeoutId)

        if (!res.ok) {
          const body = await res.text().catch(() => '')
          throw new Error(`Instance responded with HTTP ${res.status}: ${body}`)
        }

        const data = (await res.json()) as {
          choices?: { message?: { content?: string } }[]
        }
        const content = data.choices?.[0]?.message?.content
        if (!content) {
          throw new Error('Empty response from instance')
        }
        responseText = content
      } catch (err) {
        clearTimeout(timeoutId)
        // Mark user message as error — do NOT delete it
        await ctx.db
          .update(chatMessages)
          .set({ status: 'error' })
          .where(eq(chatMessages.id, userMessage.id))

        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: err instanceof Error ? err.message : 'Failed to reach instance',
        })
      }

      // Persist assistant message and return both
      const [assistantMessage] = await ctx.db
        .insert(chatMessages)
        .values({
          orgId,
          userId: null,
          role: 'assistant',
          content: responseText,
          status: 'sent',
        })
        .returning()

      return { userMessage, assistantMessage }
    }),
})
