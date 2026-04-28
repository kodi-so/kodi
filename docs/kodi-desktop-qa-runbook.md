# Kodi Desktop QA And Support Runbook

## Manual QA Matrix

Run on macOS latest stable and the oldest supported macOS target.

- Fresh install opens Kodi and shows sign-in.
- System-browser sign-in returns through `kodi://auth-callback`.
- Refresh token survives app restart and is stored in keychain.
- Sign-out revokes local credentials.
- Window close hides the app; Quit exits.
- Single-instance relaunch focuses the existing app.
- Tray opens Kodi, starts solo thinking, and starts in-person meeting.
- Coming up renders supported Zoom and Google Meet events.
- Unsupported/linkless events show local-note fallback.
- Duplicate calendar events produce one visible reminder.
- Canceled events do not offer a join action.
- Overlapping meetings do not create duplicate windows.
- Reminder fires at configured lead time.
- Reminder primary action opens external URL and starts Kodi join.
- Scheduled launch retry returns the same meeting session.
- Move-aside docks the window and can be disabled.
- Local session start, pause, resume, and end update shared meeting state.
- Recent meetings include scheduled and local meetings after restart.
- Update check reports internal/beta/stable channel state.

## Operator Diagnostics

Check these tables first:

- `desktop_devices` for heartbeat, app version, platform, active session
- `desktop_preferences` for reminder and move-aside settings
- `calendar_event_candidates` for event sync, duplicate grouping, provider inference
- `desktop_sessions` for token expiry and revocation
- `meeting_sessions` for continuity from reminder to live session to recap
- `local_meeting_sessions` for local capture state

## Troubleshooting

Auth callback issues:

- confirm `kodi://` protocol registration
- confirm the browser flow calls `/desktop/auth/callback-code`
- confirm the auth code is not expired or consumed
- confirm the user is a member of the selected org

Reminder issues:

- confirm desktop feature flag is enabled
- confirm reminders are enabled and lead time is not `0`
- confirm event is not canceled and starts inside the polling horizon
- confirm duplicate group does not suppress the expected event

Launch issues:

- confirm `join_url` is present and provider inference found `zoom` or `google_meet`
- retry `meeting.startFromScheduledEvent`; it should be idempotent
- inspect meeting audit events for desktop-triggered launch context

Rollback:

- move affected users back to the previous update channel
- revoke affected `desktop_sessions` if auth state is suspect
- disable `KODI_FEATURE_DESKTOP_APP` to stop reminders and bootstrap capability
