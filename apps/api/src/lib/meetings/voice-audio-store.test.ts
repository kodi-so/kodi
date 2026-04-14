import { describe, expect, it } from 'bun:test'
import { getVoiceAudio, storeVoiceAudio } from './voice-audio-store'

describe('voice-audio-store', () => {
  it('allows repeated reads during the token lifetime', () => {
    const token = storeVoiceAudio(Buffer.from('test-audio'))

    const first = getVoiceAudio(token)
    const second = getVoiceAudio(token)

    expect(first?.buffer.toString()).toBe('test-audio')
    expect(second?.buffer.toString()).toBe('test-audio')
  })
})
