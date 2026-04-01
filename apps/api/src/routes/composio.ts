import type { VerifyWebhookResult } from '@composio/core'
import type { Context, Hono } from 'hono'
import { db } from '@kodi/db'
import { env } from '../env'
import { logActivity } from '../lib/activity'
import { getComposioClient, syncWebhookConnectionUpdate } from '../lib/composio'

function getWebhookHeader(c: Context) {
  return {
    signature:
      c.req.header('webhook-signature') ??
      c.req.header('x-composio-signature') ??
      null,
    webhookId:
      c.req.header('webhook-id') ??
      c.req.header('x-composio-webhook-id') ??
      null,
    webhookTimestamp:
      c.req.header('webhook-timestamp') ??
      c.req.header('x-composio-webhook-timestamp') ??
      null,
  }
}

function getConnectionDataFromWebhook(rawPayload: unknown) {
  if (!rawPayload || typeof rawPayload !== 'object') return null

  const payload = rawPayload as Record<string, unknown>
  const data =
    payload.data &&
    typeof payload.data === 'object' &&
    !Array.isArray(payload.data)
      ? (payload.data as Record<string, unknown>)
      : null

  if (!data) return null
  if (typeof data.id !== 'string') return null
  if (!data.toolkit || typeof data.toolkit !== 'object') return null

  return data
}

function mapEventTypeToAction(type: string | null) {
  switch (type) {
    case 'composio.connected_account.expired':
      return 'tool_access.connection_expired'
    default:
      return 'tool_access.webhook_received'
  }
}

function resolveReturnPath(returnPath: string | null | undefined) {
  if (!returnPath || !returnPath.startsWith('/')) {
    return '/settings/integrations/tool-access'
  }

  return returnPath
}

function resolveAppUrl() {
  return env.APP_URL ?? env.BETTER_AUTH_URL
}

export function registerComposioRoutes(app: Hono) {
  app.get('/integrations/composio/callback', (c) => {
    const target = new URL(
      `${resolveAppUrl()}${resolveReturnPath(c.req.query('returnPath'))}`
    )

    const query = new URL(c.req.url).searchParams
    for (const [key, value] of query.entries()) {
      if (key === 'returnPath') continue
      target.searchParams.set(key, value)
    }

    return c.redirect(target.toString())
  })

  app.post('/integrations/composio/webhook', async (c) => {
    if (!env.COMPOSIO_WEBHOOK_SECRET) {
      return c.json({ error: 'Composio webhook secret is not configured' }, 503)
    }

    const headers = getWebhookHeader(c)
    if (!headers.signature || !headers.webhookId || !headers.webhookTimestamp) {
      return c.json({ error: 'Missing required Composio webhook headers' }, 400)
    }

    const rawBody = await c.req.text()
    let verified: VerifyWebhookResult

    try {
      verified = await getComposioClient().triggers.verifyWebhook({
        id: headers.webhookId,
        payload: rawBody,
        signature: headers.signature,
        timestamp: headers.webhookTimestamp,
        secret: env.COMPOSIO_WEBHOOK_SECRET,
      })
    } catch (error) {
      return c.json(
        {
          error:
            error instanceof Error
              ? error.message
              : 'Composio webhook verification failed',
        },
        401
      )
    }

    try {
      const rawPayload =
        verified.rawPayload && typeof verified.rawPayload === 'object'
          ? (verified.rawPayload as Record<string, unknown>)
          : null
      const eventType =
        rawPayload && typeof rawPayload.type === 'string'
          ? rawPayload.type
          : null
      const connectionData = getConnectionDataFromWebhook(rawPayload)

      const updatedConnections = connectionData
        ? await syncWebhookConnectionUpdate(db, connectionData)
        : []

      for (const connection of updatedConnections) {
        await logActivity(
          db,
          connection.orgId,
          mapEventTypeToAction(eventType),
          {
            toolkitSlug: connection.toolkitSlug,
            connectedAccountId: connection.connectedAccountId,
            status: connection.connectedAccountStatus,
            webhookType: eventType,
            webhookVersion: verified.version,
          },
          connection.userId
        )
      }

      return c.json({
        ok: true,
        eventType,
        version: verified.version,
        updatedCount: updatedConnections.length,
      })
    } catch (error) {
      return c.json(
        {
          error:
            error instanceof Error
              ? error.message
              : 'Failed to process verified Composio webhook',
        },
        500
      )
    }
  })
}
