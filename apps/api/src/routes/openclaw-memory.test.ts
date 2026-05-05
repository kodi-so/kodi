import { beforeAll, describe, expect, it } from 'bun:test'
import { encrypt } from '@kodi/db'
import { Hono } from 'hono'
import { registerOpenClawMemoryRoutes } from './openclaw-memory'

beforeAll(() => {
  process.env.ENCRYPTION_KEY ??= '11'.repeat(32)
})

describe('registerOpenClawMemoryRoutes', () => {
  it('returns ping metadata for authenticated bridge requests', async () => {
    const app = new Hono()

    registerOpenClawMemoryRoutes(app, {
      database: {} as never,
      authAccess: {
        async listInstances() {
          return [
            {
              id: 'inst_123',
              orgId: 'org_123',
              status: 'running',
              gatewayToken: encrypt('bridge-token'),
            },
          ]
        },
        async findAgentByExternalId() {
          return {
            id: 'agent_row_123',
            orgId: 'org_123',
            orgMemberId: 'org_member_123',
            agentType: 'member',
            openclawAgentId: 'agent_123',
            status: 'active',
          }
        },
      },
    })

    const response = await app.request('/api/openclaw/memory/ping', {
      method: 'POST',
      headers: {
        authorization: 'Bearer bridge-token',
        'x-kb-agent-id': 'agent_123',
        'x-kb-session-key': 'session_123',
        'x-kb-tool-call-id': 'tool_123',
      },
    })

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({
      pong: true,
      agentId: 'agent_123',
      orgId: 'org_123',
      agentType: 'member',
      allowedScopes: ['org', 'member'],
      sessionKey: 'session_123',
      toolCallId: 'tool_123',
    })
  })

  it('returns 501 for unsupported memory tools after auth succeeds', async () => {
    const app = new Hono()

    registerOpenClawMemoryRoutes(app, {
      database: {} as never,
      authAccess: {
        async listInstances() {
          return [
            {
              id: 'inst_123',
              orgId: 'org_123',
              status: 'running',
              gatewayToken: encrypt('bridge-token'),
            },
          ]
        },
        async findAgentByExternalId() {
          return {
            id: 'agent_row_123',
            orgId: 'org_123',
            orgMemberId: null,
            agentType: 'org',
            openclawAgentId: 'agent_123',
            status: 'active',
          }
        },
      },
    })

    const response = await app.request('/api/openclaw/memory/recent', {
      method: 'POST',
      headers: {
        authorization: 'Bearer bridge-token',
        'x-kb-agent-id': 'agent_123',
        'x-kb-tool-call-id': 'tool_456',
      },
    })

    expect(response.status).toBe(501)
    await expect(response.json()).resolves.toEqual({
      error: 'Memory tool "recent" is not implemented yet.',
      code: 'not-implemented',
    })
  })
})
