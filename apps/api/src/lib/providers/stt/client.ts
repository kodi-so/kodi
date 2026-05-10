import { env } from '../../../env'

export type SttTranscribeResult =
  | { ok: true; text: string }
  | { ok: false; reason: 'stt-unavailable' | 'stt-failed'; error?: string }

function resolveApiKey(): string | null {
  return env.STT_OPENAI_API_KEY ?? env.TTS_OPENAI_API_KEY ?? null
}

export function isSttAvailable(): boolean {
  return resolveApiKey() != null
}

/**
 * Transcribe a single audio chunk via OpenAI's speech-to-text API.
 *
 * Accepts any container OpenAI supports (webm, ogg, mp3, mp4, m4a, wav,
 * flac, mpeg, mpga, oga). MediaRecorder in Chrome produces webm/opus by
 * default, which Whisper handles natively.
 */
export async function transcribeAudio(input: {
  audio: Blob
  contentType: string
  filename?: string
  /** Hint for Whisper. e.g. 'en'. If omitted, auto-detect. */
  language?: string
  /** Free-form text prompt that biases vocabulary (names, jargon). */
  prompt?: string
  timeoutMs?: number
}): Promise<SttTranscribeResult> {
  const apiKey = resolveApiKey()
  if (!apiKey) return { ok: false, reason: 'stt-unavailable' }

  const blob = input.audio

  const filename = input.filename ?? `chunk.${extensionFor(input.contentType)}`
  const form = new FormData()
  form.append('file', blob, filename)
  form.append('model', env.STT_OPENAI_MODEL)
  form.append('response_format', 'json')
  // No-speech segments come back as empty strings rather than hallucinating
  // when temperature is 0.
  form.append('temperature', '0')
  if (input.language) form.append('language', input.language)
  if (input.prompt) form.append('prompt', input.prompt)

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), input.timeoutMs ?? 20_000)
  try {
    const response = await fetch('https://api.openai.com/v1/audio/transcriptions', {
      method: 'POST',
      signal: controller.signal,
      headers: { Authorization: `Bearer ${apiKey}` },
      body: form,
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
        reason: 'stt-failed',
        error: errorText ?? `HTTP ${response.status}`,
      }
    }
    const payload = (await response.json()) as { text?: unknown }
    const text = typeof payload.text === 'string' ? payload.text.trim() : ''
    return { ok: true, text }
  } catch (err) {
    return {
      ok: false,
      reason: 'stt-failed',
      error: err instanceof Error ? err.message : String(err),
    }
  } finally {
    clearTimeout(timeout)
  }
}

function extensionFor(contentType: string): string {
  const lower = contentType.toLowerCase()
  if (lower.includes('webm')) return 'webm'
  if (lower.includes('ogg')) return 'ogg'
  if (lower.includes('mp4')) return 'mp4'
  if (lower.includes('m4a')) return 'm4a'
  if (lower.includes('wav')) return 'wav'
  if (lower.includes('mpeg') || lower.includes('mp3')) return 'mp3'
  return 'webm'
}
