import { TRPCError } from '@trpc/server'
import { decrypt, instances } from '@kodi/db'
import { runChatCompletionWithToolAccess } from './tool-access-runtime'

const CHARS_PER_TOKEN = 4
const MAX_HISTORY_TOKENS = 200_000

export const DEFAULT_ASSISTANT_SYSTEM_PROMPT =
  'You are Kodi, a helpful AI teammate for employees and teams. You help users reason through discussions, answer questions using available business context, capture decisions, clarify next steps, and suggest or execute follow-up work across connected tools. Be concise, practical, and collaborative.'

export function buildMessagesWithHistory(
  history: { role: 'user' | 'assistant'; content: string }[],
  newUserMessage: string,
  systemPrompt = DEFAULT_ASSISTANT_SYSTEM_PROMPT
): { role: string; content: string }[] {
  const systemMessage = { role: 'system', content: systemPrompt }

  let budgetChars =
    MAX_HISTORY_TOKENS * CHARS_PER_TOKEN -
    systemPrompt.length -
    newUserMessage.length

  const included: { role: string; content: string }[] = []

  for (const message of history) {
    const cost = message.content.length
    if (budgetChars - cost < 0) break
    budgetChars -= cost
    included.push({ role: message.role, content: message.content })
  }

  included.reverse()

  return [systemMessage, ...included, { role: 'user', content: newUserMessage }]
}

export async function getAssistantRuntimeConfig(db: any, orgId: string) {
  const instance = await db.query.instances.findFirst({
    where: (table: typeof instances, { eq }: any) => eq(table.orgId, orgId),
  })

  if (!instance) {
    throw new TRPCError({
      code: 'NOT_FOUND',
      message: 'No instance found for this org',
    })
  }

  if (instance.status !== 'running') {
    throw new TRPCError({
      code: 'PRECONDITION_FAILED',
      message: `Instance is not ready (current status: ${instance.status})`,
    })
  }

  let instanceUrl: string | undefined

  if (instance.instanceUrl) {
    instanceUrl = instance.instanceUrl
  } else if (instance.hostname) {
    instanceUrl = `https://${instance.hostname}`
  } else if (process.env.OPENCLAW_DEV_URL) {
    instanceUrl = process.env.OPENCLAW_DEV_URL
  }

  if (!instanceUrl) {
    throw new TRPCError({
      code: 'PRECONDITION_FAILED',
      message:
        'Instance has no reachable URL (instanceUrl, hostname, or OPENCLAW_DEV_URL required)',
    })
  }

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  }

  if (instance.gatewayToken) {
    try {
      const token = decrypt(instance.gatewayToken)
      if (token) {
        headers['Authorization'] = `Bearer ${token}`
      }
    } catch {
      // Best effort only.
    }
  }

  return { headers, instanceUrl }
}

export async function runAssistantTurn(params: {
  db: any
  orgId: string
  actorUserId: string
  sourceId: string
  userMessage: string
  history: { role: 'user' | 'assistant'; content: string }[]
  systemPrompt?: string
}) {
  const { headers, instanceUrl } = await getAssistantRuntimeConfig(
    params.db,
    params.orgId
  )

  const messages = buildMessagesWithHistory(
    params.history,
    params.userMessage,
    params.systemPrompt
  )

  return runChatCompletionWithToolAccess({
    db: params.db,
    orgId: params.orgId,
    actorUserId: params.actorUserId,
    sourceId: params.sourceId,
    userMessage: params.userMessage,
    instanceUrl,
    headers,
    messages,
  })
}
