import { describe, expect, test } from 'bun:test'
import {
  createComposioModuleApi,
  type ComposioAction,
} from './index'
import type { ComposioDispatcher } from './dispatcher'
import type { PluginToolDescriptor } from './register-tools'

const USER = '11111111-1111-4111-8111-111111111111'
const AGENT = 'agent_aaa'
const SESSION = 'sess_x'

const ACTION: ComposioAction = {
  name: 'gmail__send_email',
  description: 'Send a Gmail',
  parameters: { type: 'object' },
  toolkit: 'gmail',
  action: 'send_email',
}

function silentLogger() {
  return { log: () => {}, warn: () => {} }
}

describe('createComposioModuleApi — registerToolsForAgent', () => {
  test('null session_id returns skipped status, count=0, no registrations', async () => {
    const registered: PluginToolDescriptor[] = []
    const api = createComposioModuleApi({
      registerTool: (t) => registered.push(t),
      logger: silentLogger(),
    })
    const result = await api.registerToolsForAgent({
      user_id: USER,
      openclaw_agent_id: AGENT,
      composio_session_id: null,
      actions: [ACTION],
    })
    expect(result).toEqual({ status: 'skipped', registered_tool_count: 0 })
    expect(registered).toHaveLength(0)
  })

  test('undefined session_id same as null → skipped', async () => {
    const registered: PluginToolDescriptor[] = []
    const api = createComposioModuleApi({
      registerTool: (t) => registered.push(t),
      logger: silentLogger(),
    })
    const result = await api.registerToolsForAgent({
      user_id: USER,
      openclaw_agent_id: AGENT,
      actions: [ACTION],
    })
    expect(result.status).toBe('skipped')
  })

  test('happy path returns active + tool count', async () => {
    const registered: PluginToolDescriptor[] = []
    const api = createComposioModuleApi({
      registerTool: (t) => registered.push(t),
      logger: silentLogger(),
    })
    const result = await api.registerToolsForAgent({
      user_id: USER,
      openclaw_agent_id: AGENT,
      composio_session_id: SESSION,
      actions: [ACTION],
    })
    expect(result).toEqual({ status: 'active', registered_tool_count: 1 })
    expect(registered).toHaveLength(1)
    expect(registered[0]?.name).toBe('composio__agent_aaa__gmail__send_email')
  })

  test('registerTool throws → emits composio.session_failed and returns failed', async () => {
    const events: Array<{ kind: string; payload: unknown }> = []
    const api = createComposioModuleApi({
      registerTool: () => {
        throw new Error('runtime exploded')
      },
      emit: async (kind, payload) => {
        events.push({ kind, payload })
      },
      logger: silentLogger(),
    })
    const result = await api.registerToolsForAgent({
      user_id: USER,
      openclaw_agent_id: AGENT,
      composio_session_id: SESSION,
      actions: [ACTION],
    })
    expect(result).toEqual({ status: 'failed', registered_tool_count: 0 })
    expect(events).toEqual([
      {
        kind: 'composio.session_failed',
        payload: { user_id: USER, error: 'runtime exploded' },
      },
    ])
  })

  test('end-to-end: registered tool execute() routes through default dispatcher → not_configured', async () => {
    const registered: PluginToolDescriptor[] = []
    const api = createComposioModuleApi({
      registerTool: (t) => registered.push(t),
      logger: silentLogger(),
    })
    await api.registerToolsForAgent({
      user_id: USER,
      openclaw_agent_id: AGENT,
      composio_session_id: SESSION,
      actions: [ACTION],
    })
    const tool = registered[0]!
    const result = await tool.execute('call_1', { to: 'a@b.com' })
    expect(result.details).toEqual({ status: 'failed', reason: 'not_configured' })
  })

  test('end-to-end with custom dispatcher: tool execute returns dispatcher payload', async () => {
    const dispatcher: ComposioDispatcher = {
      execute: async () => ({ status: 'ok', payload: { id: 'msg_42' } }),
    }
    const registered: PluginToolDescriptor[] = []
    const api = createComposioModuleApi({
      registerTool: (t) => registered.push(t),
      dispatcher,
      logger: silentLogger(),
    })
    await api.registerToolsForAgent({
      user_id: USER,
      openclaw_agent_id: AGENT,
      composio_session_id: SESSION,
      actions: [ACTION],
    })
    const result = await registered[0]!.execute('call_1', {})
    expect(result.content[0]?.text).toContain('msg_42')
  })

  test('re-provision with same actions does NOT re-register globally', async () => {
    const registered: PluginToolDescriptor[] = []
    const api = createComposioModuleApi({
      registerTool: (t) => registered.push(t),
      logger: silentLogger(),
    })
    await api.registerToolsForAgent({
      user_id: USER,
      openclaw_agent_id: AGENT,
      composio_session_id: SESSION,
      actions: [ACTION],
    })
    await api.registerToolsForAgent({
      user_id: USER,
      openclaw_agent_id: AGENT,
      composio_session_id: SESSION,
      actions: [ACTION],
    })
    expect(registered).toHaveLength(1)
  })

  test('first provision does NOT emit composio.session_rotated', async () => {
    const events: Array<{ kind: string; payload: unknown }> = []
    const api = createComposioModuleApi({
      registerTool: () => {},
      emit: async (kind, payload) => {
        events.push({ kind, payload })
      },
      logger: silentLogger(),
    })
    await api.registerToolsForAgent({
      user_id: USER,
      openclaw_agent_id: AGENT,
      composio_session_id: SESSION,
      actions: [ACTION],
    })
    expect(events).toEqual([])
  })

  test('second provision (rotation) DOES emit composio.session_rotated', async () => {
    const events: Array<{ kind: string; payload: unknown }> = []
    const api = createComposioModuleApi({
      registerTool: () => {},
      emit: async (kind, payload) => {
        events.push({ kind, payload })
      },
      logger: silentLogger(),
    })
    await api.registerToolsForAgent({
      user_id: USER,
      openclaw_agent_id: AGENT,
      composio_session_id: SESSION,
      actions: [ACTION],
    })
    await api.registerToolsForAgent({
      user_id: USER,
      openclaw_agent_id: AGENT,
      composio_session_id: 'sess_NEW',
      actions: [ACTION],
    })
    expect(events).toEqual([
      { kind: 'composio.session_rotated', payload: { user_id: USER } },
    ])
  })

  test('skipped (null session) does not emit a rotation event even if agent existed', async () => {
    const events: Array<{ kind: string; payload: unknown }> = []
    const api = createComposioModuleApi({
      registerTool: () => {},
      emit: async (kind, payload) => {
        events.push({ kind, payload })
      },
      logger: silentLogger(),
    })
    await api.registerToolsForAgent({
      user_id: USER,
      openclaw_agent_id: AGENT,
      composio_session_id: SESSION,
      actions: [ACTION],
    })
    // Now revoke (null session_id → skipped path; doesn't go through register-tools)
    await api.registerToolsForAgent({
      user_id: USER,
      openclaw_agent_id: AGENT,
      composio_session_id: null,
      actions: [ACTION],
    })
    expect(events).toEqual([])
  })
})

describe('createComposioModuleApi — unregisterToolsForAgent', () => {
  test('drops session for agent, makes future execute()s return revoked', async () => {
    const registered: PluginToolDescriptor[] = []
    const api = createComposioModuleApi({
      registerTool: (t) => registered.push(t),
      logger: silentLogger(),
    })
    await api.registerToolsForAgent({
      user_id: USER,
      openclaw_agent_id: AGENT,
      composio_session_id: SESSION,
      actions: [ACTION],
    })
    await api.unregisterToolsForAgent({ openclaw_agent_id: AGENT })

    const result = await registered[0]!.execute('call_1', {})
    expect(result.details).toEqual({ status: 'revoked' })
    expect(result.content[0]?.text).toContain('no longer available')
  })

  test('unknown agent: no-op, no throw', async () => {
    const api = createComposioModuleApi({
      registerTool: () => {},
      logger: silentLogger(),
    })
    await expect(
      api.unregisterToolsForAgent({ openclaw_agent_id: 'agent_unknown' }),
    ).resolves.toBeUndefined()
  })
})
