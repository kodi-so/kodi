import { env } from '../env'

export const featureFlags = {
  meetingIntelligence: env.KODI_FEATURE_MEETING_INTELLIGENCE,
  toolAccess: env.KODI_FEATURE_TOOL_ACCESS,
} as const

export function getFeatureFlags() {
  return featureFlags
}
