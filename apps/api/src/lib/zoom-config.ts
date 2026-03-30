import { env } from '../env'

const zoomRequiredEnvKeys = [
  'ZOOM_CLIENT_ID',
  'ZOOM_CLIENT_SECRET',
  'ZOOM_WEBHOOK_SECRET',
  'ZOOM_REDIRECT_URI',
  'ZOOM_APP_ID',
] as const

type ZoomRequiredEnvKey = (typeof zoomRequiredEnvKeys)[number]

function getMissingZoomKeys(): ZoomRequiredEnvKey[] {
  return zoomRequiredEnvKeys.filter((key) => !env[key])
}

export function getZoomSetupStatus() {
  const missing = getMissingZoomKeys()

  return {
    enabled: env.KODI_FEATURE_ZOOM_COPILOT,
    configured: missing.length === 0,
    missing,
    appId: env.ZOOM_APP_ID ?? null,
    accountId: env.ZOOM_ACCOUNT_ID ?? null,
    redirectUri: env.ZOOM_REDIRECT_URI ?? null,
    prerequisites: [
      'Create a Zoom app with OAuth enabled.',
      'Configure the OAuth redirect URI to match ZOOM_REDIRECT_URI.',
      'Configure webhook delivery and store the secret in ZOOM_WEBHOOK_SECRET.',
      'Enable RTMS-related meeting events for the Kodi Zoom integration.',
    ],
  }
}
