import { describe, expect, test } from 'bun:test'
import {
  registerComposioToolsForAgent,
  type PluginToolDescriptor,
} from './register-tools'
import { createComposioSessionCache } from './session'
import type { ComposioAction } from './index'
import type { ComposioDispatcher, DispatchOutcome } from './dispatcher'

const USER = '11111111-1111-4111-8111-111111111111'
const AGENT = 'agent_aaa'
const SESSION = 'sess_x'

const GMAIL: ComposioAction = {
  name: 'gmail__send_email',
  description: 'Send a Gmail',
  parameters: { type: 'object' },
  toolkit: 'gmail',
  action: 'send_email',
}
const SLACK: ComposioAction = {
  name: 'slack__post',
  description: 'Post to Slack',
  parameters: { type: 'object' },
  toolkit: 'slack',
  action: 'post_message',
}

function makeFakeDispatcher(
  outcome: DispatchOutcome = { status: 'ok', payload: { id: 'msg_1' } },
): ComposioDispatcher & { calls: unknown[] } {
  const calls: unknown[] = []
  return {
    calls,
    execute: async (params) => {
      calls.push(params)
      return outcome
    },
  }
}

function makeRegistry() {
  const registered: PluginToolDescriptor[] = []
  return {
    registered,
    registerTool: (tool: PluginToolDescriptor) => {
      registered.push(tool)
    },
  }
}

describe('registerComposioToolsForAgent — first call', () => {
  test('registers one tool per action, returns counts', () => {
    const sessionCache = createComposioSessionCache()
    const dispatcher = makeFakeDispatcher()
    const reg = makeRegistry()
    const everRegistered = new Set<string>()

    const result = registerComposioToolsForAgent(
      {
        registerTool: reg.registerTool,
        sessionCache,
        dispatcher,
        everRegistered,
      },
      {
        user_id: USER,
        openclaw_agent_id: AGENT,
        composio_session_id: SESSION,
        actions: [GMAIL, SLACK],
      },
    )

    expect(result.registered_tool_count).toBe(2)
    expect(result.added_names.sort()).toEqual([
      'composio__agent_aaa__gmail__send_email',
      'composio__agent_aaa__slack__post_message',
    ])
    expect(result.removed_names).toEqual([])
    expect(result.reused_names).toEqual([])
    expect(reg.registered).toHaveLength(2)

    const entry = sessionCache.getSession(AGENT)
    expect(entry?.composio_session_id).toBe(SESSION)
    expect(entry?.allowedToolNames.size).toBe(2)
  })
})

describe('registerComposioToolsForAgent — re-provision diff', () => {
  test('adding a new action only registers that one', () => {
    const sessionCache = createComposioSessionCache()
    const dispatcher = makeFakeDispatcher()
    const reg = makeRegistry()
    const everRegistered = new Set<string>()

    registerComposioToolsForAgent(
      { registerTool: reg.registerTool, sessionCache, dispatcher, everRegistered },
      {
        user_id: USER,
        openclaw_agent_id: AGENT,
        composio_session_id: SESSION,
        actions: [GMAIL],
      },
    )
    expect(reg.registered).toHaveLength(1)

    const second = registerComposioToolsForAgent(
      { registerTool: reg.registerTool, sessionCache, dispatcher, everRegistered },
      {
        user_id: USER,
        openclaw_agent_id: AGENT,
        composio_session_id: SESSION,
        actions: [GMAIL, SLACK],
      },
    )
    expect(second.added_names).toEqual([
      'composio__agent_aaa__slack__post_message',
    ])
    expect(second.removed_names).toEqual([])
    expect(second.reused_names).toEqual([])
    expect(reg.registered).toHaveLength(2)
    expect(second.registered_tool_count).toBe(2)
  })

  test('removing an action drops from allowed set without unregistering globally', () => {
    const sessionCache = createComposioSessionCache()
    const dispatcher = makeFakeDispatcher()
    const reg = makeRegistry()
    const everRegistered = new Set<string>()

    registerComposioToolsForAgent(
      { registerTool: reg.registerTool, sessionCache, dispatcher, everRegistered },
      {
        user_id: USER,
        openclaw_agent_id: AGENT,
        composio_session_id: SESSION,
        actions: [GMAIL, SLACK],
      },
    )

    const second = registerComposioToolsForAgent(
      { registerTool: reg.registerTool, sessionCache, dispatcher, everRegistered },
      {
        user_id: USER,
        openclaw_agent_id: AGENT,
        composio_session_id: SESSION,
        actions: [GMAIL],
      },
    )
    expect(second.removed_names).toEqual([
      'composio__agent_aaa__slack__post_message',
    ])
    expect(second.added_names).toEqual([])
    expect(second.registered_tool_count).toBe(1)
    expect(reg.registered).toHaveLength(2) // still 2 total registered globally

    const entry = sessionCache.getSession(AGENT)
    expect(entry?.allowedToolNames.size).toBe(1)
    expect(
      entry?.allowedToolNames.has('composio__agent_aaa__slack__post_message'),
    ).toBe(false)
  })

  test('same actions twice: fast path, no api.registerTool calls', () => {
    const sessionCache = createComposioSessionCache()
    const dispatcher = makeFakeDispatcher()
    const reg = makeRegistry()
    const everRegistered = new Set<string>()

    registerComposioToolsForAgent(
      { registerTool: reg.registerTool, sessionCache, dispatcher, everRegistered },
      {
        user_id: USER,
        openclaw_agent_id: AGENT,
        composio_session_id: SESSION,
        actions: [GMAIL],
      },
    )
    expect(reg.registered).toHaveLength(1)

    const second = registerComposioToolsForAgent(
      { registerTool: reg.registerTool, sessionCache, dispatcher, everRegistered },
      {
        user_id: USER,
        openclaw_agent_id: AGENT,
        composio_session_id: SESSION,
        actions: [GMAIL],
      },
    )
    expect(second.added_names).toEqual([])
    expect(second.removed_names).toEqual([])
    expect(second.reused_names).toEqual([])
    expect(reg.registered).toHaveLength(1) // no new registration
  })

  test('re-add a previously-removed action: skipped via everRegistered (reused)', () => {
    const sessionCache = createComposioSessionCache()
    const dispatcher = makeFakeDispatcher()
    const reg = makeRegistry()
    const everRegistered = new Set<string>()

    registerComposioToolsForAgent(
      { registerTool: reg.registerTool, sessionCache, dispatcher, everRegistered },
      {
        user_id: USER,
        openclaw_agent_id: AGENT,
        composio_session_id: SESSION,
        actions: [GMAIL],
      },
    )
    // Remove
    registerComposioToolsForAgent(
      { registerTool: reg.registerTool, sessionCache, dispatcher, everRegistered },
      {
        user_id: USER,
        openclaw_agent_id: AGENT,
        composio_session_id: SESSION,
        actions: [],
      },
    )
    // Re-add
    const third = registerComposioToolsForAgent(
      { registerTool: reg.registerTool, sessionCache, dispatcher, everRegistered },
      {
        user_id: USER,
        openclaw_agent_id: AGENT,
        composio_session_id: SESSION,
        actions: [GMAIL],
      },
    )
    expect(third.reused_names).toEqual([
      'composio__agent_aaa__gmail__send_email',
    ])
    expect(third.added_names).toEqual([
      'composio__agent_aaa__gmail__send_email',
    ])
    // Still only one global registration ever happened
    expect(reg.registered).toHaveLength(1)

    const entry = sessionCache.getSession(AGENT)
    expect(
      entry?.allowedToolNames.has('composio__agent_aaa__gmail__send_email'),
    ).toBe(true)
  })

  test('refreshes session_id on every call', () => {
    const sessionCache = createComposioSessionCache()
    const dispatcher = makeFakeDispatcher()
    const reg = makeRegistry()
    const everRegistered = new Set<string>()

    registerComposioToolsForAgent(
      { registerTool: reg.registerTool, sessionCache, dispatcher, everRegistered },
      {
        user_id: USER,
        openclaw_agent_id: AGENT,
        composio_session_id: SESSION,
        actions: [GMAIL],
      },
    )
    registerComposioToolsForAgent(
      { registerTool: reg.registerTool, sessionCache, dispatcher, everRegistered },
      {
        user_id: USER,
        openclaw_agent_id: AGENT,
        composio_session_id: 'sess_NEW',
        actions: [GMAIL],
      },
    )
    expect(sessionCache.getSession(AGENT)?.composio_session_id).toBe('sess_NEW')
  })
})

describe('registered tool execute() callback', () => {
  test('routes to dispatcher with the right toolkit/action/session', async () => {
    const sessionCache = createComposioSessionCache()
    const dispatcher = makeFakeDispatcher({
      status: 'ok',
      payload: { id: 'msg_1' },
    })
    const reg = makeRegistry()
    const everRegistered = new Set<string>()

    registerComposioToolsForAgent(
      { registerTool: reg.registerTool, sessionCache, dispatcher, everRegistered },
      {
        user_id: USER,
        openclaw_agent_id: AGENT,
        composio_session_id: SESSION,
        actions: [GMAIL],
      },
    )

    const tool = reg.registered[0]!
    const result = await tool.execute('call_1', { to: 'a@b.com', subject: 'hi' })

    expect(dispatcher.calls).toEqual([
      {
        openclaw_agent_id: AGENT,
        user_id: USER,
        composio_session_id: SESSION,
        toolkit: 'gmail',
        action: 'send_email',
        params: { to: 'a@b.com', subject: 'hi' },
      },
    ])
    expect(result.content[0]?.type).toBe('text')
    expect(result.content[0]?.text).toContain('msg_1')
  })

  test('returns "revoked" failure when name no longer in allowed set', async () => {
    const sessionCache = createComposioSessionCache()
    const dispatcher = makeFakeDispatcher()
    const reg = makeRegistry()
    const everRegistered = new Set<string>()

    registerComposioToolsForAgent(
      { registerTool: reg.registerTool, sessionCache, dispatcher, everRegistered },
      {
        user_id: USER,
        openclaw_agent_id: AGENT,
        composio_session_id: SESSION,
        actions: [GMAIL],
      },
    )
    const tool = reg.registered[0]!

    // Remove from allowed set (simulate user revoking the toolkit)
    registerComposioToolsForAgent(
      { registerTool: reg.registerTool, sessionCache, dispatcher, everRegistered },
      {
        user_id: USER,
        openclaw_agent_id: AGENT,
        composio_session_id: SESSION,
        actions: [],
      },
    )

    const result = await tool.execute('call_1', {})
    expect(result.details).toEqual({ status: 'revoked' })
    expect(result.content[0]?.text).toContain('no longer available')
    expect(dispatcher.calls).toEqual([]) // dispatcher never invoked
  })

  test('returns dispatcher failure as-is in details', async () => {
    const sessionCache = createComposioSessionCache()
    const dispatcher = makeFakeDispatcher({
      status: 'failed',
      reason: 'composio_error',
      message: 'rate limited',
    })
    const reg = makeRegistry()
    const everRegistered = new Set<string>()

    registerComposioToolsForAgent(
      { registerTool: reg.registerTool, sessionCache, dispatcher, everRegistered },
      {
        user_id: USER,
        openclaw_agent_id: AGENT,
        composio_session_id: SESSION,
        actions: [GMAIL],
      },
    )
    const tool = reg.registered[0]!

    const result = await tool.execute('call_1', {})
    expect(result.details).toEqual({ status: 'failed', reason: 'composio_error' })
    expect(result.content[0]?.text).toBe('rate limited')
  })

  test('coerces non-object params to {}', async () => {
    const sessionCache = createComposioSessionCache()
    const dispatcher = makeFakeDispatcher()
    const reg = makeRegistry()
    const everRegistered = new Set<string>()

    registerComposioToolsForAgent(
      { registerTool: reg.registerTool, sessionCache, dispatcher, everRegistered },
      {
        user_id: USER,
        openclaw_agent_id: AGENT,
        composio_session_id: SESSION,
        actions: [GMAIL],
      },
    )
    const tool = reg.registered[0]!
    await tool.execute('call_1', null)
    await tool.execute('call_1', 'not an object')
    await tool.execute('call_1', [1, 2, 3])
    expect(dispatcher.calls.every((c) => (c as { params: unknown }).params && typeof (c as { params: unknown }).params === 'object'))
      .toBe(true)
  })
})

describe('multi-agent isolation', () => {
  test('two agents, same toolkit/action: tool names differ; allowed sets are independent', () => {
    const sessionCache = createComposioSessionCache()
    const dispatcher = makeFakeDispatcher()
    const reg = makeRegistry()
    const everRegistered = new Set<string>()

    registerComposioToolsForAgent(
      { registerTool: reg.registerTool, sessionCache, dispatcher, everRegistered },
      {
        user_id: USER,
        openclaw_agent_id: 'agent_aaa',
        composio_session_id: 'sess_a',
        actions: [GMAIL],
      },
    )
    registerComposioToolsForAgent(
      { registerTool: reg.registerTool, sessionCache, dispatcher, everRegistered },
      {
        user_id: '22222222-2222-4222-8222-222222222222',
        openclaw_agent_id: 'agent_bbb',
        composio_session_id: 'sess_b',
        actions: [GMAIL],
      },
    )

    expect(reg.registered).toHaveLength(2)
    expect(reg.registered[0]!.name).toBe('composio__agent_aaa__gmail__send_email')
    expect(reg.registered[1]!.name).toBe('composio__agent_bbb__gmail__send_email')

    // Revoke for agent_aaa only
    registerComposioToolsForAgent(
      { registerTool: reg.registerTool, sessionCache, dispatcher, everRegistered },
      {
        user_id: USER,
        openclaw_agent_id: 'agent_aaa',
        composio_session_id: 'sess_a',
        actions: [],
      },
    )

    expect(sessionCache.getSession('agent_aaa')?.allowedToolNames.size).toBe(0)
    expect(sessionCache.getSession('agent_bbb')?.allowedToolNames.size).toBe(1)
  })
})
