import { createHmac, timingSafeEqual } from 'crypto'
import { decrypt, encrypt, type ProviderInstallation } from '@kodi/db'
import { env, requireZoom } from '../env'

type ZoomOAuthStatePayload = {
  orgId: string
  userId: string
  returnPath?: string
  createdAt: number
}

type ZoomTokenResponse = {
  access_token: string
  refresh_token?: string
  expires_in?: number
  scope?: string
}

type ZoomProfileResponse = {
  id?: string
  account_id?: string
  email?: string
  first_name?: string
  last_name?: string
}

function getStateSecret() {
  return env.BETTER_AUTH_SECRET
}

function hmacHex(value: string, secret: string) {
  return createHmac('sha256', secret).update(value).digest('hex')
}

export function resolveAppUrl() {
  return env.APP_URL ?? env.BETTER_AUTH_URL
}

export function createZoomInstallUrl(
  orgId: string,
  userId: string,
  returnPath = '/settings/integrations'
) {
  const { ZOOM_CLIENT_ID, ZOOM_REDIRECT_URI } = requireZoom()

  const payload: ZoomOAuthStatePayload = {
    orgId,
    userId,
    returnPath,
    createdAt: Date.now(),
  }

  const encodedPayload = Buffer.from(JSON.stringify(payload)).toString(
    'base64url'
  )
  const signature = hmacHex(encodedPayload, getStateSecret())
  const state = `${encodedPayload}.${signature}`

  const url = new URL('https://zoom.us/oauth/authorize')
  url.searchParams.set('response_type', 'code')
  url.searchParams.set('client_id', ZOOM_CLIENT_ID)
  url.searchParams.set('redirect_uri', ZOOM_REDIRECT_URI)
  url.searchParams.set('state', state)

  return url.toString()
}

export function verifyZoomOAuthState(
  state: string
): ZoomOAuthStatePayload | null {
  const [payload, signature] = state.split('.')
  if (!payload || !signature) return null

  const expected = hmacHex(payload, getStateSecret())
  const actualBuffer = Buffer.from(signature)
  const expectedBuffer = Buffer.from(expected)

  if (
    actualBuffer.length !== expectedBuffer.length ||
    !timingSafeEqual(actualBuffer, expectedBuffer)
  ) {
    return null
  }

  try {
    const parsed = JSON.parse(
      Buffer.from(payload, 'base64url').toString('utf8')
    ) as ZoomOAuthStatePayload

    const ageMs = Date.now() - parsed.createdAt
    if (ageMs > 1000 * 60 * 15) return null

    return parsed
  } catch {
    return null
  }
}

export async function exchangeZoomAuthorizationCode(code: string) {
  const { ZOOM_CLIENT_ID, ZOOM_CLIENT_SECRET, ZOOM_REDIRECT_URI } =
    requireZoom()

  const url = new URL('https://zoom.us/oauth/token')
  url.searchParams.set('grant_type', 'authorization_code')
  url.searchParams.set('code', code)
  url.searchParams.set('redirect_uri', ZOOM_REDIRECT_URI)

  const authHeader = Buffer.from(
    `${ZOOM_CLIENT_ID}:${ZOOM_CLIENT_SECRET}`
  ).toString('base64')

  const res = await fetch(url.toString(), {
    method: 'POST',
    headers: {
      Authorization: `Basic ${authHeader}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
  })

  if (!res.ok) {
    const body = await res.text().catch(() => '')
    throw new Error(`Zoom token exchange failed (${res.status}): ${body}`)
  }

  return (await res.json()) as ZoomTokenResponse
}

export async function fetchZoomProfile(accessToken: string) {
  const res = await fetch('https://api.zoom.us/v2/users/me', {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  })

  if (!res.ok) {
    const body = await res.text().catch(() => '')
    throw new Error(`Zoom profile fetch failed (${res.status}): ${body}`)
  }

  return (await res.json()) as ZoomProfileResponse
}

export function computeZoomEndpointValidationToken(plainToken: string) {
  return hmacHex(plainToken, requireZoom().ZOOM_WEBHOOK_SECRET)
}

export function verifyZoomWebhookSignature(
  rawBody: string,
  timestamp: string | null,
  signature: string | null
) {
  const secret = requireZoom().ZOOM_WEBHOOK_SECRET
  if (!timestamp || !signature) return false

  const signedPayload = `v0:${timestamp}:${rawBody}`
  const expected = `v0=${hmacHex(signedPayload, secret)}`
  const actualBuffer = Buffer.from(signature)
  const expectedBuffer = Buffer.from(expected)

  return (
    actualBuffer.length === expectedBuffer.length &&
    timingSafeEqual(actualBuffer, expectedBuffer)
  )
}

type PersistedZoomInstallationInput = {
  orgId: string
  installerUserId: string
  accessToken: string
  refreshToken?: string
  expiresIn?: number
  scopes?: string[]
  accountId?: string
  email?: string
  zoomUserId?: string
}

export function getZoomInstallationAccessToken(
  installation: Pick<ProviderInstallation, 'accessTokenEncrypted'>
) {
  if (!installation.accessTokenEncrypted) return null
  return decrypt(installation.accessTokenEncrypted)
}

export function buildPersistedZoomInstallationUpdate(
  input: PersistedZoomInstallationInput
) {
  return {
    installerUserId: input.installerUserId,
    externalAccountId: input.accountId ?? null,
    externalAccountEmail: input.email ?? null,
    status: 'active' as const,
    accessTokenEncrypted: encrypt(input.accessToken),
    refreshTokenEncrypted: input.refreshToken
      ? encrypt(input.refreshToken)
      : null,
    tokenExpiresAt: input.expiresIn
      ? new Date(Date.now() + input.expiresIn * 1000)
      : null,
    scopes: input.scopes ?? [],
    metadata: input.zoomUserId ? { zoomUserId: input.zoomUserId } : null,
    errorMessage: null,
    updatedAt: new Date(),
  }
}
