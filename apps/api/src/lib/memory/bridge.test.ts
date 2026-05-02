import { beforeAll, describe, expect, it } from 'bun:test'
import { encrypt } from '@kodi/db'
import {
  readBridgeMemoryHeaders,
  resolveBridgeMemoryAuthContext,
  resolveBridgeMemoryScope,
  resolveBridgeMemorySearchScope,
  type BridgeMemoryAuthAccess,
  type BridgeMemoryAuthContext,
} from './bridge'

beforeAll(() => {
  process.env.ENCRYPTION_KEY ??= '11'.repeat(32)
})

function createAccessFixture(): BridgeMemoryAuthAccess {
  const runningToken = encrypt('running-token')

  return {
    async listInstances() {
      return [
        {
          id: 'inst_running',
          orgId: 'org_123',
          status: 'running',
          gatewayToken: runningToken,
        },
        {
          id: 'inst_pending',
          orgId: 'org_456',
          status: 'pending',
          gatewayToken: encrypt('pending-token'),
        },
      ]
    },

    async findAgentByExternalId(input) {
      if (input.orgId !== 'org_123') {
        return null
      }

      if (input.openclawAgentId === 'agent_member') {
        return {
          id: 'agent_member_row',
          orgId: 'org_123',
          orgMemberId: 'org_member_123',
          agentType: 'member',
          openclawAgentId: 'agent_member',
          status: 'active',
        }
      }

      if (input.openclawAgentId === 'agent_org') {
        return {
          id: 'agent_org_row',
          orgId: 'org_123',
          orgMemberId: null,
          agentType: 'org',
          openclawAgentId: 'agent_org',
          status: 'active',
        }
      }

      return null
    },
  }
}

describe('readBridgeMemoryHeaders', () => {
  it('normalizes bearer and trusted identity headers', () => {
    const headers = readBridgeMemoryHeaders(
      new Headers({
        Authorization: 'Bearer running-token',
        'x-kb-agent-id': 'agent_member',
        'x-kb-session-key': 'session_123',
        'x-kb-tool-call-id': 'tool_123',
      })
    )

    expect(headers).toEqual({
      authorization: 'Bearer running-token',
      agentId: 'agent_member',
      sessionKey: 'session_123',
      toolCallId: 'tool_123',
    })
  })
})

describe('resolveBridgeMemoryAuthContext', () => {
  it('resolves member agents to org and member scope access', async () => {
    const result = await resolveBridgeMemoryAuthContext(createAccessFixture(), {
      authorization: 'Bearer running-token',
      agentId: 'agent_member',
      sessionKey: 'session_123',
      toolCallId: 'tool_123',
    })

    expect(result.ok).toBe(true)
    if (!result.ok) return

    expect(result.value).toEqual({
      instanceId: 'inst_running',
      orgId: 'org_123',
      agentId: 'agent_member',
      agentType: 'member',
      orgMemberId: 'org_member_123',
      sessionKey: 'session_123',
      toolCallId: 'tool_123',
      allowedScopes: ['org', 'member'],
    })
  })

  it('rejects missing trusted tool call identity', async () => {
    const result = await resolveBridgeMemoryAuthContext(createAccessFixture(), {
      authorization: 'Bearer running-token',
      agentId: 'agent_member',
      sessionKey: 'session_123',
      toolCallId: null,
    })

    expect(result).toMatchObject({
      ok: false,
      code: 'missing-tool-call-id',
      status: 401,
    })
  })

  it('rejects tokens for inactive instances', async () => {
    const result = await resolveBridgeMemoryAuthContext(createAccessFixture(), {
      authorization: 'Bearer pending-token',
      agentId: 'agent_org',
      sessionKey: 'session_456',
      toolCallId: 'tool_456',
    })

    expect(result).toMatchObject({
      ok: false,
      code: 'instance-not-running',
      status: 403,
    })
  })
})

describe('bridge memory scope guards', () => {
  const orgAgentContext: BridgeMemoryAuthContext = {
    instanceId: 'inst_running',
    orgId: 'org_123',
    agentId: 'agent_org',
    agentType: 'org' as const,
    orgMemberId: null,
    sessionKey: 'session_789',
    toolCallId: 'tool_789',
    allowedScopes: ['org'],
  }

  it('blocks org agents from member memory', () => {
    const scope = resolveBridgeMemoryScope(orgAgentContext, 'member')
    expect(scope).toMatchObject({
      ok: false,
      code: 'scope-not-allowed',
      status: 403,
    })
  })

  it('blocks org agents from all-scope search', () => {
    const scope = resolveBridgeMemorySearchScope(orgAgentContext, 'all')
    expect(scope).toMatchObject({
      ok: false,
      code: 'scope-not-allowed',
      status: 403,
    })
  })
})
