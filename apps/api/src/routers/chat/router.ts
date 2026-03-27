import { z } from 'zod'
import { desc, lt, eq, and } from 'drizzle-orm'
import { chatMessages, instances, orgMembers, decrypt } from '@kodi/db'
import { router, protectedProcedure, memberProcedure } from '../../trpc'
import { TRPCError } from '@trpc/server'

const WELCOME_MESSAGE =
  "Hey! I'm your Kodi agent. I'm here to help you grow your business — I can research leads, draft outreach emails, track your contacts, and surface opportunities you might be missing. What are you working on?"

export const chatRouter = router({
  /**
   * Returns the last N messages for an org, newest-last (chronological order).
   * Supports cursor pagination via `before` (a message id).
   * On first load (no messages), inserts a welcome message and returns it.
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

  /**
   * Forwards a user message to the org's OpenClaw instance and persists both sides.
   * Requires caller to be an org member.
   */
  sendMessage: memberProcedure
    .input(
      z.object({
        orgId: z.string(),
        message: z.string().min(1),
      })
    )
    .mutation(async ({ ctx, input }) => {
      // 1. Org membership already verified by memberProcedure middleware.
      //    Double-check via DB query to be explicit and grab userId safely.
      const membership = await ctx.db.query.orgMembers.findFirst({
        where: and(
          eq(orgMembers.orgId, input.orgId),
          eq(orgMembers.userId, ctx.session.user.id)
        ),
      })
      if (!membership) {
        throw new TRPCError({ code: 'FORBIDDEN', message: 'Not a member of this org' })
      }

      // 2. Look up the org's instance
      const instance = await ctx.db.query.instances.findFirst({
        where: eq(instances.orgId, input.orgId),
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

      // 3. Resolve instance URL (instanceUrl → hostname fallback → OPENCLAW_DEV_URL env)
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

      // 4. Persist user message immediately with status='sent'
      const [userMessage] = await ctx.db
        .insert(chatMessages)
        .values({
          orgId: input.orgId,
          userId: ctx.session.user.id,
          role: 'user',
          content: input.message,
          status: 'sent',
        })
        .returning()

      // 5. Build auth header — decrypt gatewayToken if present
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

      // 6. Forward to OpenClaw with 60s timeout
      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), 60_000)

      let responseText: string
      try {
        const res = await fetch(`${instanceUrl}/api/chat`, {
          method: 'POST',
          headers,
          body: JSON.stringify({ message: input.message }),
          signal: controller.signal,
        })
        clearTimeout(timeoutId)

        if (!res.ok) {
          throw new Error(`Instance responded with HTTP ${res.status}`)
        }

        const data = (await res.json()) as { response?: string }
        if (!data.response) {
          throw new Error('Empty response from instance')
        }
        responseText = data.response
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

      // 7. Persist assistant message and return both
      const [assistantMessage] = await ctx.db
        .insert(chatMessages)
        .values({
          orgId: input.orgId,
          userId: null,
          role: 'assistant',
          content: responseText,
          status: 'sent',
        })
        .returning()

      return { userMessage, assistantMessage }
    }),
})
