import type { Hono } from 'hono'
import { getVoiceAudio } from '../lib/meetings/voice-audio-store'
import {
  getVoiceOutputMediaPlaybackState,
  renderVoiceOutputMediaPage,
  verifyVoiceOutputMediaSessionToken,
} from '../lib/meetings/voice-output-media'

export function registerVoiceAudioRoutes(app: Hono) {
  app.get('/voice-audio/:token', async (c) => {
    const token = c.req.param('token')
    const audio = await getVoiceAudio(token)
    if (!audio) return c.json({ error: 'Voice audio not found.' }, 404)

    const body = new Uint8Array(audio.buffer)
    return new Response(body, {
      headers: {
        'Content-Type': audio.contentType,
        'Cache-Control': 'private, max-age=60',
      },
    })
  })

  app.get('/voice-agent/:sessionToken', (c) => {
    const token = c.req.param('sessionToken')
    if (!verifyVoiceOutputMediaSessionToken(token)) {
      return c.text('Unauthorized', 401)
    }
    return c.html(renderVoiceOutputMediaPage(token))
  })

  app.get('/voice-agent/:sessionToken/state', async (c) => {
    const token = c.req.param('sessionToken')
    const payload = verifyVoiceOutputMediaSessionToken(token)
    if (!payload) return c.json({ error: 'Unauthorized' }, 401)

    const state = await getVoiceOutputMediaPlaybackState({
      meetingSessionId: payload.meetingSessionId,
      currentToken: c.req.query('currentToken') ?? null,
    })

    return c.json({
      ...state,
      nextUrl: state.nextToken ? `/voice-audio/${state.nextToken}` : null,
    })
  })
}
