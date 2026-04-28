import type { Hono } from 'hono'
import { db } from '@kodi/db'
import { getAuth } from '../context'
import {
  createDesktopAuthCode,
  exchangeDesktopAuthCode,
  refreshDesktopTokenPair,
  revokeDesktopRefreshToken,
} from '../lib/desktop/auth'

function jsonString(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim() : null
}

export function registerDesktopAuthRoutes(app: Hono) {
  app.post('/desktop/auth/callback-code', async (c) => {
    const auth = getAuth()
    const session = await auth.api.getSession({ headers: c.req.raw.headers })
    if (!session?.user?.id) {
      return c.json({ error: 'Unauthorized' }, 401)
    }

    const body = await c.req.json().catch(() => null)
    const orgId = jsonString(body?.orgId)
    const deviceId = jsonString(body?.deviceId)
    const redirectUri = jsonString(body?.redirectUri)

    if (
      !orgId ||
      !deviceId ||
      !redirectUri?.startsWith('kodi://auth-callback')
    ) {
      return c.json({ error: 'Invalid desktop auth request.' }, 400)
    }

    const membership = await db.query.orgMembers.findFirst({
      where: (fields, { and, eq }) =>
        and(eq(fields.orgId, orgId), eq(fields.userId, session.user.id)),
    })
    if (!membership) {
      return c.json({ error: 'Not a member of this org.' }, 403)
    }

    const { code } = await createDesktopAuthCode({
      orgId,
      userId: session.user.id,
      deviceId,
      redirectUri,
    })
    const redirectTo = new URL(redirectUri)
    redirectTo.searchParams.set('code', code)
    redirectTo.searchParams.set('deviceId', deviceId)
    redirectTo.searchParams.set('orgId', orgId)

    return c.json({ redirectTo: redirectTo.toString() })
  })

  app.post('/desktop/auth/exchange', async (c) => {
    const body = await c.req.json().catch(() => null)
    const code = jsonString(body?.code)
    const deviceId = jsonString(body?.deviceId)
    if (!code || !deviceId) {
      return c.json({ error: 'Missing code or device id.' }, 400)
    }

    const tokens = await exchangeDesktopAuthCode({ code, deviceId })
    return c.json(tokens)
  })

  app.post('/desktop/auth/refresh', async (c) => {
    const body = await c.req.json().catch(() => null)
    const refreshToken = jsonString(body?.refreshToken)
    if (!refreshToken) return c.json({ error: 'Missing refresh token.' }, 400)
    const tokens = await refreshDesktopTokenPair(refreshToken)
    return c.json(tokens)
  })

  app.post('/desktop/auth/sign-out', async (c) => {
    const body = await c.req.json().catch(() => null)
    const refreshToken = jsonString(body?.refreshToken)
    if (refreshToken) await revokeDesktopRefreshToken(refreshToken)
    return c.json({ ok: true })
  })
}
