import { beforeAll, describe, expect, it } from 'bun:test'

beforeAll(() => {
  process.env.DATABASE_URL ??= 'https://example.com/db'
  process.env.BETTER_AUTH_URL ??= 'https://example.com'
  process.env.BETTER_AUTH_SECRET ??= 'x'.repeat(32)
  process.env.ENCRYPTION_KEY ??= 'a'.repeat(64)
})

describe('voice-output-media token signing', () => {
  it('round-trips valid session tokens', async () => {
    const {
      createVoiceOutputMediaSessionToken,
      verifyVoiceOutputMediaSessionToken,
    } = await import('./voice-output-media')

    const token = createVoiceOutputMediaSessionToken({
      meetingSessionId: 'meeting-123',
      botSessionId: 'bot-456',
    })

    expect(verifyVoiceOutputMediaSessionToken(token)).toMatchObject({
      meetingSessionId: 'meeting-123',
      botSessionId: 'bot-456',
      version: 'v1',
    })
  })

  it('rejects tampered tokens', async () => {
    const {
      createVoiceOutputMediaSessionToken,
      verifyVoiceOutputMediaSessionToken,
    } = await import('./voice-output-media')

    const token = createVoiceOutputMediaSessionToken({
      meetingSessionId: 'meeting-123',
      botSessionId: 'bot-456',
    })

    expect(verifyVoiceOutputMediaSessionToken(`${token}tampered`)).toBeNull()
  })
})
