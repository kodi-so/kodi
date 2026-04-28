import {
  app,
  BrowserWindow,
  ipcMain,
  Menu,
  nativeImage,
  shell,
  Tray,
  screen,
} from 'electron'
import { autoUpdater } from 'electron-updater'
import log from 'electron-log'
import keytar from 'keytar'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { randomUUID } from 'node:crypto'
import { desktopConfigSchema, reminderPayloadSchema } from '../shared/ipc.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const isDev = !app.isPackaged
const SERVICE_NAME = 'Kodi Desktop'
const ACCESS_ACCOUNT = 'access-token'
const REFRESH_ACCOUNT = 'refresh-token'
const DEVICE_ACCOUNT = 'device-id'

const config = desktopConfigSchema.parse({
  apiBaseUrl: process.env.KODI_API_URL ?? 'http://localhost:3002',
  appBaseUrl: process.env.KODI_APP_URL ?? 'http://localhost:3001',
  platform:
    process.platform === 'darwin' ||
    process.platform === 'win32' ||
    process.platform === 'linux'
      ? process.platform
      : 'unknown',
  appVersion: app.getVersion(),
  deviceId: await getOrCreateDeviceId(),
})

let mainWindow: BrowserWindow | null = null
let reminderWindow: BrowserWindow | null = null
let tray: Tray | null = null
let isQuitting = false

autoUpdater.logger = log
log.transports.file.level = 'info'

async function getOrCreateDeviceId() {
  const existing = await keytar
    .getPassword(SERVICE_NAME, DEVICE_ACCOUNT)
    .catch(() => null)
  if (existing) return existing
  const id = `desktop_${randomUUID()}`
  await keytar
    .setPassword(SERVICE_NAME, DEVICE_ACCOUNT, id)
    .catch(() => undefined)
  return id
}

function rendererUrl(hash = '') {
  if (isDev) return `http://127.0.0.1:5173/${hash}`
  return `file://${path.join(__dirname, '../renderer/index.html')}${hash}`
}

function createMainWindow() {
  mainWindow = new BrowserWindow({
    width: 1080,
    height: 760,
    minWidth: 860,
    minHeight: 620,
    title: 'Kodi',
    show: false,
    backgroundColor: '#f7f4ee',
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.js'),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
      webSecurity: true,
    },
  })

  mainWindow.loadURL(rendererUrl())
  mainWindow.once('ready-to-show', () => mainWindow?.show())
  mainWindow.on('close', (event) => {
    if (!isQuitting) {
      event.preventDefault()
      mainWindow?.hide()
    }
  })
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('https://') || url.startsWith('http://')) {
      shell.openExternal(url)
    }
    return { action: 'deny' }
  })
  mainWindow.webContents.on('will-navigate', (event, url) => {
    if (!url.startsWith(rendererUrl().replace(/\/$/, ''))) {
      event.preventDefault()
    }
  })
}

function ensureMainWindow() {
  if (!mainWindow || mainWindow.isDestroyed()) createMainWindow()
  mainWindow?.show()
  mainWindow?.focus()
  return mainWindow
}

function createTray() {
  const icon = nativeImage.createEmpty()
  tray = new Tray(icon)
  tray.setToolTip('Kodi')
  tray.setContextMenu(
    Menu.buildFromTemplate([
      { label: 'Open Kodi', click: () => ensureMainWindow() },
      {
        label: 'Start solo thinking',
        click: () => {
          ensureMainWindow()?.webContents.send('meetings:start-local', 'solo')
        },
      },
      {
        label: 'Start in-person meeting',
        click: () => {
          ensureMainWindow()?.webContents.send('meetings:start-local', 'room')
        },
      },
      { type: 'separator' },
      {
        label: 'Check for updates',
        click: () =>
          autoUpdater.checkForUpdates().catch((error) => log.warn(error)),
      },
      {
        label: 'Quit Kodi',
        click: () => {
          isQuitting = true
          app.quit()
        },
      },
    ])
  )
}

function handleDeepLink(url: string) {
  ensureMainWindow()?.webContents.send('auth:callback', url)
}

function showReminder(payload: unknown) {
  const reminder = reminderPayloadSchema.parse(payload)
  if (reminderWindow && !reminderWindow.isDestroyed()) reminderWindow.close()

  const display = screen.getPrimaryDisplay().workArea
  reminderWindow = new BrowserWindow({
    width: 380,
    height: 236,
    x: Math.max(display.x, display.x + display.width - 404),
    y: display.y + 28,
    frame: false,
    resizable: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    title: 'Kodi meeting reminder',
    backgroundColor: '#f7f4ee',
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.js'),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
    },
  })

  const params = new URLSearchParams({
    calendarEventId: reminder.calendarEventId,
    title: reminder.title,
    startsAt: reminder.startsAt,
    joinUrl: reminder.joinUrl ?? '',
    meetingSessionId: reminder.meetingSessionId ?? '',
  })
  reminderWindow.loadURL(rendererUrl(`#/reminder?${params.toString()}`))
  reminderWindow.on('blur', () => reminderWindow?.hide())
}

async function exchangeCode(input: { code: string; orgId: string }) {
  const response = await fetch(`${config.apiBaseUrl}/desktop/auth/exchange`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ code: input.code, deviceId: config.deviceId }),
  })
  if (!response.ok) throw new Error(await response.text())
  const tokens = (await response.json()) as {
    accessToken: string
    refreshToken: string
  }
  await keytar.setPassword(SERVICE_NAME, ACCESS_ACCOUNT, tokens.accessToken)
  await keytar.setPassword(SERVICE_NAME, REFRESH_ACCOUNT, tokens.refreshToken)
}

async function refreshAccessToken() {
  const refreshToken = await keytar.getPassword(SERVICE_NAME, REFRESH_ACCOUNT)
  if (!refreshToken) return null
  const response = await fetch(`${config.apiBaseUrl}/desktop/auth/refresh`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ refreshToken }),
  })
  if (!response.ok) return null
  const tokens = (await response.json()) as {
    accessToken: string
    refreshToken: string
  }
  await keytar.setPassword(SERVICE_NAME, ACCESS_ACCOUNT, tokens.accessToken)
  await keytar.setPassword(SERVICE_NAME, REFRESH_ACCOUNT, tokens.refreshToken)
  return tokens.accessToken
}

ipcMain.handle('desktop:config', () => config)
ipcMain.handle('auth:get-access-token', async () => {
  return (
    (await keytar
      .getPassword(SERVICE_NAME, ACCESS_ACCOUNT)
      .catch(() => null)) ?? (await refreshAccessToken())
  )
})
ipcMain.handle(
  'auth:start-sign-in',
  async (_event, input: { orgId: string }) => {
    const redirectUri = encodeURIComponent('kodi://auth-callback')
    const url = `${config.appBaseUrl}/desktop-auth?orgId=${encodeURIComponent(
      input.orgId
    )}&deviceId=${encodeURIComponent(config.deviceId)}&redirectUri=${redirectUri}`
    await shell.openExternal(url)
  }
)
ipcMain.handle(
  'auth:exchange-code',
  async (_event, input: { code: string; orgId: string }) => {
    await exchangeCode(input)
  }
)
ipcMain.handle('auth:sign-out', async () => {
  const refreshToken = await keytar
    .getPassword(SERVICE_NAME, REFRESH_ACCOUNT)
    .catch(() => null)
  if (refreshToken) {
    await fetch(`${config.apiBaseUrl}/desktop/auth/sign-out`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ refreshToken }),
    }).catch(() => undefined)
  }
  await keytar
    .deletePassword(SERVICE_NAME, ACCESS_ACCOUNT)
    .catch(() => undefined)
  await keytar
    .deletePassword(SERVICE_NAME, REFRESH_ACCOUNT)
    .catch(() => undefined)
})
ipcMain.handle('meetings:open-external', async (_event, url: string) => {
  const parsed = new URL(url)
  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
    throw new Error('Unsupported meeting URL.')
  }
  await shell.openExternal(url)
})
ipcMain.handle('meetings:focus', (_event, meetingSessionId: string) => {
  ensureMainWindow()?.webContents.send('meetings:open', meetingSessionId)
  reminderWindow?.hide()
})
ipcMain.handle('window:move-aside', () => {
  const win = ensureMainWindow()
  if (!win) return
  const area = screen.getPrimaryDisplay().workArea
  const width = Math.min(520, Math.floor(area.width * 0.34))
  win.setBounds({
    width,
    height: area.height,
    x: area.x + area.width - width,
    y: area.y,
  })
})
ipcMain.handle('reminder:show', (_event, payload) => showReminder(payload))
ipcMain.handle('settings:launch-at-login', (_event, enabled: boolean) => {
  app.setLoginItemSettings({
    openAtLogin: enabled,
    openAsHidden: true,
  })
  return app.getLoginItemSettings().openAtLogin
})
ipcMain.handle('settings:check-for-updates', async () => {
  if (isDev) return { status: 'disabled-in-development' }
  await autoUpdater.checkForUpdates()
  return { status: 'checking' }
})

const lock = app.requestSingleInstanceLock()
if (!lock) {
  app.quit()
} else {
  app.on('second-instance', (_event, argv) => {
    ensureMainWindow()
    const link = argv.find((arg) => arg.startsWith('kodi://'))
    if (link) handleDeepLink(link)
  })

  app.whenReady().then(() => {
    app.setAsDefaultProtocolClient('kodi')
    createMainWindow()
    createTray()
  })
}

app.on('open-url', (event, url) => {
  event.preventDefault()
  handleDeepLink(url)
})

app.on('activate', () => ensureMainWindow())
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
