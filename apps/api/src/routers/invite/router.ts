import { z } from 'zod'
import { eq, and, isNull, gt } from 'drizzle-orm'
import { TRPCError } from '@trpc/server'
import { Resend } from 'resend'
import { orgInvites, orgMembers, organizations } from '@kodi/db'
import { router, protectedProcedure, publicProcedure, ownerProcedure } from '../../trpc'
import { env } from '../../env'

// ── JWT helpers (no external dep — use Web Crypto) ────────────────────────

function base64url(input: ArrayBuffer): string {
  return Buffer.from(input)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=/g, '')
}

function base64urlDecode(input: string): Buffer {
  const padded = input.replace(/-/g, '+').replace(/_/g, '/') + '=='.slice(0, (4 - (input.length % 4)) % 4)
  return Buffer.from(padded, 'base64')
}

async function getHmacKey(secret: string): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign', 'verify'],
  )
}

interface InvitePayload {
  inviteId: string
  orgId: string
  email: string
  exp: number
}

async function signInviteJwt(payload: InvitePayload, secret: string): Promise<string> {
  const header = base64url(new TextEncoder().encode(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).buffer as ArrayBuffer)
  const body = base64url(new TextEncoder().encode(JSON.stringify(payload)).buffer as ArrayBuffer)
  const signingInput = `${header}.${body}`
  const key = await getHmacKey(secret)
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(signingInput))
  return `${signingInput}.${base64url(sig)}`
}

async function verifyInviteJwt(token: string, secret: string): Promise<InvitePayload> {
  const parts = token.split('.')
  if (parts.length !== 3) throw new Error('Invalid JWT format')
  const header = parts[0]!
  const body = parts[1]!
  const sig = parts[2]!
  const signingInput = `${header}.${body}`
  const key = await getHmacKey(secret)
  const valid = await crypto.subtle.verify(
    'HMAC',
    key,
    new Uint8Array(base64urlDecode(sig)),
    new TextEncoder().encode(signingInput),
  )
  if (!valid) throw new Error('Invalid JWT signature')
  const payload = JSON.parse(base64urlDecode(body).toString('utf-8')) as InvitePayload
  if (payload.exp < Math.floor(Date.now() / 1000)) throw new Error('JWT expired')
  return payload
}

// ── Router ─────────────────────────────────────────────────────────────────

export const inviteRouter = router({
  /**
   * invite.send — owner only
   * Generates a signed JWT invite token, stores it, and sends an email via Resend.
   * In dev (no RESEND_API_KEY), logs the invite link to console instead.
   */
  send: protectedProcedure
    .input(z.object({ orgId: z.string(), email: z.string().email() }))
    .mutation(async ({ ctx, input }) => {
      const jwtSecret = env.INVITE_JWT_SECRET
      const appUrl = env.APP_URL ?? 'http://localhost:3000'

      if (!jwtSecret) {
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'INVITE_JWT_SECRET is not configured.',
        })
      }

      // 1. Verify caller is org owner
      const org = await ctx.db.query.organizations.findFirst({
        where: eq(organizations.id, input.orgId),
      })
      if (!org) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Organisation not found.' })
      }
      if (org.ownerId !== ctx.session!.user.id) {
        throw new TRPCError({ code: 'FORBIDDEN', message: 'Only the org owner can send invites.' })
      }

      // 2. Check for an existing active (unused + non-expired) invite for this email+org
      const now = new Date()
      const existing = await ctx.db.query.orgInvites.findFirst({
        where: and(
          eq(orgInvites.orgId, input.orgId),
          eq(orgInvites.email, input.email.toLowerCase()),
          isNull(orgInvites.usedAt),
          gt(orgInvites.expiresAt, now),
        ),
      })
      if (existing) {
        throw new TRPCError({
          code: 'CONFLICT',
          message: 'An active invite already exists for this email address.',
        })
      }

      // 3. Generate invite record + JWT
      const inviteId = crypto.randomUUID()
      const expiresAt = new Date(Date.now() + 48 * 60 * 60 * 1000) // 48h

      const payload: InvitePayload = {
        inviteId,
        orgId: input.orgId,
        email: input.email.toLowerCase(),
        exp: Math.floor(expiresAt.getTime() / 1000),
      }
      const token = await signInviteJwt(payload, jwtSecret)

      // 4. Insert org_invites row
      await ctx.db.insert(orgInvites).values({
        id: inviteId,
        orgId: input.orgId,
        email: input.email.toLowerCase(),
        token,
        invitedBy: ctx.session!.user.id,
        expiresAt,
      })

      // 5. Send email via Resend (or log to console in dev)
      const inviteUrl = `${appUrl}/invite?token=${encodeURIComponent(token)}`

      if (env.RESEND_API_KEY) {
        const resend = new Resend(env.RESEND_API_KEY)
        const { error: resendError } = await resend.emails.send({
          from: 'Kodi <invites@kodi.so>',
          to: input.email,
          subject: `You've been invited to join ${org.name} on Kodi`,
          html: `
<!DOCTYPE html>
<html>
<body style="font-family: sans-serif; background: #0a0a0f; color: #e5e5e5; padding: 40px 20px;">
  <div style="max-width: 520px; margin: 0 auto; background: #12121a; border-radius: 12px; padding: 40px; border: 1px solid #2a2a3a;">
    <h1 style="font-size: 22px; font-weight: 600; color: #fff; margin: 0 0 16px;">
      You're invited to join ${org.name}
    </h1>
    <p style="color: #a0a0b8; line-height: 1.6; margin: 0 0 32px;">
      ${ctx.session!.user.name ?? ctx.session!.user.email} has invited you to join <strong style="color: #e5e5e5;">${org.name}</strong> on Kodi — the agentic platform for modern sales teams.
    </p>
    <a href="${inviteUrl}"
       style="display: inline-block; background: #6366f1; color: #fff; text-decoration: none;
              font-weight: 600; padding: 14px 28px; border-radius: 8px; font-size: 15px;">
      Accept Invitation
    </a>
    <p style="color: #666680; font-size: 13px; margin: 32px 0 0;">
      This invite expires in 48 hours. If you weren't expecting this, you can ignore it.
    </p>
  </div>
</body>
</html>`,
        })
        if (resendError) {
          console.error('[invite.send] Resend error:', resendError)
          throw new TRPCError({
            code: 'INTERNAL_SERVER_ERROR',
            message: `Failed to send invite email: ${resendError.message}`,
          })
        }
      } else {
        console.log(`[DEV] Invite link for ${input.email}:`, inviteUrl)
      }

      return { success: true }
    }),

  /**
   * invite.accept — public procedure
   * Verifies the JWT, adds the authenticated user to org_members, marks invite used.
   * Throws UNAUTHORIZED if not logged in (frontend redirects to login).
   */
  accept: publicProcedure
    .input(z.object({ token: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const jwtSecret = env.INVITE_JWT_SECRET
      if (!jwtSecret) {
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'INVITE_JWT_SECRET is not configured.',
        })
      }

      // 1. Verify + decode JWT
      let payload: InvitePayload
      try {
        payload = await verifyInviteJwt(input.token, jwtSecret)
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : 'Invalid token'
        if (message.includes('expired') || message === 'JWT expired') {
          throw new TRPCError({ code: 'BAD_REQUEST', message: 'This invite link has expired.' })
        }
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'This invite link is invalid.' })
      }

      // 2. Look up org_invites row
      const invite = await ctx.db.query.orgInvites.findFirst({
        where: eq(orgInvites.id, payload.inviteId),
      })
      if (!invite) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Invite not found.' })
      }
      if (invite.usedAt !== null) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'This invite has already been used.' })
      }
      if (invite.expiresAt < new Date()) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'This invite link has expired.' })
      }

      // 3. Require logged-in user
      if (!ctx.session?.user) {
        throw new TRPCError({ code: 'UNAUTHORIZED', message: 'You must be logged in to accept this invite.' })
      }
      const userId = ctx.session.user.id

      // 4. Check if user is already a member (idempotent)
      const existingMember = await ctx.db.query.orgMembers.findFirst({
        where: and(eq(orgMembers.orgId, invite.orgId), eq(orgMembers.userId, userId)),
      })
      if (existingMember) {
        // Already a member — mark invite used if not already and return success
        if (invite.usedAt === null) {
          await ctx.db
            .update(orgInvites)
            .set({ usedAt: new Date() })
            .where(eq(orgInvites.id, invite.id))
        }
        const org = await ctx.db.query.organizations.findFirst({
          where: eq(organizations.id, invite.orgId),
        })
        return { orgId: invite.orgId, orgSlug: org?.slug ?? '' }
      }

      // 5. Insert org_members row
      await ctx.db.insert(orgMembers).values({
        orgId: invite.orgId,
        userId,
        role: 'member',
      })

      // 6. Mark invite used
      await ctx.db.update(orgInvites).set({ usedAt: new Date() }).where(eq(orgInvites.id, invite.id))

      // 7. Return org info for redirect
      const org = await ctx.db.query.organizations.findFirst({
        where: eq(organizations.id, invite.orgId),
      })
      return { orgId: invite.orgId, orgSlug: org?.slug ?? '' }
    }),

  /**
   * invite.getActive — owner only
   * Lists pending (unused + non-expired) invites for the member management UI.
   */
  getActive: protectedProcedure
    .input(z.object({ orgId: z.string() }))
    .query(async ({ ctx, input }) => {
      // Verify caller is org owner
      const org = await ctx.db.query.organizations.findFirst({
        where: eq(organizations.id, input.orgId),
      })
      if (!org) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Organisation not found.' })
      }
      if (org.ownerId !== ctx.session!.user.id) {
        throw new TRPCError({ code: 'FORBIDDEN', message: 'Only the org owner can view invites.' })
      }

      const now = new Date()
      return ctx.db.query.orgInvites.findMany({
        where: and(
          eq(orgInvites.orgId, input.orgId),
          isNull(orgInvites.usedAt),
          gt(orgInvites.expiresAt, now),
        ),
        columns: {
          id: true,
          email: true,
          invitedBy: true,
          expiresAt: true,
          createdAt: true,
          // Omit token from response for security
        },
      })
    }),

  /**
   * invite.revoke — owner only
   * Marks an invite as used so it can no longer be accepted.
   * The owner must belong to the same org as the invite.
   */
  revoke: ownerProcedure
    .input(z.object({ orgId: z.string(), inviteId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const invite = await ctx.db.query.orgInvites.findFirst({
        where: and(eq(orgInvites.id, input.inviteId), eq(orgInvites.orgId, input.orgId)),
      })
      if (!invite) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Invite not found.' })
      }
      if (invite.usedAt !== null) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'Invite has already been used or revoked.' })
      }

      await ctx.db
        .update(orgInvites)
        .set({ usedAt: new Date() })
        .where(eq(orgInvites.id, input.inviteId))

      return { success: true }
    }),
})
