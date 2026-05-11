import { env } from '../../../env'
import { openClawChatCompletion } from '../../openclaw/client'

export type ChatMessage = {
  role: 'system' | 'user' | 'assistant'
  content: string
}

export type ChatCompletionInput = {
  orgId: string
  messages: ChatMessage[]
  actorUserId?: string | null
  /** 0 unless caller has a reason to allow drift. */
  temperature?: number
  maxTokens?: number
  timeoutMs?: number
  // OpenClaw-specific routing — passed through to the primary call, ignored
  // on the OpenAI fallback path.
  visibility?: 'private' | 'shared'
  sessionKey?: string
  messageChannel?: string
}

export type ChatCompletionResult =
  | { ok: true; content: string; provider: 'openclaw' | 'openai' }
  | {
      ok: false
      reason:
        | 'missing-instance'
        | 'instance-not-running'
        | 'missing-instance-url'
        | 'request-failed'
        | 'empty-response'
        | 'no-fallback-configured'
      error?: string
    }

/**
 * Chat completion with an OpenAI fallback for orgs that don't have an
 * OpenClaw instance available. The fallback uses the same OpenAI key as TTS
 * (or `STT_OPENAI_API_KEY` / `LLM_OPENAI_API_KEY` if explicitly set), so any
 * deployment that already has voice working gets post-meeting summaries for
 * free.
 *
 * Rationale: post-meeting artifact generation (summary, decisions, action
 * items) shouldn't be blocked behind OpenClaw infra. The model output is
 * roughly equivalent for these tasks.
 */
export async function chatCompletionWithFallback(
  input: ChatCompletionInput
): Promise<ChatCompletionResult> {
  // 1) Try OpenClaw first. This is the primary path for orgs with a
  //    provisioned instance, and respects per-org routing rules.
  const primary = await openClawChatCompletion({
    orgId: input.orgId,
    messages: input.messages,
    actorUserId: input.actorUserId,
    visibility: input.visibility,
    sessionKey: input.sessionKey,
    messageChannel: input.messageChannel,
    temperature: input.temperature,
    maxTokens: input.maxTokens,
    timeoutMs: input.timeoutMs,
  })

  if (primary.ok) {
    return { ok: true, content: primary.content, provider: 'openclaw' }
  }

  const isInfraFailure =
    primary.reason === 'missing-instance' ||
    primary.reason === 'instance-not-running' ||
    primary.reason === 'missing-instance-url'

  // 2) Only fall back when OpenClaw is structurally unavailable. Real
  //    request failures or empty responses bubble up so we don't silently
  //    swap providers mid-stream when OpenClaw is meant to be the path.
  if (!isInfraFailure) {
    return primary
  }

  const apiKey = resolveOpenAiApiKey()
  if (!apiKey) {
    return {
      ok: false,
      reason: 'no-fallback-configured',
      error:
        'OpenClaw is not provisioned for this org and no OpenAI fallback key is configured (set TTS_OPENAI_API_KEY / STT_OPENAI_API_KEY / LLM_OPENAI_API_KEY).',
    }
  }

  return openaiChatCompletion({
    apiKey,
    messages: input.messages,
    temperature: input.temperature,
    maxTokens: input.maxTokens,
    timeoutMs: input.timeoutMs,
  })
}

function resolveOpenAiApiKey(): string | null {
  return (
    env.LLM_OPENAI_API_KEY ??
    env.STT_OPENAI_API_KEY ??
    env.TTS_OPENAI_API_KEY ??
    null
  )
}

async function openaiChatCompletion(input: {
  apiKey: string
  messages: ChatMessage[]
  temperature?: number
  maxTokens?: number
  timeoutMs?: number
}): Promise<ChatCompletionResult> {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), input.timeoutMs ?? 30_000)
  try {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      signal: controller.signal,
      headers: {
        Authorization: `Bearer ${input.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: env.LLM_OPENAI_MODEL,
        messages: input.messages,
        ...(input.temperature !== undefined && { temperature: input.temperature }),
        ...(input.maxTokens !== undefined && { max_tokens: input.maxTokens }),
      }),
    })
    if (!response.ok) {
      const errorText = await response.text().catch(() => '')
      return {
        ok: false,
        reason: 'request-failed',
        error: errorText || `HTTP ${response.status}`,
      }
    }
    const payload = (await response.json()) as {
      choices?: Array<{ message?: { content?: unknown } }>
    }
    const content = payload.choices?.[0]?.message?.content
    if (typeof content !== 'string' || content.trim() === '') {
      return { ok: false, reason: 'empty-response' }
    }
    return { ok: true, content, provider: 'openai' }
  } catch (err) {
    return {
      ok: false,
      reason: 'request-failed',
      error: err instanceof Error ? err.message : String(err),
    }
  } finally {
    clearTimeout(timeout)
  }
}
