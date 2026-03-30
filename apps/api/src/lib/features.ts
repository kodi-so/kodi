import { env } from '../env'

export const featureFlags = {
  zoomCopilot: env.KODI_FEATURE_ZOOM_COPILOT,
} as const

export function getFeatureFlags() {
  return featureFlags
}
