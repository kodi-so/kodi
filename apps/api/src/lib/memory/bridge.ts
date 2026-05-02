import {
  db,
  decrypt,
  type Instance,
  type OpenClawAgent,
} from '@kodi/db'
import type { MemoryScope, MemorySearchScope } from './service'

type BridgeMemoryInstanceRecord = Pick<
  Instance,
  'id' | 'orgId' | 'status' | 'gatewayToken'
>

type BridgeMemoryAgentRecord = Pick<
  OpenClawAgent,
  'id' | 'orgId' | 'orgMemberId' | 'agentType' | 'openclawAgentId' | 'status'
>

export type BridgeMemoryAuthAccess = {
  listInstances(): Promise<BridgeMemoryInstanceRecord[]>
  findAgentByExternalId(input: {
    orgId: string
    openclawAgentId: string
  }): Promise<BridgeMemoryAgentRecord | null>
}

export type BridgeMemoryRequestHeaders = {
  authorization: string | null
  agentId: string | null
  sessionKey: string | null
  toolCallId: string | null
}

export type BridgeMemoryAuthContext = {
  instanceId: string
  orgId: string
  agentId: string
  agentType: 'org' | 'member'
  orgMemberId: string | null
  sessionKey: string | null
  toolCallId: string
  allowedScopes: MemoryScope[]
}

type BridgeMemoryResultCode =
  | 'missing-service-token'
  | 'missing-agent-id'
  | 'missing-tool-call-id'
  | 'unknown-instance'
  | 'instance-not-running'
  | 'unknown-agent'
  | 'invalid-agent-scope'
  | 'scope-not-allowed'

type BridgeMemoryFailure = {
  ok: false
  code: BridgeMemoryResultCode
  error: string
  status: number
}

type BridgeMemorySuccess<T> = {
  ok: true
  value: T
}

export type BridgeMemoryResult<T> =
  | BridgeMemoryFailure
  | BridgeMemorySuccess<T>

export function createBridgeMemoryDbAccess(
  database: typeof db = db
): BridgeMemoryAuthAccess {
  return {
    async listInstances() {
      return database.query.instances.findMany({
        columns: {
          id: true,
          orgId: true,
          status: true,
          gatewayToken: true,
        },
      })
    },

    async findAgentByExternalId(input) {
      const agent = await database.query.openClawAgents.findFirst({
        columns: {
          id: true,
          orgId: true,
          orgMemberId: true,
          agentType: true,
          openclawAgentId: true,
          status: true,
        },
        where: (fields, { and, eq }) =>
          and(
            eq(fields.orgId, input.orgId),
            eq(fields.openclawAgentId, input.openclawAgentId)
          ),
      })

      return agent ?? null
    },
  }
}

export function readBridgeMemoryHeaders(
  input: Headers | Record<string, string | null | undefined>
): BridgeMemoryRequestHeaders {
  const read = (name: string) => {
    if (input instanceof Headers) {
      return input.get(name)
    }

    return input[name] ?? input[name.toLowerCase()] ?? null
  }

  return {
    authorization: read('authorization'),
    agentId: read('x-kb-agent-id'),
    sessionKey: read('x-kb-session-key'),
    toolCallId: read('x-kb-tool-call-id'),
  }
}

export async function resolveBridgeMemoryAuthContext(
  access: BridgeMemoryAuthAccess,
  headers: BridgeMemoryRequestHeaders
): Promise<BridgeMemoryResult<BridgeMemoryAuthContext>> {
  const serviceToken = extractBearerToken(headers.authorization)
  if (!serviceToken) {
    return fail(
      'missing-service-token',
      'Missing or invalid bearer token.',
      401
    )
  }

  const agentId = headers.agentId?.trim() ?? ''
  if (!agentId) {
    return fail(
      'missing-agent-id',
      'Missing trusted OpenClaw agent identity.',
      401
    )
  }

  const toolCallId = headers.toolCallId?.trim() ?? ''
  if (!toolCallId) {
    return fail(
      'missing-tool-call-id',
      'Missing trusted tool call identity.',
      401
    )
  }

  const instances = await access.listInstances()
  const instance = matchInstanceByGatewayToken(instances, serviceToken)
  if (!instance) {
    return fail('unknown-instance', 'Unknown bridge deployment.', 401)
  }

  if (instance.status !== 'running') {
    return fail(
      'instance-not-running',
      'Authenticated bridge deployment is not active.',
      403
    )
  }

  const agent = await access.findAgentByExternalId({
    orgId: instance.orgId,
    openclawAgentId: agentId,
  })

  if (!agent) {
    return fail(
      'unknown-agent',
      'Trusted OpenClaw agent is not registered for this org.',
      401
    )
  }

  if (agent.agentType === 'member' && !agent.orgMemberId) {
    return fail(
      'invalid-agent-scope',
      'Member-scoped OpenClaw agent is missing its org member mapping.',
      500
    )
  }

  return {
    ok: true,
    value: {
      instanceId: instance.id,
      orgId: instance.orgId,
      agentId: agent.openclawAgentId,
      agentType: agent.agentType,
      orgMemberId: agent.orgMemberId,
      sessionKey: headers.sessionKey?.trim() || null,
      toolCallId,
      allowedScopes:
        agent.agentType === 'org' ? ['org'] : ['org', 'member'],
    },
  }
}

export function resolveBridgeMemoryScope(
  context: BridgeMemoryAuthContext,
  scope: MemoryScope
): BridgeMemoryResult<MemoryScope> {
  if (!context.allowedScopes.includes(scope)) {
    return fail(
      'scope-not-allowed',
      `OpenClaw ${context.agentType} agents cannot access ${scope} memory.`,
      403
    )
  }

  return { ok: true, value: scope }
}

export function resolveBridgeMemorySearchScope(
  context: BridgeMemoryAuthContext,
  scope: MemorySearchScope
): BridgeMemoryResult<MemorySearchScope> {
  if (scope === 'all') {
    if (context.agentType !== 'member') {
      return fail(
        'scope-not-allowed',
        'OpenClaw org agents cannot search member memory.',
        403
      )
    }

    return { ok: true, value: 'all' }
  }

  return resolveBridgeMemoryScope(context, scope)
}

function extractBearerToken(header: string | null) {
  if (!header) return null

  const [scheme, token] = header.trim().split(/\s+/, 2)
  if (scheme?.toLowerCase() !== 'bearer' || !token) {
    return null
  }

  return token
}

function matchInstanceByGatewayToken(
  instances: BridgeMemoryInstanceRecord[],
  token: string
) {
  // The bridge project will add per-instance HMAC secrets on top of this
  // transport auth. For now we authenticate the deployment with its
  // existing gateway token and layer trusted runtime identity on top.
  for (const instance of instances) {
    if (!instance.gatewayToken) continue

    try {
      if (decrypt(instance.gatewayToken) === token) {
        return instance
      }
    } catch {
      // Ignore rows with undecryptable or legacy values while we keep scanning.
    }
  }

  return null
}

function fail(
  code: BridgeMemoryResultCode,
  error: string,
  status: number
): BridgeMemoryFailure {
  return {
    ok: false,
    code,
    error,
    status,
  }
}
