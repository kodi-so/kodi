import { env, requireRecall } from '../../../env'

const recallRequiredEnvKeys = ['RECALL_API_KEY'] as const

type RecallRequiredEnvKey = (typeof recallRequiredEnvKeys)[number]

function getMissingRecallKeys(): RecallRequiredEnvKey[] {
  return recallRequiredEnvKeys.filter((key) => !env[key])
}

export function resolveRecallApiBaseUrl() {
  if (env.RECALL_API_BASE_URL) return env.RECALL_API_BASE_URL
  return `https://${env.RECALL_API_REGION}.recall.ai`
}

export function getRecallSetupStatus() {
  const missing = getMissingRecallKeys()

  return {
    enabled: env.KODI_FEATURE_MEETING_INTELLIGENCE,
    configured: missing.length === 0,
    missing,
    region: env.RECALL_API_REGION,
    apiBaseUrl: resolveRecallApiBaseUrl(),
    realtimeWebhookUrl: env.RECALL_REALTIME_WEBHOOK_URL ?? null,
    hasRealtimeAuthToken: Boolean(env.RECALL_REALTIME_AUTH_TOKEN),
    hasRealtimeWebhookSecret: Boolean(env.RECALL_WEBHOOK_SECRET),
    hasBotStatusWebhookSecret: Boolean(env.RECALL_BOT_STATUS_WEBHOOK_SECRET),
    prerequisites: [
      'Create a Recall.ai API key for the target environment.',
      'Choose the Recall region and set RECALL_API_REGION or RECALL_API_BASE_URL.',
      'Configure a public realtime webhook URL for bot events if Kodi will ingest webhooks directly.',
      'Store the Recall webhook verification secrets used by your configured endpoints.',
    ],
  }
}

export function getRecallClientConfig() {
  const recall = requireRecall()

  return {
    apiKey: recall.RECALL_API_KEY,
    apiBaseUrl: recall.RECALL_API_BASE_URL ?? resolveRecallApiBaseUrl(),
    region: recall.RECALL_API_REGION,
    realtimeWebhookUrl: recall.RECALL_REALTIME_WEBHOOK_URL ?? null,
    realtimeAuthToken: recall.RECALL_REALTIME_AUTH_TOKEN ?? null,
    webhookSecret: recall.RECALL_WEBHOOK_SECRET ?? null,
    botStatusWebhookSecret: recall.RECALL_BOT_STATUS_WEBHOOK_SECRET ?? null,
  }
}

export function getRecallBotWebhookSecret() {
  const recall = requireRecall()
  return recall.RECALL_BOT_STATUS_WEBHOOK_SECRET ?? null
}
