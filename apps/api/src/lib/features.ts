import { env } from '../env'

export const featureFlags = {
  meetingIntelligence: env.KODI_FEATURE_MEETING_INTELLIGENCE,
  toolAccess: env.KODI_FEATURE_TOOL_ACCESS,
  localMeetings: env.KODI_FEATURE_LOCAL_MEETINGS,
  desktopApp: env.KODI_FEATURE_DESKTOP_APP,
  taskBoard: env.KODI_FEATURE_TASK_BOARD,
} as const

export function getFeatureFlags() {
  return featureFlags
}
