import { contextBridge, ipcRenderer } from 'electron'
import {
  desktopConfigSchema,
  reminderPayloadSchema,
  type KodiDesktopBridge,
  type ReminderPayload,
} from '../shared/ipc.js'

const bridge: KodiDesktopBridge = {
  async config() {
    return desktopConfigSchema.parse(await ipcRenderer.invoke('desktop:config'))
  },
  auth: {
    getAccessToken: () => ipcRenderer.invoke('auth:get-access-token'),
    startSignIn: (input: { orgId: string }) =>
      ipcRenderer.invoke('auth:start-sign-in', input),
    exchangeCode: (input: { code: string; orgId: string }) =>
      ipcRenderer.invoke('auth:exchange-code', input),
    signOut: () => ipcRenderer.invoke('auth:sign-out'),
    onAuthCallback(callback: (url: string) => void) {
      const handler = (_event: Electron.IpcRendererEvent, url: string) => {
        callback(url)
      }
      ipcRenderer.on('auth:callback', handler)
      return () => ipcRenderer.off('auth:callback', handler)
    },
  },
  meetings: {
    openExternalMeeting: (url: string) =>
      ipcRenderer.invoke('meetings:open-external', url),
    focusMeeting: (meetingSessionId: string) =>
      ipcRenderer.invoke('meetings:focus', meetingSessionId),
    moveAside: () => ipcRenderer.invoke('window:move-aside'),
    showReminder: (payload: ReminderPayload) =>
      ipcRenderer.invoke('reminder:show', reminderPayloadSchema.parse(payload)),
    onStartLocal(callback: (mode: 'solo' | 'room') => void) {
      const handler = (
        _event: Electron.IpcRendererEvent,
        mode: 'solo' | 'room'
      ) => {
        callback(mode)
      }
      ipcRenderer.on('meetings:start-local', handler)
      return () => ipcRenderer.off('meetings:start-local', handler)
    },
    onOpenMeeting(callback: (meetingSessionId: string) => void) {
      const handler = (
        _event: Electron.IpcRendererEvent,
        meetingSessionId: string
      ) => {
        callback(meetingSessionId)
      }
      ipcRenderer.on('meetings:open', handler)
      return () => ipcRenderer.off('meetings:open', handler)
    },
  },
  settings: {
    setLaunchAtLogin: (enabled: boolean) =>
      ipcRenderer.invoke('settings:launch-at-login', enabled),
    checkForUpdates: () => ipcRenderer.invoke('settings:check-for-updates'),
  },
}

contextBridge.exposeInMainWorld('kodiDesktop', bridge)
