import { createHmac, timingSafeEqual } from 'crypto'
import { and, asc, db, eq, gt, isNull, meetingAnswers, meetingVoiceMedia } from '@kodi/db'
import { env } from '../../env'

const VOICE_OUTPUT_MEDIA_TOKEN_VERSION = 'v1'
const VOICE_OUTPUT_MEDIA_TOKEN_MAX_AGE_MS = 24 * 60 * 60 * 1000

type VoiceOutputMediaSessionPayload = {
  version: typeof VOICE_OUTPUT_MEDIA_TOKEN_VERSION
  meetingSessionId: string
  botSessionId: string
  issuedAt: string
}

export type VoiceOutputMediaPlaybackState = {
  interruptCurrent: boolean
  nextToken: string | null
}

function base64UrlEncode(value: string | Buffer) {
  return Buffer.from(value).toString('base64url')
}

function base64UrlDecode(value: string) {
  return Buffer.from(value, 'base64url').toString('utf8')
}

function signVoiceOutputMediaPayload(payload: string) {
  return createHmac('sha256', env.BETTER_AUTH_SECRET)
    .update(payload)
    .digest('base64url')
}

export function createVoiceOutputMediaSessionToken(input: {
  meetingSessionId: string
  botSessionId: string
}) {
  const payload: VoiceOutputMediaSessionPayload = {
    version: VOICE_OUTPUT_MEDIA_TOKEN_VERSION,
    meetingSessionId: input.meetingSessionId,
    botSessionId: input.botSessionId,
    issuedAt: new Date().toISOString(),
  }

  const encodedPayload = base64UrlEncode(JSON.stringify(payload))
  const signature = signVoiceOutputMediaPayload(encodedPayload)
  return `${encodedPayload}.${signature}`
}

export function verifyVoiceOutputMediaSessionToken(token: string) {
  const [encodedPayload, providedSignature] = token.split('.')
  if (!encodedPayload || !providedSignature) return null

  const expectedSignature = signVoiceOutputMediaPayload(encodedPayload)
  const providedBytes = Buffer.from(providedSignature)
  const expectedBytes = Buffer.from(expectedSignature)

  if (
    providedBytes.length !== expectedBytes.length ||
    !timingSafeEqual(providedBytes, expectedBytes)
  ) {
    return null
  }

  let payload: VoiceOutputMediaSessionPayload
  try {
    payload = JSON.parse(base64UrlDecode(encodedPayload)) as VoiceOutputMediaSessionPayload
  } catch {
    return null
  }

  if (payload.version !== VOICE_OUTPUT_MEDIA_TOKEN_VERSION) return null

  const issuedAt = new Date(payload.issuedAt)
  if (Number.isNaN(issuedAt.getTime())) return null

  if (Date.now() - issuedAt.getTime() > VOICE_OUTPUT_MEDIA_TOKEN_MAX_AGE_MS) {
    return null
  }

  return payload
}

export function buildVoiceOutputMediaPageUrl(input: {
  apiBaseUrl: string
  meetingSessionId: string
  botSessionId: string
}) {
  const token = createVoiceOutputMediaSessionToken({
    meetingSessionId: input.meetingSessionId,
    botSessionId: input.botSessionId,
  })
  return `${input.apiBaseUrl}/voice-agent/${token}`
}

export async function getVoiceOutputMediaPlaybackState(input: {
  meetingSessionId: string
  currentToken?: string | null
}): Promise<VoiceOutputMediaPlaybackState> {
  const currentToken = input.currentToken?.trim() || null

  const [currentRows, pendingRows] = await Promise.all([
    currentToken
      ? db
          .select({
            interruptedAt: meetingAnswers.interruptedAt,
          })
          .from(meetingVoiceMedia)
          .innerJoin(meetingAnswers, eq(meetingAnswers.id, meetingVoiceMedia.answerId))
          .where(eq(meetingVoiceMedia.token, currentToken))
          .limit(1)
      : Promise.resolve([]),
    db
      .select({
        token: meetingVoiceMedia.token,
      })
      .from(meetingVoiceMedia)
      .innerJoin(meetingAnswers, eq(meetingAnswers.id, meetingVoiceMedia.answerId))
      .where(
        and(
          eq(meetingVoiceMedia.meetingSessionId, input.meetingSessionId),
          eq(meetingVoiceMedia.accessCount, 0),
          gt(meetingVoiceMedia.expiresAt, new Date()),
          isNull(meetingAnswers.interruptedAt)
        )
      )
      .orderBy(asc(meetingVoiceMedia.createdAt))
      .limit(1),
  ])

  return {
    interruptCurrent: currentRows[0]?.interruptedAt != null,
    nextToken: pendingRows[0]?.token ?? null,
  }
}

export function renderVoiceOutputMediaPage(token: string) {
  const escapedToken = JSON.stringify(token)

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Kodi Voice Output</title>
    <style>
      :root {
        color-scheme: dark;
        --bg: #050816;
        --panel: rgba(17, 24, 39, 0.92);
        --line: rgba(148, 163, 184, 0.22);
        --text: #e5eefc;
        --muted: #8fa3bf;
        --accent: #46c3ff;
        --accent-soft: rgba(70, 195, 255, 0.18);
      }
      * { box-sizing: border-box; }
      body {
        margin: 0;
        min-height: 100vh;
        display: grid;
        place-items: center;
        font-family: ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
        background:
          radial-gradient(circle at top, rgba(70, 195, 255, 0.18), transparent 36%),
          linear-gradient(180deg, #09111f 0%, var(--bg) 72%);
        color: var(--text);
      }
      .shell {
        width: min(560px, calc(100vw - 48px));
        padding: 28px;
        border-radius: 24px;
        border: 1px solid var(--line);
        background: var(--panel);
        box-shadow: 0 30px 90px rgba(0, 0, 0, 0.35);
      }
      .brand {
        font-size: 13px;
        letter-spacing: 0.14em;
        text-transform: uppercase;
        color: var(--muted);
      }
      .title {
        margin: 10px 0 12px;
        font-size: 36px;
        line-height: 1;
      }
      .status {
        display: inline-flex;
        align-items: center;
        gap: 10px;
        padding: 10px 14px;
        border-radius: 999px;
        border: 1px solid var(--line);
        background: rgba(15, 23, 42, 0.84);
        color: var(--muted);
      }
      .dot {
        width: 10px;
        height: 10px;
        border-radius: 999px;
        background: var(--accent);
        box-shadow: 0 0 0 10px var(--accent-soft);
        animation: pulse 1.8s infinite;
      }
      .status[data-speaking="true"] .dot {
        animation-duration: 0.7s;
      }
      .hint {
        margin-top: 18px;
        color: var(--muted);
        font-size: 15px;
        line-height: 1.5;
      }
      @keyframes pulse {
        0% { transform: scale(0.92); opacity: 0.82; }
        70% { transform: scale(1.12); opacity: 1; }
        100% { transform: scale(0.92); opacity: 0.82; }
      }
    </style>
  </head>
  <body>
    <main class="shell">
      <div class="brand">Kodi</div>
      <h1 class="title">Voice Copilot</h1>
      <div class="status" id="status" data-speaking="false">
        <span class="dot"></span>
        <span id="status-text">Listening for the next response</span>
      </div>
      <p class="hint">
        This page is streamed by Recall Output Media. Kodi will play queued voice responses into the meeting as they become available.
      </p>
      <audio id="voice-audio" preload="auto"></audio>
    </main>
    <script>
      const sessionToken = ${escapedToken}
      const statusEl = document.getElementById('status')
      const statusTextEl = document.getElementById('status-text')
      const audioEl = document.getElementById('voice-audio')

      let currentToken = null
      let pollTimer = null
      let pollInFlight = false

      function setStatus(text, speaking) {
        statusTextEl.textContent = text
        statusEl.dataset.speaking = speaking ? 'true' : 'false'
      }

      function clearAudio() {
        audioEl.pause()
        audioEl.removeAttribute('src')
        audioEl.load()
      }

      async function playClip(token, url) {
        currentToken = token
        audioEl.src = url
        setStatus('Speaking into the meeting', true)

        try {
          await audioEl.play()
        } catch (error) {
          console.error('[voice-agent] audio playback failed', error)
          currentToken = null
          clearAudio()
          setStatus('Playback blocked, retrying...', false)
        }
      }

      async function poll() {
        if (pollInFlight) return
        pollInFlight = true

        try {
          const params = new URLSearchParams()
          if (currentToken) params.set('currentToken', currentToken)

          const response = await fetch('/voice-agent/' + sessionToken + '/state?' + params.toString(), {
            cache: 'no-store',
            headers: {
              accept: 'application/json'
            }
          })

          if (!response.ok) {
            throw new Error('Voice state request failed with ' + response.status)
          }

          const state = await response.json()

          if (state.interruptCurrent && currentToken) {
            currentToken = null
            clearAudio()
            setStatus('Response interrupted, listening for the next one', false)
          }

          if (state.nextToken && state.nextAudioUrl && state.nextToken !== currentToken) {
            if (!audioEl.paused) {
              clearAudio()
            }
            await playClip(state.nextToken, state.nextAudioUrl)
          } else if (!currentToken && audioEl.paused) {
            setStatus('Listening for the next response', false)
          }

          const pollAfterMs = Number.isFinite(state.pollAfterMs) ? state.pollAfterMs : 900
          pollTimer = setTimeout(poll, pollAfterMs)
        } catch (error) {
          console.error('[voice-agent] polling failed', error)
          setStatus('Reconnecting voice stream...', false)
          pollTimer = setTimeout(poll, 1500)
        } finally {
          pollInFlight = false
        }
      }

      audioEl.addEventListener('ended', () => {
        currentToken = null
        clearAudio()
        setStatus('Listening for the next response', false)
      })

      audioEl.addEventListener('error', () => {
        currentToken = null
        clearAudio()
        setStatus('Audio playback failed, waiting for retry', false)
      })

      window.addEventListener('beforeunload', () => {
        if (pollTimer) clearTimeout(pollTimer)
      })

      poll()
    </script>
  </body>
</html>`
}
