import { describe, expect, it } from 'bun:test'
import { decodeVoiceAudio, encodeVoiceAudio } from './voice-audio-store'

describe('voice-audio-store encoding', () => {
  it('round-trips audio buffers through base64 storage', () => {
    const original = Buffer.from('test-audio')
    const encoded = encodeVoiceAudio(original)
    const decoded = decodeVoiceAudio(encoded)

    expect(decoded.toString()).toBe('test-audio')
  })
})
