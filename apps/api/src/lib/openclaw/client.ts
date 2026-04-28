import {
  db,
  decrypt,
  ensureMemberOpenClawAgent,
  ensureOrgOpenClawAgent,
  type Instance,
  type OpenClawAgent,
} from '@kodi/db'

type OpenClawChatMessage = {
  role: 'system' | 'user' | 'assistant'
  content: string
}

export type OpenClawConversationVisibility = 'private' | 'shared'

type OpenClawConnection = {
  instance: Instance
  instanceUrl: string
  headers: Record<string, string>
  model: string
  routedAgent: Pick<
    OpenClawAgent,
    'id' | 'agentType' | 'openclawAgentId' | 'status'
  >
  fallbackToDefaultAgent: boolean
}

type OpenClawChatCompletionInput = {
  orgId: string
  messages: OpenClawChatMessage[]
  actorUserId?: string | null
  visibility?: OpenClawConversationVisibility
  sessionKey?: string
  messageChannel?: string
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

function buildHeadersWithRouting(
  instance: Instance,
  input: {
    messageChannel?: string
    sessionKey?: string
  }
) {
  const headers = buildHeaders(instance)

  if (input.sessionKey) {
    headers['x-openclaw-session-key'] = input.sessionKey
  }

  if (input.messageChannel) {
    headers['x-openclaw-message-channel'] = input.messageChannel
  }

  return headers
}

function buildAgentModel(agent: Pick<OpenClawAgent, 'openclawAgentId'>) {
  return `openclaw/${agent.openclawAgentId}`
}

function shouldRouteDirectlyToAgent(
  agent: Pick<OpenClawAgent, 'status' | 'openclawAgentId'>
) {
  // KOD-430 seeds placeholder registry ids before bridge provisioning exists.
  // Only direct-route once the registry points at a concrete gateway agent id.
  return agent.status === 'active' && !agent.openclawAgentId.startsWith('kodi-')
}

async function resolveOrgOpenClawAgent(orgId: string) {
  const existing = await db.query.openClawAgents.findFirst({
    where: (fields, { and, eq }) =>
      and(eq(fields.orgId, orgId), eq(fields.agentType, 'org')),
    columns: {
      id: true,
      agentType: true,
      openclawAgentId: true,
      status: true,
    },
  })

  if (existing) {
    return existing
  }

  const created = await ensureOrgOpenClawAgent(db, { orgId })
  return {
    id: created.id,
    agentType: created.agentType,
    openclawAgentId: created.openclawAgentId,
    status: created.status,
  }
}

async function resolveMemberOpenClawAgent(input: {
  orgId: string
  actorUserId: string
}) {
  const membership = await db.query.orgMembers.findFirst({
    where: (fields, { and, eq }) =>
      and(eq(fields.orgId, input.orgId), eq(fields.userId, input.actorUserId)),
    columns: {
      id: true,
      role: true,
    },
  })

  if (!membership) {
    throw new Error('OpenClaw member agent routing requires an org membership.')
  }

  const existing = await db.query.openClawAgents.findFirst({
    where: (fields, { and, eq }) =>
      and(
        eq(fields.orgId, input.orgId),
        eq(fields.orgMemberId, membership.id)
      ),
    columns: {
      id: true,
      agentType: true,
      openclawAgentId: true,
      status: true,
    },
  })

  if (existing) {
    return existing
  }

  const created = await ensureMemberOpenClawAgent(db, {
    orgId: input.orgId,
    orgMemberId: membership.id,
    displayName: membership.role === 'owner' ? 'Kodi Owner' : 'Kodi Member',
    metadata: {
      source: 'runtime-routing-backfill',
      role: membership.role,
    },
  })

  return {
    id: created.id,
    agentType: created.agentType,
    openclawAgentId: created.openclawAgentId,
    status: created.status,
  }
}

async function resolveOpenClawRouting(input: {
  orgId: string
  actorUserId?: string | null
  visibility: OpenClawConversationVisibility
}) {
  if (input.visibility === 'private') {
    if (!input.actorUserId) {
      throw new Error('Private OpenClaw routing requires an actor user id.')
    }

    return resolveMemberOpenClawAgent({
      orgId: input.orgId,
      actorUserId: input.actorUserId,
    })
  }

  return resolveOrgOpenClawAgent(input.orgId)
}

export async function resolveOpenClawConnection(
  input:
    | string
    | {
        orgId: string
        actorUserId?: string | null
        visibility?: OpenClawConversationVisibility
        sessionKey?: string
        messageChannel?: string
      }
): Promise<OpenClawConnection | null> {
  const normalizedInput =
    typeof input === 'string'
      ? { orgId: input }
      : input

  const instance = await db.query.instances.findFirst({
    where: (fields, { eq }) => eq(fields.orgId, normalizedInput.orgId),
  })

  if (!instance || instance.status !== 'running') return null

  const instanceUrl = resolveInstanceUrl(instance)
  if (!instanceUrl) return null

  const routedAgent = await resolveOpenClawRouting({
    orgId: normalizedInput.orgId,
    actorUserId: normalizedInput.actorUserId,
    visibility: normalizedInput.visibility ?? 'shared',
  })
  const fallbackToDefaultAgent = !shouldRouteDirectlyToAgent(routedAgent)

  return {
    instance,
    instanceUrl,
    headers: buildHeadersWithRouting(instance, {
      sessionKey: normalizedInput.sessionKey,
      messageChannel: normalizedInput.messageChannel,
    }),
    model: fallbackToDefaultAgent
      ? 'openclaw/default'
      : buildAgentModel(routedAgent),
    routedAgent,
    fallbackToDefaultAgent,
  }
}

export async function openClawChatCompletion(
  input: OpenClawChatCompletionInput
): Promise<OpenClawChatCompletionResult> {
  const connection = await resolveOpenClawConnection({
    orgId: input.orgId,
    actorUserId: input.actorUserId,
    visibility: input.visibility ?? 'shared',
    sessionKey: input.sessionKey,
    messageChannel: input.messageChannel,
  })

  if (!connection) {
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

    if (!resolveInstanceUrl(instance)) {
      return { ok: false, reason: 'missing-instance-url' }
    }

    return {
      ok: false,
      reason: 'request-failed',
      error: 'OpenClaw routing target could not be resolved.',
    }
  }

  const controller = new AbortController()
  const timeoutMs = input.timeoutMs ?? 15_000
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs)

  try {
    const response = await fetch(`${connection.instanceUrl}/v1/chat/completions`, {
      method: 'POST',
      headers: connection.headers,
      body: JSON.stringify({
        model: connection.model,
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
      connection,
    }
  } catch (error) {
    clearTimeout(timeoutId)

    const isAbortError =
      error instanceof Error &&
      (error.name === 'AbortError' ||
        error.message === 'The operation was aborted.')

    return {
      ok: false,
      reason: 'request-failed',
      error:
        isAbortError
          ? `OpenClaw request timed out after ${timeoutMs}ms.`
          : error instanceof Error
            ? error.message
            : 'Unknown OpenClaw error',
    }
  }
}
