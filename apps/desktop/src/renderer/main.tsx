import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { createRoot } from 'react-dom/client'
import {
  CalendarClock,
  CheckCircle2,
  DoorOpen,
  ExternalLink,
  Headphones,
  LogOut,
  Mic,
  MonitorUp,
  RefreshCw,
  Settings,
  Sparkles,
} from 'lucide-react'
import { createKodiDesktopTrpcClient } from '@kodi/desktop-shared/trpc'
import {
  formatMeetingDay,
  formatMeetingTime,
  suggestedActionLabel,
  type DesktopBootstrap,
  type DesktopUpcomingMeeting,
} from '@kodi/desktop-shared'
import { Button } from '@kodi/ui'
import type { DesktopConfig } from '../shared/ipc'
import './styles.css'

type View = 'home' | 'settings' | 'meeting'

function useDesktopConfig() {
  const [config, setConfig] = useState<DesktopConfig | null>(null)
  useEffect(() => {
    window.kodiDesktop.config().then(setConfig).catch(console.error)
  }, [])
  return config
}

function useAuthCallback(onAuthed: (orgId: string) => void) {
  useEffect(() => {
    return window.kodiDesktop.auth.onAuthCallback(async (url) => {
      const parsed = new URL(url)
      const code = parsed.searchParams.get('code')
      const orgId = parsed.searchParams.get('orgId')
      if (!code || !orgId) return
      await window.kodiDesktop.auth.exchangeCode({ code, orgId })
      localStorage.setItem('kodi.desktop.orgId', orgId)
      onAuthed(orgId)
    })
  }, [onAuthed])
}

function LoginScreen({
  config,
  onSignedIn,
}: {
  config: DesktopConfig
  onSignedIn: (orgId: string) => void
}) {
  const [orgId, setOrgId] = useState(
    localStorage.getItem('kodi.desktop.orgId') ?? ''
  )
  useAuthCallback(onSignedIn)

  return (
    <main className="login-screen">
      <section className="login-panel">
        <div className="brand-mark">K</div>
        <h1>Kodi Desktop</h1>
        <p>
          Sign in through your browser, then return here for meetings,
          reminders, and local capture.
        </p>
        <label>
          Workspace ID
          <input
            value={orgId}
            onChange={(event) => setOrgId(event.target.value)}
            placeholder="org_..."
          />
        </label>
        <Button
          disabled={!orgId.trim()}
          onClick={() => {
            localStorage.setItem('kodi.desktop.orgId', orgId.trim())
            window.kodiDesktop.auth.startSignIn({ orgId: orgId.trim() })
          }}
        >
          Open browser sign-in
        </Button>
        <span>{config.apiBaseUrl}</span>
      </section>
    </main>
  )
}

function MeetingRow({
  meeting,
  onLaunch,
}: {
  meeting: DesktopUpcomingMeeting
  onLaunch: (meeting: DesktopUpcomingMeeting) => void
}) {
  return (
    <article className="meeting-row">
      <time>
        <strong>{formatMeetingTime(meeting.startsAt)}</strong>
        <span>{formatMeetingDay(meeting.startsAt)}</span>
      </time>
      <div className="meeting-main">
        <h3>{meeting.title}</h3>
        <p>
          {meeting.conferenceProvider?.replace('_', ' ') ??
            'No supported call link'}
          {meeting.externalMeetingId ? ` · ${meeting.externalMeetingId}` : ''}
        </p>
      </div>
      <Button
        variant={meeting.isSupported ? 'default' : 'secondary'}
        onClick={() => onLaunch(meeting)}
      >
        {meeting.isSupported ? <ExternalLink size={15} /> : <Mic size={15} />}
        {suggestedActionLabel(meeting.suggestedAction)}
      </Button>
    </article>
  )
}

function Home({
  bootstrap,
  refresh,
  launchMeeting,
  startLocal,
  setView,
}: {
  bootstrap: DesktopBootstrap
  refresh: () => void
  launchMeeting: (meeting: DesktopUpcomingMeeting) => void
  startLocal: (
    mode: 'solo' | 'room',
    title?: string,
    calendarEventId?: string
  ) => void
  setView: (view: View) => void
}) {
  return (
    <main className="desktop-shell">
      <header className="topbar">
        <div>
          <span className="eyebrow">{bootstrap.org.name}</span>
          <h1>Coming up</h1>
        </div>
        <nav>
          <button onClick={refresh} aria-label="Refresh">
            <RefreshCw size={18} />
          </button>
          <button onClick={() => setView('settings')} aria-label="Settings">
            <Settings size={18} />
          </button>
        </nav>
      </header>

      <section className="focus-grid">
        <div className="coming-up">
          {bootstrap.activeLiveSession ? (
            <article className="live-strip">
              <CheckCircle2 size={18} />
              <div>
                <strong>{bootstrap.activeLiveSession.title}</strong>
                <span>Live now</span>
              </div>
              <Button
                onClick={() =>
                  window.kodiDesktop.meetings.focusMeeting(
                    bootstrap.activeLiveSession!.id
                  )
                }
              >
                Resume
              </Button>
            </article>
          ) : null}

          {bootstrap.upcomingMeetings.length ? (
            bootstrap.upcomingMeetings.map((meeting) => (
              <MeetingRow
                key={meeting.id}
                meeting={meeting}
                onLaunch={launchMeeting}
              />
            ))
          ) : (
            <div className="empty-state">
              <CalendarClock size={24} />
              <h2>No calendar meetings are queued.</h2>
              <p>
                Start a local session or check back after calendar sync runs.
              </p>
            </div>
          )}
        </div>

        <aside className="quick-panel">
          <div className="quick-actions">
            <Button onClick={() => startLocal('solo')}>
              <Headphones size={16} />
              Solo thinking
            </Button>
            <Button variant="secondary" onClick={() => startLocal('room')}>
              <Mic size={16} />
              In-person meeting
            </Button>
          </div>
          <div className="recent">
            <h2>Recent meetings</h2>
            {bootstrap.recentMeetings.slice(0, 6).map((meeting) => (
              <button
                key={meeting.id}
                onClick={() =>
                  window.kodiDesktop.meetings.focusMeeting(meeting.id)
                }
              >
                <span>{meeting.title}</span>
                <small>{meeting.status}</small>
              </button>
            ))}
          </div>
        </aside>
      </section>
    </main>
  )
}

function SettingsView({
  bootstrap,
  save,
  setView,
}: {
  bootstrap: DesktopBootstrap
  save: (patch: Partial<DesktopBootstrap['preferences']>) => void
  setView: (view: View) => void
}) {
  const p = bootstrap.preferences
  return (
    <main className="settings-shell">
      <header className="topbar">
        <div>
          <span className="eyebrow">Desktop settings</span>
          <h1>Controls</h1>
        </div>
        <Button variant="secondary" onClick={() => setView('home')}>
          Done
        </Button>
      </header>
      <section className="settings-list">
        <label>
          <span>
            <strong>Reminders</strong>
            <small>
              Show Kodi-owned meeting prompts before supported calls.
            </small>
          </span>
          <input
            type="checkbox"
            checked={p.remindersEnabled}
            onChange={(event) =>
              save({ remindersEnabled: event.target.checked })
            }
          />
        </label>
        <label>
          <span>
            <strong>Reminder lead time</strong>
            <small>Minutes before scheduled start.</small>
          </span>
          <input
            type="number"
            min={0}
            max={60}
            value={p.reminderLeadTimeMinutes}
            onChange={(event) =>
              save({ reminderLeadTimeMinutes: Number(event.target.value) })
            }
          />
        </label>
        <label>
          <span>
            <strong>Move aside during meetings</strong>
            <small>Kodi docks to the right after launch.</small>
          </span>
          <input
            type="checkbox"
            checked={p.moveAsideEnabled}
            onChange={(event) =>
              save({ moveAsideEnabled: event.target.checked })
            }
          />
        </label>
        <label>
          <span>
            <strong>Launch at login</strong>
            <small>Keep reminders available after restart.</small>
          </span>
          <input
            type="checkbox"
            checked={p.launchAtLogin}
            onChange={(event) => {
              save({ launchAtLogin: event.target.checked })
              window.kodiDesktop.settings.setLaunchAtLogin(event.target.checked)
            }}
          />
        </label>
        <button
          className="sign-out"
          onClick={() =>
            window.kodiDesktop.auth.signOut().then(() => location.reload())
          }
        >
          <LogOut size={16} />
          Sign out
        </button>
      </section>
    </main>
  )
}

function ReminderPopup() {
  const params = new URLSearchParams(location.hash.split('?')[1] ?? '')
  const meeting: DesktopUpcomingMeeting = {
    id: params.get('calendarEventId') ?? '',
    title: params.get('title') ?? 'Upcoming meeting',
    startsAt: params.get('startsAt') ?? new Date().toISOString(),
    endsAt: null,
    calendarProvider: 'google_calendar',
    joinUrl: params.get('joinUrl') || null,
    conferenceProvider: params.get('joinUrl') ? 'zoom' : null,
    externalMeetingId: null,
    responseStatus: 'unknown',
    isSupported: Boolean(params.get('joinUrl')),
    suggestedAction: params.get('joinUrl')
      ? 'join_with_kodi'
      : 'start_local_note',
    meetingSessionId: params.get('meetingSessionId') || null,
    duplicateGroupKey: null,
  }
  return (
    <main className="reminder">
      <span className="eyebrow">Kodi reminder</span>
      <h1>{meeting.title}</h1>
      <p>{formatMeetingTime(meeting.startsAt)} · ready when you are</p>
      <div>
        <Button
          onClick={() =>
            window.dispatchEvent(
              new CustomEvent('kodi-launch-reminder', { detail: meeting })
            )
          }
        >
          Join with Kodi
        </Button>
        <Button variant="secondary" onClick={() => window.close()}>
          Dismiss
        </Button>
      </div>
    </main>
  )
}

function App() {
  const config = useDesktopConfig()
  const [orgId, setOrgId] = useState(
    localStorage.getItem('kodi.desktop.orgId') ?? ''
  )
  const [bootstrap, setBootstrap] = useState<DesktopBootstrap | null>(null)
  const [view, setView] = useState<View>('home')

  const client = useMemo(() => {
    if (!config) return null
    return createKodiDesktopTrpcClient({
      apiBaseUrl: config.apiBaseUrl,
      getAccessToken: () => window.kodiDesktop.auth.getAccessToken(),
    })
  }, [config])

  const refresh = useCallback(async () => {
    if (!client || !config || !orgId) return
    const next = await client.desktop.getBootstrap.query({
      orgId,
      deviceId: config.deviceId,
      platform: config.platform,
    })
    setBootstrap(next)
  }, [client, config, orgId])

  useEffect(() => {
    refresh().catch(console.error)
  }, [refresh])

  useEffect(() => {
    if (!client || !config || !orgId) return
    client.desktop.registerDevice
      .mutate({
        orgId,
        deviceId: config.deviceId,
        platform: config.platform,
        appVersion: config.appVersion,
      })
      .catch(console.error)
  }, [client, config, orgId])

  const startLocal = useCallback(
    async (mode: 'solo' | 'room', title?: string, calendarEventId?: string) => {
      if (!client || !config || !orgId) return
      const result = await client.meeting.startLocalSession.mutate({
        orgId,
        mode,
        title,
        platform: config.platform,
        startedFrom: calendarEventId ? 'scheduled_event' : 'desktop_app',
        scheduledCalendarEventId: calendarEventId ?? null,
      })
      await window.kodiDesktop.meetings.focusMeeting(result.meetingSessionId)
      await refresh()
    },
    [client, config, orgId, refresh]
  )

  const launchMeeting = useCallback(
    async (meeting: DesktopUpcomingMeeting) => {
      if (!client || !orgId) return
      if (!meeting.isSupported || !meeting.joinUrl) {
        await startLocal('room', meeting.title, meeting.id)
        return
      }
      void window.kodiDesktop.meetings.openExternalMeeting(meeting.joinUrl)
      const result = await client.meeting.startFromScheduledEvent.mutate({
        orgId,
        calendarEventId: meeting.id,
      })
      await window.kodiDesktop.meetings.focusMeeting(result.meetingSessionId)
      if (bootstrap?.preferences.moveAsideEnabled) {
        await window.kodiDesktop.meetings.moveAside()
      }
      await refresh()
    },
    [
      bootstrap?.preferences.moveAsideEnabled,
      client,
      orgId,
      refresh,
      startLocal,
    ]
  )

  useEffect(
    () => window.kodiDesktop.meetings.onStartLocal((mode) => startLocal(mode)),
    [startLocal]
  )
  useEffect(() => {
    const handler = (event: Event) => {
      launchMeeting(
        (event as CustomEvent<DesktopUpcomingMeeting>).detail
      ).catch(console.error)
    }
    window.addEventListener('kodi-launch-reminder', handler)
    return () => window.removeEventListener('kodi-launch-reminder', handler)
  }, [launchMeeting])

  useEffect(() => {
    if (!bootstrap?.preferences.remindersEnabled) return
    const timers = bootstrap.upcomingMeetings
      .filter((meeting) => meeting.isSupported)
      .map((meeting) => {
        const remindAt =
          new Date(meeting.startsAt).getTime() -
          bootstrap.preferences.reminderLeadTimeMinutes * 60_000
        const delay = remindAt - Date.now()
        if (delay < 0 || delay > 6 * 60 * 60_000) return null
        return window.setTimeout(() => {
          window.kodiDesktop.meetings.showReminder({
            calendarEventId: meeting.id,
            title: meeting.title,
            startsAt: meeting.startsAt,
            joinUrl: meeting.joinUrl,
            meetingSessionId: meeting.meetingSessionId,
          })
        }, delay)
      })
    return () => timers.forEach((timer) => timer && window.clearTimeout(timer))
  }, [bootstrap])

  if (location.hash.startsWith('#/reminder')) return <ReminderPopup />
  if (!config)
    return (
      <div className="loading">
        <Sparkles /> Starting Kodi
      </div>
    )
  if (!orgId) return <LoginScreen config={config} onSignedIn={setOrgId} />
  if (!bootstrap)
    return (
      <div className="loading">
        <MonitorUp /> Loading meetings
      </div>
    )

  if (view === 'settings') {
    return (
      <SettingsView
        bootstrap={bootstrap}
        setView={setView}
        save={async (patch) => {
          if (!client) return
          const result = await client.desktop.savePreferences.mutate({
            orgId,
            ...patch,
          })
          setBootstrap({ ...bootstrap, preferences: result.preferences })
        }}
      />
    )
  }

  return (
    <Home
      bootstrap={bootstrap}
      refresh={refresh}
      launchMeeting={launchMeeting}
      startLocal={startLocal}
      setView={setView}
    />
  )
}

createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)
