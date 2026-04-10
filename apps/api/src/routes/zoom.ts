import type { Hono } from 'hono'
import { db, encrypt, eq, providerInstallations } from '@kodi/db'
import {
  appendMeetingEvent,
  appendTranscriptSegments,
  notifyZoomGatewayOfRtmsStop,
  notifyZoomGatewayOfRtmsStart,
  processZoomWebhookEvent,
  updateMeetingSessionRuntimeState,
  upsertMeetingParticipant,
} from '../lib/meetings/ingestion'
import { logActivity } from '../lib/activity'
import {
  buildPersistedZoomInstallationUpdate,
  computeZoomEndpointValidationToken,
  createZoomInstallUrl,
  exchangeZoomAuthorizationCode,
  fetchZoomProfile,
  fetchZoomZakToken,
  hasZoomZakScope,
  getZoomInstallationAccessToken,
  getZoomInstallationRefreshToken,
  refreshZoomAccessToken,
  resolveAppUrl,
  verifyZoomZakCallbackToken,
  verifyZoomOAuthState,
  verifyZoomWebhookSignature,
} from '../lib/zoom'
import { env } from '../env'

function resolveReturnPath(returnPath: string | null | undefined) {
  if (!returnPath || !returnPath.startsWith('/')) {
    return '/settings/integrations'
  }

  return returnPath
}

function redirectToAppPath(
  orgId: string,
  status: 'connected' | 'error',
  returnPath?: string | null
) {
  const url = new URL(`${resolveAppUrl()}${resolveReturnPath(returnPath)}`)
  url.searchParams.set('org', orgId)
  url.searchParams.set('zoom', status)
  return url.toString()
}

function isGatewayAuthorized(headerValue: string | null) {
  if (!env.ZOOM_GATEWAY_INTERNAL_TOKEN) return true
  return headerValue === `Bearer ${env.ZOOM_GATEWAY_INTERNAL_TOKEN}`
}

function isRtmsStartedEvent(eventName: unknown) {
  return (
    eventName === 'meeting.rtms_started' || eventName === 'meeting.rtms.started'
  )
}

function isRtmsStoppedEvent(eventName: unknown) {
  return (
    eventName === 'meeting.rtms_stopped' || eventName === 'meeting.rtms.stopped'
  )
}

async function getUsableZoomInstallationAccessToken(installationId: string) {
  const installation = await db.query.providerInstallations.findFirst({
    where: (fields, { and, eq }) =>
      and(eq(fields.id, installationId), eq(fields.provider, 'zoom')),
  })

  if (!installation || installation.status !== 'active') {
    return { installation: null, accessToken: null }
  }

  const currentAccessToken = getZoomInstallationAccessToken(installation)
  const expiresSoon =
    installation.tokenExpiresAt != null &&
    installation.tokenExpiresAt.getTime() - Date.now() <= 60_000

  if (!expiresSoon && currentAccessToken) {
    return { installation, accessToken: currentAccessToken }
  }

  const refreshToken = getZoomInstallationRefreshToken(installation)
  if (!refreshToken) {
    return { installation, accessToken: currentAccessToken }
  }

  const refreshed = await refreshZoomAccessToken(refreshToken)
  const nextScopes = refreshed.scope
    ? refreshed.scope.split(' ')
    : (installation.scopes ?? [])

  await db
    .update(providerInstallations)
    .set({
      status: 'active',
      accessTokenEncrypted: encrypt(refreshed.access_token),
      refreshTokenEncrypted: refreshed.refresh_token
        ? encrypt(refreshed.refresh_token)
        : installation.refreshTokenEncrypted,
      tokenExpiresAt: refreshed.expires_in
        ? new Date(Date.now() + refreshed.expires_in * 1000)
        : installation.tokenExpiresAt,
      scopes: nextScopes,
      errorMessage: null,
      updatedAt: new Date(),
    })
    .where(eq(providerInstallations.id as never, installation.id as never) as never)

  const updatedInstallation = await db.query.providerInstallations.findFirst({
    where: (fields, { eq }) => eq(fields.id, installation.id),
  })

  return {
    installation: updatedInstallation ?? installation,
    accessToken: refreshed.access_token,
  }
}

export function registerZoomRoutes(app: Hono) {
  app.get('/integrations/zoom/install', async (c) => {
    const orgId = c.req.query('orgId')
    const userId = c.req.query('userId')

    if (!orgId || !userId) {
      return c.json({ error: 'orgId and userId are required' }, 400)
    }

    return c.redirect(createZoomInstallUrl(orgId, userId))
  })

  app.get('/integrations/zoom/callback', async (c) => {
    const code = c.req.query('code')
    const state = c.req.query('state')
    const error = c.req.query('error')

    if (error || !code || !state) {
      const fallbackOrg = c.req.query('org') ?? ''
      return c.redirect(redirectToAppPath(fallbackOrg, 'error'))
    }

    const parsedState = verifyZoomOAuthState(state)
    if (!parsedState) {
      return c.redirect(
        `${resolveAppUrl()}${resolveReturnPath('/settings/integrations')}?zoom=error`
      )
    }

    try {
      const token = await exchangeZoomAuthorizationCode(code)
      const profile = await fetchZoomProfile(token.access_token)

      const existing = await db.query.providerInstallations.findFirst({
        where: (fields, { and, eq }) =>
          and(eq(fields.orgId, parsedState.orgId), eq(fields.provider, 'zoom')),
      })

      const values = buildPersistedZoomInstallationUpdate({
        orgId: parsedState.orgId,
        installerUserId: parsedState.userId,
        accessToken: token.access_token,
        refreshToken: token.refresh_token,
        expiresIn: token.expires_in,
        scopes: token.scope ? token.scope.split(' ') : [],
        accountId: profile.account_id,
        email: profile.email,
        zoomUserId: profile.id,
      })

      if (existing) {
        await db
          .update(providerInstallations)
          .set(values)
          .where(
            eq(providerInstallations.id as never, existing.id as never) as never
          )
      } else {
        await db.insert(providerInstallations).values({
          orgId: parsedState.orgId,
          provider: 'zoom',
          ...values,
        })
      }

      await logActivity(
        db,
        parsedState.orgId,
        'zoom.connected',
        {
          accountId: profile.account_id ?? null,
          email: profile.email ?? null,
        },
        parsedState.userId
      )

      return c.redirect(
        redirectToAppPath(
          parsedState.orgId,
          'connected',
          parsedState.returnPath
        )
      )
    } catch {
      return c.redirect(
        redirectToAppPath(parsedState.orgId, 'error', parsedState.returnPath)
      )
    }
  })

  app.get('/integrations/zoom/recall/zak', async (c) => {
    const token = c.req.query('token')
    if (!token) {
      return c.text('Missing token', 401)
    }

    const payload = verifyZoomZakCallbackToken(token)
    if (!payload) {
      return c.text('Invalid token', 401)
    }

    try {
      const { installation, accessToken } =
        await getUsableZoomInstallationAccessToken(payload.installationId)

      if (!installation || !accessToken) {
        return c.text('Zoom installation unavailable', 404)
      }

      if (!hasZoomZakScope(installation.scopes ?? [])) {
        return c.text('Zoom installation missing ZAK scope', 403)
      }

      const zakToken = await fetchZoomZakToken(accessToken)
      return c.text(zakToken)
    } catch (error) {
      console.error('[zoom] failed to generate Recall ZAK token', {
        installationId: payload.installationId,
        error: error instanceof Error ? error.message : String(error),
      })

      return c.text('Failed to generate ZAK token', 500)
    }
  })

  app.post('/webhooks/zoom', async (c) => {
    const rawBody = await c.req.text()
    const timestamp = c.req.header('x-zm-request-timestamp') ?? null
    const signature = c.req.header('x-zm-signature') ?? null

    try {
      if (
        env.ZOOM_WEBHOOK_SECRET &&
        !verifyZoomWebhookSignature(rawBody, timestamp, signature)
      ) {
        return c.json({ error: 'Invalid Zoom signature' }, 401)
      }
    } catch {
      return c.json({ error: 'Zoom webhook validation failed' }, 401)
    }

    const payload = JSON.parse(rawBody) as Record<string, unknown>
    if (payload.event === 'endpoint.url_validation') {
      const plainToken =
        typeof payload.payload === 'object' &&
        payload.payload &&
        typeof (payload.payload as Record<string, unknown>).plainToken ===
          'string'
          ? ((payload.payload as Record<string, unknown>).plainToken as string)
          : ''

      return c.json({
        plainToken,
        encryptedToken: computeZoomEndpointValidationToken(plainToken),
      })
    }

    const result = await processZoomWebhookEvent(payload as never)

    if (
      isRtmsStartedEvent(payload.event) &&
      'meetingSessionId' in result &&
      result.meetingSessionId &&
      'rtmsJoinPayload' in result &&
      result.rtmsJoinPayload
    ) {
      await notifyZoomGatewayOfRtmsStart({
        meetingSessionId: result.meetingSessionId,
        joinPayload: result.rtmsJoinPayload,
      })
    }

    if (
      (isRtmsStoppedEvent(payload.event) ||
        payload.event === 'meeting.ended') &&
      'meetingSessionId' in result &&
      result.meetingSessionId
    ) {
      await notifyZoomGatewayOfRtmsStop({
        meetingSessionId: result.meetingSessionId,
        reason: String(payload.event),
        finalStatus: payload.event === 'meeting.ended' ? 'ended' : 'failed',
      })
    }

    return c.json(result)
  })

  app.post('/internal/meetings/:meetingSessionId/participants', async (c) => {
    if (!isGatewayAuthorized(c.req.header('authorization') ?? null)) {
      return c.json({ error: 'Unauthorized' }, 401)
    }

    const meetingSessionId = c.req.param('meetingSessionId')
    const body = (await c.req.json()) as {
      participants?: Array<Record<string, unknown>>
    }
    const participants = body.participants ?? []

    const persisted = []
    for (const participant of participants) {
      persisted.push(
        await upsertMeetingParticipant(meetingSessionId, {
          providerParticipantId:
            participant.providerParticipantId != null
              ? String(participant.providerParticipantId)
              : null,
          displayName:
            typeof participant.displayName === 'string'
              ? participant.displayName
              : null,
          email:
            typeof participant.email === 'string' ? participant.email : null,
          isHost: participant.isHost === true,
          isInternal:
            typeof participant.isInternal === 'boolean'
              ? participant.isInternal
              : null,
          joinedAt:
            typeof participant.joinedAt === 'string'
              ? new Date(participant.joinedAt)
              : null,
          leftAt:
            typeof participant.leftAt === 'string'
              ? new Date(participant.leftAt)
              : null,
          metadata:
            participant.metadata &&
            typeof participant.metadata === 'object' &&
            !Array.isArray(participant.metadata)
              ? (participant.metadata as Record<string, unknown>)
              : null,
        })
      )
    }

    return c.json({ ok: true, count: persisted.length })
  })

  app.post('/internal/meetings/:meetingSessionId/transcript', async (c) => {
    if (!isGatewayAuthorized(c.req.header('authorization') ?? null)) {
      return c.json({ error: 'Unauthorized' }, 401)
    }

    const meetingSessionId = c.req.param('meetingSessionId')
    const body = (await c.req.json()) as {
      segments?: Array<Record<string, unknown>>
    }
    const persisted = await appendTranscriptSegments(
      meetingSessionId,
      (body.segments ?? []).flatMap((segment) =>
        typeof segment.content === 'string'
          ? [
              {
                providerParticipantId:
                  segment.providerParticipantId != null
                    ? String(segment.providerParticipantId)
                    : null,
                speakerName:
                  typeof segment.speakerName === 'string'
                    ? segment.speakerName
                    : null,
                content: segment.content,
                startOffsetMs:
                  typeof segment.startOffsetMs === 'number'
                    ? segment.startOffsetMs
                    : null,
                endOffsetMs:
                  typeof segment.endOffsetMs === 'number'
                    ? segment.endOffsetMs
                    : null,
                confidence:
                  typeof segment.confidence === 'number'
                    ? segment.confidence
                    : null,
                isPartial: segment.isPartial === true,
              },
            ]
          : []
      )
    )

    await appendMeetingEvent(
      meetingSessionId,
      'meeting.transcript.segment_received',
      'rtms',
      { count: persisted.length }
    )

    return c.json({ ok: true, count: persisted.length })
  })

  app.post('/internal/meetings/:meetingSessionId/events', async (c) => {
    if (!isGatewayAuthorized(c.req.header('authorization') ?? null)) {
      return c.json({ error: 'Unauthorized' }, 401)
    }

    const meetingSessionId = c.req.param('meetingSessionId')
    const body = (await c.req.json()) as {
      eventType?: string
      source?:
        | 'zoom_webhook'
        | 'recall_webhook'
        | 'rtms'
        | 'kodi_ui'
        | 'agent'
        | 'worker'
      payload?: Record<string, unknown>
    }

    await appendMeetingEvent(
      meetingSessionId,
      body.eventType ?? 'meeting.internal.event',
      body.source ?? 'worker',
      body.payload ?? null
    )

    return c.json({ ok: true })
  })

  app.post('/internal/meetings/:meetingSessionId/state', async (c) => {
    if (!isGatewayAuthorized(c.req.header('authorization') ?? null)) {
      return c.json({ error: 'Unauthorized' }, 401)
    }

    const meetingSessionId = c.req.param('meetingSessionId')
    const body = (await c.req.json()) as {
      status?:
        | 'scheduled'
        | 'preparing'
        | 'joining'
        | 'admitted'
        | 'listening'
        | 'processing'
        | 'ended'
        | 'failed'
      actualStartAt?: string | null
      endedAt?: string | null
      metadataPatch?: Record<string, unknown> | null
    }

    const updated = await updateMeetingSessionRuntimeState(meetingSessionId, {
      status: body.status,
      actualStartAt:
        typeof body.actualStartAt === 'string'
          ? new Date(body.actualStartAt)
          : body.actualStartAt === null
            ? null
            : undefined,
      endedAt:
        typeof body.endedAt === 'string'
          ? new Date(body.endedAt)
          : body.endedAt === null
            ? null
            : undefined,
      metadataPatch:
        body.metadataPatch &&
        typeof body.metadataPatch === 'object' &&
        !Array.isArray(body.metadataPatch)
          ? body.metadataPatch
          : undefined,
    })

    return c.json({
      ok: true,
      meetingSessionId,
      status: updated?.status ?? null,
    })
  })
}
