import { createHash, randomBytes } from 'crypto'
import { db, desktopAuthCodes, desktopSessions, eq } from '@kodi/db'
import { TRPCError } from '@trpc/server'

const ACCESS_TOKEN_TTL_MS = 15 * 60 * 1000
const REFRESH_TOKEN_TTL_MS = 30 * 24 * 60 * 60 * 1000
const AUTH_CODE_TTL_MS = 5 * 60 * 1000

export type DesktopTokenSession = {
  user: { id: string; email: string; name: string; image?: string | null }
  session: { id: string; userId: string }
}

export function hashDesktopSecret(secret: string) {
  return createHash('sha256').update(secret).digest('hex')
}

function token(prefix: string) {
  return `${prefix}_${randomBytes(32).toString('base64url')}`
}

export async function createDesktopAuthCode(input: {
  orgId: string
  userId: string
  deviceId: string
  redirectUri: string
}) {
  const code = token('kodi_desktop_code')
  const [row] = await db
    .insert(desktopAuthCodes)
    .values({
      orgId: input.orgId,
      userId: input.userId,
      deviceId: input.deviceId,
      redirectUri: input.redirectUri,
      codeHash: hashDesktopSecret(code),
      expiresAt: new Date(Date.now() + AUTH_CODE_TTL_MS),
    })
    .returning()

  if (!row) throw new Error('Failed to create desktop auth code.')
  return { code, row }
}

export async function exchangeDesktopAuthCode(input: {
  code: string
  deviceId: string
}) {
  const now = new Date()
  const codeHash = hashDesktopSecret(input.code)
  const authCode = await db.query.desktopAuthCodes.findFirst({
    where: (fields, { and, eq, gt, isNull }) =>
      and(
        eq(fields.codeHash, codeHash),
        eq(fields.deviceId, input.deviceId),
        gt(fields.expiresAt, now),
        isNull(fields.consumedAt)
      ),
  })

  if (!authCode) {
    throw new TRPCError({
      code: 'UNAUTHORIZED',
      message: 'Desktop authorization code is invalid or expired.',
    })
  }

  await db
    .update(desktopAuthCodes)
    .set({ consumedAt: now })
    .where(eq(desktopAuthCodes.id, authCode.id))

  return createDesktopTokenPair({
    orgId: authCode.orgId,
    userId: authCode.userId,
    deviceId: authCode.deviceId,
  })
}

export async function createDesktopTokenPair(input: {
  orgId: string
  userId: string
  deviceId: string
}) {
  const accessToken = token('kodi_access')
  const refreshToken = token('kodi_refresh')
  const now = new Date()
  const [session] = await db
    .insert(desktopSessions)
    .values({
      orgId: input.orgId,
      userId: input.userId,
      deviceId: input.deviceId,
      accessTokenHash: hashDesktopSecret(accessToken),
      refreshTokenHash: hashDesktopSecret(refreshToken),
      accessTokenExpiresAt: new Date(now.getTime() + ACCESS_TOKEN_TTL_MS),
      refreshTokenExpiresAt: new Date(now.getTime() + REFRESH_TOKEN_TTL_MS),
      lastUsedAt: now,
    })
    .returning()

  if (!session) throw new Error('Failed to create desktop session.')

  return {
    accessToken,
    refreshToken,
    accessTokenExpiresAt: session.accessTokenExpiresAt,
    refreshTokenExpiresAt: session.refreshTokenExpiresAt,
  }
}

export async function refreshDesktopTokenPair(refreshToken: string) {
  const now = new Date()
  const refreshTokenHash = hashDesktopSecret(refreshToken)
  const session = await db.query.desktopSessions.findFirst({
    where: (fields, { and, eq, gt, isNull }) =>
      and(
        eq(fields.refreshTokenHash, refreshTokenHash),
        gt(fields.refreshTokenExpiresAt, now),
        isNull(fields.revokedAt)
      ),
  })

  if (!session) {
    throw new TRPCError({
      code: 'UNAUTHORIZED',
      message: 'Desktop refresh token is invalid or expired.',
    })
  }

  await db
    .update(desktopSessions)
    .set({ revokedAt: now, updatedAt: now })
    .where(eq(desktopSessions.id, session.id))

  return createDesktopTokenPair({
    orgId: session.orgId,
    userId: session.userId,
    deviceId: session.deviceId,
  })
}

export async function revokeDesktopRefreshToken(refreshToken: string) {
  await db
    .update(desktopSessions)
    .set({ revokedAt: new Date(), updatedAt: new Date() })
    .where(
      eq(desktopSessions.refreshTokenHash, hashDesktopSecret(refreshToken))
    )
}

export async function resolveDesktopBearerSession(
  authorizationHeader: string | null
): Promise<DesktopTokenSession | null> {
  if (!authorizationHeader?.startsWith('Bearer ')) return null
  const accessToken = authorizationHeader.slice('Bearer '.length).trim()
  if (!accessToken.startsWith('kodi_access_')) return null

  const now = new Date()
  const desktopSession = await db.query.desktopSessions.findFirst({
    where: (fields, { and, eq, gt, isNull }) =>
      and(
        eq(fields.accessTokenHash, hashDesktopSecret(accessToken)),
        gt(fields.accessTokenExpiresAt, now),
        isNull(fields.revokedAt)
      ),
  })

  if (!desktopSession) return null

  const desktopUser = await db.query.user.findFirst({
    where: (fields, { eq }) => eq(fields.id, desktopSession.userId),
  })
  if (!desktopUser) return null

  await db
    .update(desktopSessions)
    .set({ lastUsedAt: now, updatedAt: now })
    .where(eq(desktopSessions.id, desktopSession.id))

  return {
    user: {
      id: desktopUser.id,
      email: desktopUser.email,
      name: desktopUser.name,
      image: desktopUser.image,
    },
    session: {
      id: desktopSession.id,
      userId: desktopUser.id,
    },
  }
}

export async function assertDesktopUserOrg(input: {
  orgId: string
  userId: string
}) {
  const org = await db.query.organizations.findFirst({
    where: (fields, { eq }) => eq(fields.id, input.orgId),
  })
  if (!org)
    throw new TRPCError({ code: 'NOT_FOUND', message: 'Org not found.' })
  return org
}
