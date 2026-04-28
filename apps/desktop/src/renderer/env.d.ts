import type { KodiDesktopBridge } from '../shared/ipc'

declare global {
  interface Window {
    kodiDesktop: KodiDesktopBridge
  }
}

export {}
