import { db, decrypt, type Instance } from '@kodi/db'

type OpenClawChatMessage = {
  role: 'system' | 'user' | 'assistant'
  content: string
}

type OpenClawConnection = {
  instance: Instance
  instanceUrl: string
  headers: Record<string, string>
}

type OpenClawChatCompletionInput = {
  orgId: string
  messages: OpenClawChatMessage[]
  timeoutMs?: number
  temperature?: number
  maxTokens?: number
}

type OpenClawChatCompletionResult =
  | {
      ok: true
      content: string
      connection: OpenClawConnection
    }
  | {
      ok: false
      reason:
        | 'missing-instance'
        | 'instance-not-running'
        | 'missing-instance-url'
        | 'request-failed'
        | 'empty-response'
      error?: string
    }

function resolveInstanceUrl(instance: Instance) {
  if (instance.instanceUrl) return instance.instanceUrl
  if (instance.hostname) return `https://${instance.hostname}`
  if (process.env.OPENCLAW_DEV_URL) return process.env.OPENCLAW_DEV_URL
  return null
}

function buildHeaders(instance: Instance) {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  }

  if (!instance.gatewayToken) return headers

  try {
    const token = decrypt(instance.gatewayToken)
    if (token) {
      headers.Authorization = `Bearer ${token}`
    }
  } catch {
    // If decryption fails, fall back to an unauthenticated request.
  }

  return headers
}

export async function resolveOpenClawConnection(
  orgId: string
): Promise<OpenClawConnection | null> {
  const instance = await db.query.instances.findFirst({
    where: (fields, { eq }) => eq(fields.orgId, orgId),
  })

  if (!instance || instance.status !== 'running') return null

  const instanceUrl = resolveInstanceUrl(instance)
  if (!instanceUrl) return null

  return {
    instance,
    instanceUrl,
    headers: buildHeaders(instance),
  }
}

export async function openClawChatCompletion(
  input: OpenClawChatCompletionInput
): Promise<OpenClawChatCompletionResult> {
  const instance = await db.query.instances.findFirst({
    where: (fields, { eq }) => eq(fields.orgId, input.orgId),
  })

  if (!instance) {
    return { ok: false, reason: 'missing-instance' }
  }

  if (instance.status !== 'running') {
    return {
      ok: false,
      reason: 'instance-not-running',
      error: `Instance status is ${instance.status}.`,
    }
  }

  const instanceUrl = resolveInstanceUrl(instance)
  if (!instanceUrl) {
    return { ok: false, reason: 'missing-instance-url' }
  }

  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), input.timeoutMs ?? 15_000)

  try {
    const response = await fetch(`${instanceUrl}/v1/chat/completions`, {
      method: 'POST',
      headers: buildHeaders(instance),
      body: JSON.stringify({
        model: 'openclaw:main',
        messages: input.messages,
        ...(input.temperature !== undefined && { temperature: input.temperature }),
        ...(input.maxTokens !== undefined && { max_tokens: input.maxTokens }),
      }),
      signal: controller.signal,
    })

    clearTimeout(timeoutId)

    if (!response.ok) {
      const body = await response.text().catch(() => '')
      return {
        ok: false,
        reason: 'request-failed',
        error: `Instance responded with HTTP ${response.status}: ${body}`,
      }
    }

    const data = (await response.json()) as {
      choices?: { message?: { content?: string } }[]
    }
    const content = data.choices?.[0]?.message?.content

    if (!content) {
      return { ok: false, reason: 'empty-response' }
    }

    return {
      ok: true,
      content,
      connection: {
        instance,
        instanceUrl,
        headers: buildHeaders(instance),
      },
    }
  } catch (error) {
    clearTimeout(timeoutId)

    return {
      ok: false,
      reason: 'request-failed',
      error: error instanceof Error ? error.message : 'Unknown OpenClaw error',
    }
  }
}
