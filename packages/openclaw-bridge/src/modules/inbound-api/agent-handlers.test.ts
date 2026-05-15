import { describe, expect, test } from 'bun:test'
import {
  createDeprovisionHandler,
  createProvisionHandler,
  parseDeprovisionBody,
  parseProvisionBody,
} from './agent-handlers'
import type {
  ProvisionInput,
  ProvisionResult,
} from '../agent-manager/provision'
import type {
  DeprovisionInput,
  DeprovisionResult,
} from '../agent-manager/deprovision'

const ORG = '11111111-1111-4111-8111-111111111111'
const USER = '22222222-2222-4222-8222-222222222222'
const KODI_AGENT = '33333333-3333-4333-8333-333333333333'

const ACTION = {
  name: 'gmail__send_email',
  description: 'Send a Gmail message',
  parameters: { type: 'object' as const },
  toolkit: 'gmail',
  action: 'send_email',
}

describe('parseProvisionBody', () => {
  test('happy path with all fields', () => {
    const result = parseProvisionBody({
      org_id: ORG,
      user_id: USER,
      composio_session_id: 'sess_abc',
      actions: [ACTION],
      kodi_agent_id: KODI_AGENT,
    })
    expect('error' in result).toBe(false)
    if ('error' in result) return
    expect(result.org_id).toBe(ORG)
    expect(result.user_id).toBe(USER)
    expect(result.composio_session_id).toBe('sess_abc')
    expect(result.actions).toHaveLength(1)
    expect(result.actions[0]?.name).toBe('gmail__send_email')
    expect(result.kodi_agent_id).toBe(KODI_AGENT)
  })

  test('null composio_session_id is allowed', () => {
    const result = parseProvisionBody({
      org_id: ORG,
      user_id: USER,
      composio_session_id: null,
      actions: [],
    })
    expect('error' in result).toBe(false)
    if ('error' in result) return
    expect(result.composio_session_id).toBeNull()
  })

  test('omitted composio_session_id normalizes to null', () => {
    const result = parseProvisionBody({
      org_id: ORG,
      user_id: USER,
      actions: [],
    })
    expect('error' in result).toBe(false)
    if ('error' in result) return
    expect(result.composio_session_id).toBeNull()
  })

  test('empty actions array is valid', () => {
    const result = parseProvisionBody({
      org_id: ORG,
      user_id: USER,
      actions: [],
    })
    expect('error' in result).toBe(false)
    if ('error' in result) return
    expect(result.actions).toEqual([])
  })

  test.each([
    ['null body', null],
    ['array body', []],
    ['string body', 'hi'],
    ['number body', 42],
    ['undefined body', undefined],
  ])('rejects non-object body: %s', (_label, body) => {
    expect(parseProvisionBody(body)).toEqual({ error: 'body must be a JSON object' })
  })

  test('rejects missing user_id', () => {
    const result = parseProvisionBody({ org_id: ORG, actions: [] })
    expect(result).toEqual({ error: 'user_id must be a UUID string' })
  })

  test('rejects non-UUID user_id', () => {
    const result = parseProvisionBody({
      org_id: ORG,
      user_id: 'not-a-uuid',
      actions: [],
    })
    expect(result).toEqual({ error: 'user_id must be a UUID string' })
  })

  test('rejects missing org_id', () => {
    const result = parseProvisionBody({ user_id: USER, actions: [] })
    expect(result).toEqual({ error: 'org_id must be a UUID string' })
  })

  test('rejects non-array actions', () => {
    const result = parseProvisionBody({
      org_id: ORG,
      user_id: USER,
      actions: 'not-an-array',
    })
    expect(result).toEqual({ error: 'actions must be an array' })
  })

  test('rejects malformed action entry with index in error message', () => {
    const result = parseProvisionBody({
      org_id: ORG,
      user_id: USER,
      actions: [ACTION, { not: 'an action' }],
    })
    expect(result).toEqual({
      error: 'actions[1] is not a valid ComposioAction',
    })
  })

  test('rejects non-string composio_session_id', () => {
    const result = parseProvisionBody({
      org_id: ORG,
      user_id: USER,
      composio_session_id: 42,
      actions: [],
    })
    expect(result).toEqual({
      error: 'composio_session_id must be a string or null',
    })
  })

  test('rejects non-UUID kodi_agent_id when provided', () => {
    const result = parseProvisionBody({
      org_id: ORG,
      user_id: USER,
      actions: [],
      kodi_agent_id: 'oops',
    })
    expect(result).toEqual({
      error: 'kodi_agent_id must be a UUID string when provided',
    })
  })
})

describe('parseDeprovisionBody', () => {
  test('happy path', () => {
    const result = parseDeprovisionBody({ user_id: USER })
    expect('error' in result).toBe(false)
    if ('error' in result) return
    expect(result.user_id).toBe(USER)
  })

  test('rejects missing user_id', () => {
    expect(parseDeprovisionBody({})).toEqual({
      error: 'user_id must be a UUID string',
    })
  })

  test('rejects non-UUID user_id', () => {
    expect(parseDeprovisionBody({ user_id: 'no' })).toEqual({
      error: 'user_id must be a UUID string',
    })
  })

  test('rejects non-object body', () => {
    expect(parseDeprovisionBody(null)).toEqual({
      error: 'body must be a JSON object',
    })
  })
})

describe('createProvisionHandler', () => {
  function fakeProvision(): {
    handler: (i: ProvisionInput) => Promise<ProvisionResult>
    calls: ProvisionInput[]
  } {
    const calls: ProvisionInput[] = []
    return {
      calls,
      handler: async (input) => {
        calls.push(input)
        return {
          openclaw_agent_id: 'agent_x',
          workspace_dir: '/state/kodi-workspaces/agent_x',
          composio_status: 'active',
          registered_tool_count: input.actions?.length ?? 0,
          created: true,
        }
      },
    }
  }

  test('happy path: 200 with spec response shape', async () => {
    const { handler: provision, calls } = fakeProvision()
    const handler = createProvisionHandler(provision)
    const result = await handler({
      org_id: ORG,
      user_id: USER,
      composio_session_id: 'sess_abc',
      actions: [ACTION],
    })
    expect(result.kind).toBe('ok')
    if (result.kind !== 'ok') return
    expect(result.body).toEqual({
      openclaw_agent_id: 'agent_x',
      composio_status: 'active',
      registered_tool_count: 1,
    })
    expect(calls).toHaveLength(1)
    expect(calls[0]?.user_id).toBe(USER)
    expect(calls[0]?.composio_session_id).toBe('sess_abc')
    expect(calls[0]?.actions).toEqual([ACTION])
  })

  test('badRequest on missing user_id', async () => {
    const { handler: provision } = fakeProvision()
    const handler = createProvisionHandler(provision)
    const result = await handler({ org_id: ORG, actions: [] })
    expect(result.kind).toBe('badRequest')
    if (result.kind === 'badRequest') {
      expect(result.message).toContain('user_id')
    }
  })

  test('still returns 200 when composio failed (status passed through)', async () => {
    const provision = async (input: ProvisionInput): Promise<ProvisionResult> => ({
      openclaw_agent_id: 'agent_x',
      workspace_dir: '/state/kodi-workspaces/agent_x',
      composio_status: 'failed',
      registered_tool_count: 0,
      created: true,
    })
    const handler = createProvisionHandler(provision)
    const result = await handler({
      org_id: ORG,
      user_id: USER,
      actions: [ACTION],
    })
    expect(result.kind).toBe('ok')
    if (result.kind === 'ok') {
      expect(result.body.composio_status).toBe('failed')
    }
  })

  test('passes kodi_agent_id through when provided', async () => {
    const { handler: provision, calls } = fakeProvision()
    const handler = createProvisionHandler(provision)
    await handler({
      org_id: ORG,
      user_id: USER,
      kodi_agent_id: KODI_AGENT,
      actions: [],
    })
    expect(calls[0]?.kodi_agent_id).toBe(KODI_AGENT)
  })
})

describe('createDeprovisionHandler', () => {
  test('happy path: 200 with { ok: true }', async () => {
    const calls: DeprovisionInput[] = []
    const deprovision = async (
      input: DeprovisionInput,
    ): Promise<DeprovisionResult> => {
      calls.push(input)
      return { ok: true, removed: true, openclaw_agent_id: 'agent_x' }
    }
    const handler = createDeprovisionHandler(deprovision)
    const result = await handler({ user_id: USER })
    expect(result.kind).toBe('ok')
    if (result.kind !== 'ok') return
    expect(result.body).toEqual({ ok: true })
    expect(calls).toEqual([{ user_id: USER }])
  })

  test('still returns ok: true when nothing was removed (idempotent)', async () => {
    const deprovision = async (): Promise<DeprovisionResult> => ({
      ok: true,
      removed: false,
    })
    const handler = createDeprovisionHandler(deprovision)
    const result = await handler({ user_id: USER })
    expect(result.kind).toBe('ok')
    if (result.kind === 'ok') {
      expect(result.body).toEqual({ ok: true })
    }
  })

  test('badRequest on missing user_id', async () => {
    const deprovision = async (): Promise<DeprovisionResult> => ({
      ok: true,
      removed: false,
    })
    const handler = createDeprovisionHandler(deprovision)
    const result = await handler({})
    expect(result.kind).toBe('badRequest')
  })
})
