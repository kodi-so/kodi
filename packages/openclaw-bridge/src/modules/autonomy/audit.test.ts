import { describe, expect, test } from 'bun:test'
import { createAuditAfterToolCall, type AuditEmitFn } from './audit'

const KODI_AGENT_ID = '11111111-1111-4111-8111-111111111111'
const OC_AGENT = 'agent_oc1'
const USER_ID = '22222222-2222-4222-8222-222222222222'

function fixedRegistry(opts?: { unknown?: boolean; withoutKodiAgentId?: boolean }) {
  return {
    getByAgentId: (id: string) => {
      if (opts?.unknown) return undefined
      if (id !== OC_AGENT) return undefined
      if (opts?.withoutKodiAgentId) {
        return { user_id: USER_ID }
      }
      return { user_id: USER_ID, kodi_agent_id: KODI_AGENT_ID }
    },
  }
}

function captureEmit(): {
  fn: AuditEmitFn
  calls: Array<{
    kind: string
    payload: Record<string, unknown>
    agent?: unknown
  }>
} {
  const calls: Array<{
    kind: string
    payload: Record<string, unknown>
    agent?: unknown
  }> = []
  return {
    calls,
    fn: async (kind, payload, opts) => {
      calls.push({ kind, payload, agent: opts?.agent })
    },
  }
}

function silentLogger() {
  return { log: () => {}, warn: () => {}, error: () => {} }
}

describe('createAuditAfterToolCall', () => {
  test('emits tool.invoke.after with outcome=ok when no error', async () => {
    const emit = captureEmit()
    const handler = createAuditAfterToolCall({
      registry: fixedRegistry(),
      emit: emit.fn,
      logger: silentLogger(),
    })
    await handler(
      {
        toolName: 'composio__agent_oc1__gmail__send_email',
        params: { to: 'a@b.com' },
        durationMs: 412,
      },
      {
        agentId: OC_AGENT,
        sessionKey: 'sess-1',
        toolName: 'composio__agent_oc1__gmail__send_email',
      },
    )
    expect(emit.calls).toHaveLength(1)
    expect(emit.calls[0]?.kind).toBe('tool.invoke.after')
    expect(emit.calls[0]?.payload).toEqual({
      tool_name: 'composio__agent_oc1__gmail__send_email',
      duration_ms: 412,
      outcome: 'ok',
    })
    expect(emit.calls[0]?.agent).toEqual({
      agent_id: KODI_AGENT_ID,
      openclaw_agent_id: OC_AGENT,
      user_id: USER_ID,
    })
  })

  test('emits with outcome=error when event.error is set', async () => {
    const emit = captureEmit()
    const handler = createAuditAfterToolCall({
      registry: fixedRegistry(),
      emit: emit.fn,
      logger: silentLogger(),
    })
    await handler(
      {
        toolName: 'composio__agent_oc1__gmail__send_email',
        params: {},
        durationMs: 50,
        error: 'Composio rate limit',
      },
      {
        agentId: OC_AGENT,
        sessionKey: 'sess-1',
        toolName: 'composio__agent_oc1__gmail__send_email',
      },
    )
    expect(emit.calls[0]?.payload).toEqual({
      tool_name: 'composio__agent_oc1__gmail__send_email',
      duration_ms: 50,
      outcome: 'error',
      error: 'Composio rate limit',
    })
  })

  test('missing durationMs defaults to 0', async () => {
    const emit = captureEmit()
    const handler = createAuditAfterToolCall({
      registry: fixedRegistry(),
      emit: emit.fn,
      logger: silentLogger(),
    })
    await handler(
      { toolName: 'tool', params: {} },
      { agentId: OC_AGENT, toolName: 'tool' },
    )
    expect(emit.calls[0]?.payload.duration_ms).toBe(0)
  })

  test('missing agentId in ctx → emits without agent envelope', async () => {
    const emit = captureEmit()
    const handler = createAuditAfterToolCall({
      registry: fixedRegistry(),
      emit: emit.fn,
      logger: silentLogger(),
    })
    await handler(
      { toolName: 'tool', params: {}, durationMs: 1 },
      { toolName: 'tool' },
    )
    expect(emit.calls).toHaveLength(1)
    expect(emit.calls[0]?.agent).toBeUndefined()
  })

  test('agent not in registry → emits without agent envelope', async () => {
    const emit = captureEmit()
    const handler = createAuditAfterToolCall({
      registry: fixedRegistry({ unknown: true }),
      emit: emit.fn,
      logger: silentLogger(),
    })
    await handler(
      { toolName: 'tool', params: {}, durationMs: 1 },
      { agentId: 'agent_unknown', toolName: 'tool' },
    )
    expect(emit.calls).toHaveLength(1)
    expect(emit.calls[0]?.agent).toBeUndefined()
  })

  test('registry entry without kodi_agent_id → emits without agent envelope', async () => {
    const emit = captureEmit()
    const handler = createAuditAfterToolCall({
      registry: fixedRegistry({ withoutKodiAgentId: true }),
      emit: emit.fn,
      logger: silentLogger(),
    })
    await handler(
      { toolName: 'tool', params: {}, durationMs: 1 },
      { agentId: OC_AGENT, toolName: 'tool' },
    )
    expect(emit.calls).toHaveLength(1)
    expect(emit.calls[0]?.agent).toBeUndefined()
  })

  test('emit throwing does not propagate (best-effort post-hook)', async () => {
    const handler = createAuditAfterToolCall({
      registry: fixedRegistry(),
      emit: async () => {
        throw new Error('emitter blew up')
      },
      logger: silentLogger(),
    })
    // Just asserting that the call doesn't throw.
    await handler(
      { toolName: 'tool', params: {}, durationMs: 1 },
      { agentId: OC_AGENT, toolName: 'tool' },
    )
  })
})
