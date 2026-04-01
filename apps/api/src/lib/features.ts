import { env } from '../env'

export const featureFlags = {
  zoomCopilot: env.KODI_FEATURE_ZOOM_COPILOT,
  toolAccess: env.KODI_FEATURE_TOOL_ACCESS,
} as const

export function getFeatureFlags() {
  return featureFlags
}
