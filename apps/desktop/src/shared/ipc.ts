import { z } from 'zod'

export const desktopConfigSchema = z.object({
  apiBaseUrl: z.string().url(),
  appBaseUrl: z.string().url(),
  platform: z.enum(['darwin', 'win32', 'linux', 'unknown']),
  appVersion: z.string(),
  deviceId: z.string(),
})

export const reminderPayloadSchema = z.object({
  calendarEventId: z.string(),
  title: z.string(),
  startsAt: z.string(),
  joinUrl: z.string().url().nullable(),
  meetingSessionId: z.string().nullable(),
})

export type DesktopConfig = z.infer<typeof desktopConfigSchema>
export type ReminderPayload = z.infer<typeof reminderPayloadSchema>

export type KodiDesktopBridge = {
  config: () => Promise<DesktopConfig>
  auth: {
    getAccessToken: () => Promise<string | null>
    startSignIn: (input: { orgId: string }) => Promise<void>
    exchangeCode: (input: { code: string; orgId: string }) => Promise<void>
    signOut: () => Promise<void>
    onAuthCallback: (callback: (url: string) => void) => () => void
  }
  meetings: {
    openExternalMeeting: (url: string) => Promise<void>
    focusMeeting: (meetingSessionId: string) => Promise<void>
    moveAside: () => Promise<void>
    showReminder: (payload: ReminderPayload) => Promise<void>
    onStartLocal: (callback: (mode: 'solo' | 'room') => void) => () => void
    onOpenMeeting: (callback: (meetingSessionId: string) => void) => () => void
  }
  settings: {
    setLaunchAtLogin: (enabled: boolean) => Promise<boolean>
    checkForUpdates: () => Promise<{ status: string }>
  }
}
