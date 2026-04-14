import {
  buildVoiceOutputMediaPageUrl,
} from './voice-output-media'
import {
  startRecallBotOutputMedia,
  stopRecallBotOutputMedia,
} from '../providers/recall/client'
import { env } from '../../env'

const OUTPUT_MEDIA_REFRESH_WINDOW_MS = 60_000
const activeOutputMediaSessions = new Map<string, number>()

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

  const lastEnsuredAt = activeOutputMediaSessions.get(input.botSessionId) ?? 0
  if (Date.now() - lastEnsuredAt < OUTPUT_MEDIA_REFRESH_WINDOW_MS) {
    return
  }

  const pageUrl = buildVoiceOutputMediaPageUrl({
    apiBaseUrl,
    meetingSessionId: input.meetingSessionId,
    botSessionId: input.botSessionId,
  })

  await startRecallBotOutputMedia(input.botSessionId, {
    camera: {
      kind: 'webpage',
      config: {
        url: pageUrl,
      },
    },
  })

  activeOutputMediaSessions.set(input.botSessionId, Date.now())
}

export async function stopRecallOutputMediaSession(botSessionId: string) {
  activeOutputMediaSessions.delete(botSessionId)
  await stopRecallBotOutputMedia(botSessionId)
}
