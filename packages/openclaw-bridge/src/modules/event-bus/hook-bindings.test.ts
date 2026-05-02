import { describe, expect, test } from 'bun:test'
import { buildHookBindings, HOOK_NAMES } from './hook-bindings'
import type { Emitter } from './emitter'

type Captured = { kind: string; payload: unknown; opts?: unknown }

function captureEmitter(): { emitter: Emitter; captured: Captured[] } {
  const captured: Captured[] = []
  const emitter: Emitter = {
    emit: async (kind, payload, opts) => {
      captured.push({ kind, payload, opts })
    },
  }
  return { emitter, captured }
}

function fakeEvent(action: string, sessionKey: string, context: Record<string, unknown> = {}) {
  return {
    type: 'message',
    action,
    sessionKey,
    context,
    timestamp: new Date(),
    messages: [],
  }
}

describe('hook bindings', () => {
  test('all 5 hooks register a handler', () => {
    const { emitter } = captureEmitter()
    const bindings = buildHookBindings(emitter)
    expect(Object.keys(bindings).sort()).toEqual([...HOOK_NAMES].sort())
    for (const handler of Object.values(bindings)) {
      expect(typeof handler).toBe('function')
    }
  })

  test('message:received emits message.received with content_summary and speaker', async () => {
    const { emitter, captured } = captureEmitter()
    const bindings = buildHookBindings(emitter)
    await bindings['message:received'](
      fakeEvent('received', 'sess-1', { body: 'hello world', speaker: 'user' }),
    )
    expect(captured).toHaveLength(1)
    expect(captured[0]!.kind).toBe('message.received')
    expect((captured[0]!.payload as Record<string, unknown>).session_key).toBe('sess-1')
    expect((captured[0]!.payload as Record<string, unknown>).content_summary).toBe('hello world')
    expect((captured[0]!.payload as Record<string, unknown>).speaker).toBe('user')
    // content must NOT be set — verbosity is the envelope's responsibility
    expect((captured[0]!.payload as Record<string, unknown>).content).toBeUndefined()
  })

  test('message:received summarizes long bodies with ellipsis', async () => {
    const { emitter, captured } = captureEmitter()
    const bindings = buildHookBindings(emitter)
    const long = 'x'.repeat(200)
    await bindings['message:received'](
      fakeEvent('received', 'sess-1', { body: long, speaker: 'user' }),
    )
    const summary = (captured[0]!.payload as Record<string, unknown>).content_summary as string
    expect(summary.length).toBeLessThan(long.length)
    expect(summary.endsWith('…')).toBe(true)
  })

  test('message:sent defaults speaker to "assistant" when missing', async () => {
    const { emitter, captured } = captureEmitter()
    const bindings = buildHookBindings(emitter)
    await bindings['message:sent'](fakeEvent('sent', 'sess-1', { body: 'hi' }))
    expect(captured[0]!.kind).toBe('message.sent')
    expect((captured[0]!.payload as Record<string, unknown>).speaker).toBe('assistant')
  })

  test('session:compact:after emits with token counts from context', async () => {
    const { emitter, captured } = captureEmitter()
    const bindings = buildHookBindings(emitter)
    await bindings['session:compact:after'](
      fakeEvent('compact:after', 'sess-1', { before_tokens: 12_000, after_tokens: 4_000 }),
    )
    expect(captured[0]!.kind).toBe('session.compact.after')
    expect((captured[0]!.payload as Record<string, unknown>).before_tokens).toBe(12_000)
    expect((captured[0]!.payload as Record<string, unknown>).after_tokens).toBe(4_000)
  })

  test('session:compact:after also accepts camelCase context fields', async () => {
    const { emitter, captured } = captureEmitter()
    const bindings = buildHookBindings(emitter)
    await bindings['session:compact:after'](
      fakeEvent('compact:after', 'sess-1', { beforeTokens: 100, afterTokens: 50 }),
    )
    expect((captured[0]!.payload as Record<string, unknown>).before_tokens).toBe(100)
    expect((captured[0]!.payload as Record<string, unknown>).after_tokens).toBe(50)
  })

  test('command:new emits agent.bootstrap', async () => {
    const { emitter, captured } = captureEmitter()
    const bindings = buildHookBindings(emitter)
    await bindings['command:new'](fakeEvent('new', 'sess-1'))
    expect(captured[0]!.kind).toBe('agent.bootstrap')
    expect((captured[0]!.payload as Record<string, unknown>).session_key).toBe('sess-1')
  })

  test('agent:bootstrap emits agent.bootstrap', async () => {
    const { emitter, captured } = captureEmitter()
    const bindings = buildHookBindings(emitter)
    await bindings['agent:bootstrap'](fakeEvent('bootstrap', 'sess-1'))
    expect(captured[0]!.kind).toBe('agent.bootstrap')
    expect((captured[0]!.payload as Record<string, unknown>).session_key).toBe('sess-1')
  })
})
