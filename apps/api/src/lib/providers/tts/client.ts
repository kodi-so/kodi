import { env } from '../../../env'

export type TtsVoice = 'alloy' | 'echo' | 'fable' | 'onyx' | 'nova' | 'shimmer'
export type TtsModel = 'tts-1' | 'tts-1-hd'

export type TtsGenerateResult =
  | { ok: true; audioBuffer: Buffer; contentType: 'audio/mpeg' }
  | { ok: false; reason: 'tts-unavailable' | 'tts-failed'; error?: string }

/**
 * Returns whether TTS is configured and available in this environment.
 */
export function isTtsAvailable(): boolean {
  return Boolean(env.TTS_OPENAI_API_KEY)
}

/**
 * Generate speech audio from text using the OpenAI TTS API.
 * Returns an MP3 buffer on success or an error discriminant on failure.
 */
export async function generateSpeech(input: {
  text: string
  voice?: TtsVoice
  model?: TtsModel
  timeoutMs?: number
}): Promise<TtsGenerateResult> {
  const apiKey = env.TTS_OPENAI_API_KEY

  if (!apiKey) {
    return { ok: false, reason: 'tts-unavailable' }
  }

  const voice = input.voice ?? env.TTS_OPENAI_VOICE
  const model = input.model ?? env.TTS_OPENAI_MODEL
  const timeoutMs = input.timeoutMs ?? 30_000

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), timeoutMs)

  try {
    const response = await fetch('https://api.openai.com/v1/audio/speech', {
      method: 'POST',
      signal: controller.signal,
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model,
        input: input.text,
        voice,
        response_format: 'mp3',
      }),
    })

    if (!response.ok) {
      let errorText: string | null = null
      try {
        errorText = await response.text()
      } catch {
        // ignore
      }
      return {
        ok: false,
        reason: 'tts-failed',
        error: errorText ?? `HTTP ${response.status}`,
      }
    }

    const arrayBuffer = await response.arrayBuffer()
    const audioBuffer = Buffer.from(arrayBuffer)

    return { ok: true, audioBuffer, contentType: 'audio/mpeg' }
  } catch (err) {
    return {
      ok: false,
      reason: 'tts-failed',
      error: err instanceof Error ? err.message : String(err),
    }
  } finally {
    clearTimeout(timeout)
  }
}
