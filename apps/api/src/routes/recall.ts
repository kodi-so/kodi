import type { Hono } from 'hono'
import { MeetingOrchestrationService } from '../lib/meetings/orchestration-service'
import { createDefaultMeetingProviderGateway } from '../lib/meetings/provider-runtime'
import { env } from '../env'
import { RecallMeetingJoinError } from '../lib/providers/recall/client'

function isRecallRouteAuthorized(headerValue: string | null) {
  const token = env.MEETING_INTERNAL_TOKEN ?? env.RECALL_REALTIME_AUTH_TOKEN
  if (!token) return true
  return headerValue === `Bearer ${token}`
}

function isRecallRealtimeWebhookAuthorized(url: URL) {
  if (!env.RECALL_REALTIME_AUTH_TOKEN) return true
  return url.searchParams.get('token') === env.RECALL_REALTIME_AUTH_TOKEN
}

export function registerRecallRoutes(app: Hono) {
  app.post('/webhooks/recall/realtime', async (c) => {
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
    if (!orgId) {
      return c.json({ ok: true, ignored: 'missing-org-id' })
    }

    const orchestration = new MeetingOrchestrationService(
      createDefaultMeetingProviderGateway()
    )

    const result = await orchestration.ingestProviderEnvelope({
      orgId,
      provider: 'google_meet',
      envelope: {
        provider: 'google_meet',
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
  })

  app.post('/webhooks/recall/bot', async (c) => {
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
    if (!orgId) {
      return c.json({ ok: true, ignored: 'missing-org-id' })
    }

    const orchestration = new MeetingOrchestrationService(
      createDefaultMeetingProviderGateway()
    )

    const result = await orchestration.ingestProviderEnvelope({
      orgId,
      provider: 'google_meet',
      envelope: {
        provider: 'google_meet',
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
  })

  app.post('/internal/meetings/recall/join', async (c) => {
    if (!isRecallRouteAuthorized(c.req.header('authorization') ?? null)) {
      return c.json({ error: 'Unauthorized' }, 401)
    }

    const body = (await c.req.json()) as {
      orgId?: string
      hostUserId?: string | null
      meetingUrl?: string
      title?: string | null
      botName?: string | null
      metadata?: Record<string, unknown> | null
    }

    if (!body.orgId || !body.meetingUrl) {
      return c.json({ error: 'orgId and meetingUrl are required' }, 400)
    }

    const orchestration = new MeetingOrchestrationService(
      createDefaultMeetingProviderGateway()
    )

    try {
      const result = await orchestration.requestBotJoin({
        orgId: body.orgId,
        provider: 'google_meet',
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
        return c.json(
          {
            error: error.message,
            failure: error.failure,
          },
          502
        )
      }

      throw error
    }
  })
}
