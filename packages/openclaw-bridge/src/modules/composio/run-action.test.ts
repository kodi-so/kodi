import { describe, expect, test } from 'bun:test'
import { runActionForAgent } from './run-action'
import { createComposioSessionCache } from './session'
import type { ComposioDispatcher, DispatchExecuteParams } from './dispatcher'
import { buildComposioToolName } from './tool-naming'

const OC_AGENT = 'agent_oc1'
const USER = 'user-1'
const SESSION = 'sess-cmp-abc'

function captureDispatcher(
  outcome: Awaited<ReturnType<ComposioDispatcher['execute']>> = {
    status: 'ok',
    payload: { ok: true, id: 'msg_42' },
  },
): { dispatcher: ComposioDispatcher; calls: DispatchExecuteParams[] } {
  const calls: DispatchExecuteParams[] = []
  return {
    calls,
    dispatcher: {
      execute: async (params) => {
        calls.push(params)
        return outcome
      },
    },
  }
}

function seededCache(allowedNames: string[]): ReturnType<typeof createComposioSessionCache> {
  const cache = createComposioSessionCache()
  const entry = cache.setSession({
    openclaw_agent_id: OC_AGENT,
    composio_session_id: SESSION,
  })
  for (const n of allowedNames) entry.allowedToolNames.add(n)
  return cache
}

describe('runActionForAgent', () => {
  const TOOL = buildComposioToolName({
    openclaw_agent_id: OC_AGENT,
    toolkit: 'gmail',
    action: 'send_email',
  })

  test('happy path: calls dispatcher with the right shape, returns ok', async () => {
    const cache = seededCache([TOOL])
    const cap = captureDispatcher()
    const result = await runActionForAgent(
      { sessionCache: cache, dispatcher: cap.dispatcher },
      { tool_name: TOOL, params: { to: 'a@b.com' }, user_id: USER },
    )
    expect(result).toEqual({ kind: 'ok', payload: { ok: true, id: 'msg_42' } })
    expect(cap.calls).toEqual([
      {
        openclaw_agent_id: OC_AGENT,
        user_id: USER,
        composio_session_id: SESSION,
        toolkit: 'gmail',
        action: 'send_email',
        params: { to: 'a@b.com' },
      },
    ])
  })

  test('unparseable tool_name → failed/unparseable_tool_name, dispatcher not called', async () => {
    const cap = captureDispatcher()
    const result = await runActionForAgent(
      { sessionCache: createComposioSessionCache(), dispatcher: cap.dispatcher },
      { tool_name: 'memory.search', params: {}, user_id: USER },
    )
    expect(result.kind).toBe('failed')
    if (result.kind === 'failed') expect(result.reason).toBe('unparseable_tool_name')
    expect(cap.calls).toHaveLength(0)
  })

  test('agent has no session → failed/no_session', async () => {
    const cap = captureDispatcher()
    const result = await runActionForAgent(
      { sessionCache: createComposioSessionCache(), dispatcher: cap.dispatcher },
      { tool_name: TOOL, params: {}, user_id: USER },
    )
    expect(result.kind).toBe('failed')
    if (result.kind === 'failed') expect(result.reason).toBe('no_session')
    expect(cap.calls).toHaveLength(0)
  })

  test('tool not in allowed set → failed/revoked', async () => {
    const cache = seededCache([]) // session exists but tool isn't allowed
    const cap = captureDispatcher()
    const result = await runActionForAgent(
      { sessionCache: cache, dispatcher: cap.dispatcher },
      { tool_name: TOOL, params: {}, user_id: USER },
    )
    expect(result.kind).toBe('failed')
    if (result.kind === 'failed') expect(result.reason).toBe('revoked')
    expect(cap.calls).toHaveLength(0)
  })

  test('dispatcher returns failed → failed/dispatch_failed with the message', async () => {
    const cache = seededCache([TOOL])
    const cap = captureDispatcher({
      status: 'failed',
      reason: 'composio_error',
      message: 'OAuth expired',
    })
    const result = await runActionForAgent(
      { sessionCache: cache, dispatcher: cap.dispatcher },
      { tool_name: TOOL, params: {}, user_id: USER },
    )
    expect(result.kind).toBe('failed')
    if (result.kind === 'failed') {
      expect(result.reason).toBe('dispatch_failed')
      expect(result.message).toBe('OAuth expired')
    }
  })
})
