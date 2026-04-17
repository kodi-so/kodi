import {
  buildVoiceOutputMediaPageUrl,
} from './voice-output-media'
import {
  startRecallBotOutputMedia,
  stopRecallBotOutputMedia,
} from '../providers/recall/client'
import { env } from '../../env'

type VoiceOutputMediaSession = {
  pageUrl: string
}

// Stable page URL cached per bot session. The same URL is reused on every call
// so Recall does not need to reload the page between consecutive voice responses.
const voiceOutputMediaSessions = new Map<string, VoiceOutputMediaSession>()

export async function ensureRecallOutputMediaActive(input: {
  botSessionId: string
  meetingSessionId: string
}) {
  const apiBaseUrl = env.API_BASE_URL
  if (!apiBaseUrl) {
    throw new Error(
      'API_BASE_URL is not configured — cannot build Recall Output Media URL.'
    )
  }

  // Generate the page URL once per bot session and reuse it on every subsequent
  // call. Sending the same URL to Recall means the bot's existing page stays
  // loaded rather than reloading, so in-progress polls and state are preserved.
  let session = voiceOutputMediaSessions.get(input.botSessionId)
  if (!session) {
    const pageUrl = buildVoiceOutputMediaPageUrl({
      apiBaseUrl,
      meetingSessionId: input.meetingSessionId,
      botSessionId: input.botSessionId,
    })
    session = { pageUrl }
    voiceOutputMediaSessions.set(input.botSessionId, session)
  }

  // Always POST to Recall so the Output Media session is guaranteed active
  // before the audio clip is available for polling. Without this, a Recall-side
  // session expiry (e.g. after a long silence) would silently drop a response.
  await startRecallBotOutputMedia(input.botSessionId, {
    camera: {
      kind: 'webpage',
      config: {
        url: session.pageUrl,
      },
    },
  })
}

export async function stopRecallOutputMediaSession(botSessionId: string) {
  voiceOutputMediaSessions.delete(botSessionId)
  await stopRecallBotOutputMedia(botSessionId)
}
