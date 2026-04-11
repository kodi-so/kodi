import type { Context, Hono } from 'hono'
import { MeetingOrchestrationService } from '../lib/meetings/orchestration-service'
import { createDefaultMeetingProviderGateway } from '../lib/meetings/provider-runtime'
import { env } from '../env'
import { RecallMeetingJoinError } from '../lib/providers/recall/client'
import { getRecallBotWebhookSecret } from '../lib/providers/recall/config'
import { verifyRequestFromRecall } from '../lib/providers/recall/verification'
import { inferMeetingProviderFromUrl } from '../lib/meetings/provider-url'
import type { MeetingProviderSlug } from '../lib/meetings/events'

function isRecallRouteAuthorized(headerValue: string | null) {
  const token = env.MEETING_INTERNAL_TOKEN ?? env.RECALL_REALTIME_AUTH_TOKEN
  if (!token) return true
  return headerValue === `Bearer ${token}`
}

function isRecallRealtimeWebhookAuthorized(url: URL) {
  if (!env.RECALL_REALTIME_AUTH_TOKEN) return true
  return url.searchParams.get('token') === env.RECALL_REALTIME_AUTH_TOKEN
}

function resolveRecallProvider(
  value: unknown
): MeetingProviderSlug | 'google_meet' {
  if (value === 'google_meet' || value === 'zoom') {
    return value
  }

  return 'google_meet'
}

export function registerRecallRoutes(app: Hono) {
  const handleRealtimeWebhook = async (c: Context) => {
    const url = new URL(c.req.url)
    if (!isRecallRealtimeWebhookAuthorized(url)) {
      return c.json({ error: 'Unauthorized' }, 401)
    }

    const payload = (await c.req.json()) as Record<string, unknown>
    const data =
      payload.data &&
      typeof payload.data === 'object' &&
      !Array.isArray(payload.data)
        ? (payload.data as Record<string, unknown>)
        : null
    const bot =
      data?.bot && typeof data.bot === 'object' && !Array.isArray(data.bot)
        ? (data.bot as Record<string, unknown>)
        : null
    const botMetadata =
      bot?.metadata &&
      typeof bot.metadata === 'object' &&
      !Array.isArray(bot.metadata)
        ? (bot.metadata as Record<string, unknown>)
        : null

    const orgId =
      typeof botMetadata?.orgId === 'string' ? botMetadata.orgId : null
    const provider = resolveRecallProvider(botMetadata?.provider)
    if (!orgId) {
      return c.json({ ok: true, ignored: 'missing-org-id' })
    }

    const orchestration = new MeetingOrchestrationService(
      createDefaultMeetingProviderGateway()
    )

    const result = await orchestration.ingestProviderEnvelope({
      orgId,
      provider,
      envelope: {
        provider,
        transport: 'webhook',
        receivedAt: new Date(),
        session: {
          internalMeetingSessionId:
            typeof botMetadata?.internalMeetingSessionId === 'string'
              ? botMetadata.internalMeetingSessionId
              : undefined,
          externalMeetingId:
            typeof botMetadata?.externalMeetingId === 'string'
              ? botMetadata.externalMeetingId
              : null,
          externalMeetingInstanceId:
            typeof botMetadata?.externalMeetingInstanceId === 'string'
              ? botMetadata.externalMeetingInstanceId
              : null,
          externalBotSessionId: typeof bot?.id === 'string' ? bot.id : null,
        },
        payload,
      },
      source: 'recall_webhook',
    })

    return c.json({
      ok: true,
      normalizedEvents: result.normalizedEvents.length,
      meetingSessionId: result.meetingSession?.id ?? null,
    })
  }

  const handleBotWebhook = async (c: Context) => {
    const rawBody = await c.req.text()
    const secret = getRecallBotWebhookSecret()

    if (secret) {
      try {
        verifyRequestFromRecall({
          secret,
          headers: {
            'webhook-id': c.req.header('webhook-id') ?? undefined,
            'webhook-timestamp': c.req.header('webhook-timestamp') ?? undefined,
            'webhook-signature': c.req.header('webhook-signature') ?? undefined,
            'svix-id': c.req.header('svix-id') ?? undefined,
            'svix-timestamp': c.req.header('svix-timestamp') ?? undefined,
            'svix-signature': c.req.header('svix-signature') ?? undefined,
          },
          payload: rawBody,
        })
      } catch (error) {
        console.error('[recall] bot webhook verification failed', {
          error: error instanceof Error ? error.message : 'Unknown verification error',
        })
        return c.json({ error: 'Unauthorized' }, 401)
      }
    }

    const payload = JSON.parse(rawBody) as Record<string, unknown>
    const data =
      payload.data &&
      typeof payload.data === 'object' &&
      !Array.isArray(payload.data)
        ? (payload.data as Record<string, unknown>)
        : null
    const bot =
      data?.bot && typeof data.bot === 'object' && !Array.isArray(data.bot)
        ? (data.bot as Record<string, unknown>)
        : null
    const botMetadata =
      bot?.metadata &&
      typeof bot.metadata === 'object' &&
      !Array.isArray(bot.metadata)
        ? (bot.metadata as Record<string, unknown>)
        : null

    const orgId =
      typeof botMetadata?.orgId === 'string' ? botMetadata.orgId : null
    const provider = resolveRecallProvider(botMetadata?.provider)
    if (!orgId) {
      console.warn('[recall] bot webhook missing org id', {
        event: payload.event,
        botId: typeof bot?.id === 'string' ? bot.id : null,
      })
      return c.json({ ok: true, ignored: 'missing-org-id' })
    }

    const orchestration = new MeetingOrchestrationService(
      createDefaultMeetingProviderGateway()
    )

    const result = await orchestration.ingestProviderEnvelope({
      orgId,
      provider,
      envelope: {
        provider,
        transport: 'webhook',
        receivedAt: new Date(),
        session: {
          internalMeetingSessionId:
            typeof botMetadata?.internalMeetingSessionId === 'string'
              ? botMetadata.internalMeetingSessionId
              : undefined,
          externalMeetingId:
            typeof botMetadata?.externalMeetingId === 'string'
              ? botMetadata.externalMeetingId
              : null,
          externalMeetingInstanceId:
            typeof botMetadata?.externalMeetingInstanceId === 'string'
              ? botMetadata.externalMeetingInstanceId
              : null,
          externalBotSessionId: typeof bot?.id === 'string' ? bot.id : null,
        },
        payload,
      },
      source: 'recall_webhook',
    })

    return c.json({
      ok: true,
      normalizedEvents: result.normalizedEvents.length,
      meetingSessionId: result.meetingSession?.id ?? null,
    })
  }

  app.post('/webhooks/recall/realtime', handleRealtimeWebhook)
  app.post('/webhooks/recall/realtime/', handleRealtimeWebhook)
  app.post('/webhooks/recall/bot', handleBotWebhook)
  app.post('/webhooks/recall/bot/', handleBotWebhook)

  app.post('/internal/meetings/recall/join', async (c) => {
    if (!isRecallRouteAuthorized(c.req.header('authorization') ?? null)) {
      return c.json({ error: 'Unauthorized' }, 401)
    }

    const body = (await c.req.json()) as {
      orgId?: string
      provider?: MeetingProviderSlug
      hostUserId?: string | null
      meetingUrl?: string
      title?: string | null
      botName?: string | null
      metadata?: Record<string, unknown> | null
    }

    if (!body.orgId || !body.meetingUrl) {
      return c.json({ error: 'orgId and meetingUrl are required' }, 400)
    }

    const provider =
      body.provider && (body.provider === 'google_meet' || body.provider === 'zoom')
        ? body.provider
        : inferMeetingProviderFromUrl(body.meetingUrl)

    if (!provider) {
      return c.json(
        {
          error: 'Only Google Meet and Zoom meeting links are supported right now.',
        },
        400
      )
    }

    const orchestration = new MeetingOrchestrationService(
      createDefaultMeetingProviderGateway()
    )

    try {
      const result = await orchestration.requestBotJoin({
        orgId: body.orgId,
        provider,
        hostUserId: body.hostUserId ?? null,
        meeting: {
          joinUrl: body.meetingUrl,
          title: body.title ?? null,
        },
        botIdentity: {
          displayName: body.botName ?? 'Kodi',
        },
        metadata:
          body.metadata &&
          typeof body.metadata === 'object' &&
          !Array.isArray(body.metadata)
            ? body.metadata
            : null,
      })

      return c.json({
        ok: true,
        meetingSessionId: result.meetingSession.id,
        providerBotSessionId: result.meetingSession.providerBotSessionId,
        providerMeetingId: result.meetingSession.providerMeetingId,
        status: result.meetingSession.status,
      })
    } catch (error) {
      if (error instanceof RecallMeetingJoinError) {
        console.error('[recall] internal join failed', {
          orgId: body.orgId,
          meetingUrl: body.meetingUrl,
          error: error.message,
          providerStatus: error.providerStatus ?? null,
          providerBody: error.providerBody ?? null,
          failure: error.failure,
          attempts: error.attempts,
        })
        return c.json(
          {
            error: error.message,
            providerStatus: error.providerStatus ?? null,
            providerBody: error.providerBody ?? null,
            failure: error.failure,
          },
          502
        )
      }

      console.error('[recall] internal join crashed', {
        orgId: body.orgId,
        meetingUrl: body.meetingUrl,
        error:
          error instanceof Error
            ? {
                name: error.name,
                message: error.message,
                stack: error.stack,
              }
            : error,
      })

      return c.json(
        {
          error: error instanceof Error ? error.message : 'Unexpected recall error',
        },
        500
      )
    }
  })
}
