import { afterAll, describe, expect, test } from 'bun:test'
import * as fs from 'node:fs/promises'
import * as os from 'node:os'
import * as path from 'node:path'
import {
  createInterceptor,
  evaluatePolicy,
  resolveOverride,
  type InterceptorAgentLookup,
  type InterceptorEmitFn,
} from './interceptor'
import { createApprovalQueue, type ApprovalQueue } from './approval-queue'
import type { AutonomyPolicy, PolicyLoader } from './policy'

const TMP_ROOT = path.join(
  os.tmpdir(),
  `kod-390-tests-${process.pid}-${Date.now().toString(36)}`,
)
let tmpCounter = 0
async function freshDir(): Promise<string> {
  tmpCounter += 1
  const dir = path.join(TMP_ROOT, `q-${tmpCounter}`)
  await fs.mkdir(dir, { recursive: true })
  return dir
}
afterAll(async () => {
  await fs.rm(TMP_ROOT, { recursive: true, force: true })
})

function silentLogger() {
  return { log: () => {}, warn: () => {}, error: () => {} }
}

const KODI_AGENT_ID = '11111111-1111-4111-8111-111111111111'
const OC_AGENT_ID = 'agent_oc1'
const USER_ID = '22222222-2222-4222-8222-222222222222'
const SESS = 'sess-1'

function fixedRegistry(opts?: {
  withoutKodiAgentId?: boolean
  unknown?: boolean
}): InterceptorAgentLookup {
  return {
    getByAgentId: (id) => {
      if (opts?.unknown) return undefined
      if (id !== OC_AGENT_ID) return undefined
      if (opts?.withoutKodiAgentId) {
        return { user_id: USER_ID }
      }
      return { user_id: USER_ID, kodi_agent_id: KODI_AGENT_ID }
    },
  }
}

function fixedLoader(policy: AutonomyPolicy): PolicyLoader {
  const cache = new Map<string, AutonomyPolicy>([[policy.agent_id, policy]])
  return {
    getPolicy: async (id) => cache.get(id) ?? policy,
    setPolicy: (p) => {
      cache.set(p.agent_id, p)
    },
    invalidate: (id) => {
      cache.delete(id)
    },
    invalidateAll: () => cache.clear(),
    list: () => [],
  }
}

function captureEmit(): {
  fn: InterceptorEmitFn
  calls: Array<{ kind: string; payload: Record<string, unknown>; agent?: unknown }>
} {
  const calls: Array<{ kind: string; payload: Record<string, unknown>; agent?: unknown }> = []
  return {
    calls,
    fn: (kind, payload, opts) => {
      calls.push({ kind, payload, agent: opts?.agent })
    },
  }
}

async function realQueue(): Promise<ApprovalQueue> {
  const dir = await freshDir()
  return createApprovalQueue({ stateDir: dir, logger: silentLogger() })
}

function policyOf(opts: Partial<AutonomyPolicy> = {}): AutonomyPolicy {
  return {
    agent_id: KODI_AGENT_ID,
    autonomy_level: 'normal',
    overrides: null,
    ...opts,
  }
}

describe('resolveOverride', () => {
  test('exact match wins over glob', () => {
    const out = resolveOverride(
      { 'gmail.*': 'allow', 'gmail.send_email': 'deny' },
      'gmail.send_email',
    )
    expect(out).toBe('deny')
  })

  test('longer glob wins over shorter', () => {
    const out = resolveOverride(
      { '*': 'allow', 'gmail.*': 'ask', 'gmail.send_*': 'deny' },
      'gmail.send_email',
    )
    expect(out).toBe('deny')
  })

  test('no match → null', () => {
    expect(resolveOverride({ 'github.*': 'ask' }, 'gmail.send_email')).toBeNull()
  })

  test('null overrides → null', () => {
    expect(resolveOverride(null, 'gmail.send')).toBeNull()
  })

  test('bare * matches everything (lowest specificity)', () => {
    const out = resolveOverride({ '*': 'deny' }, 'github.create_issue')
    expect(out).toBe('deny')
  })
})

describe('evaluatePolicy — level matrix (spec § 5.2)', () => {
  type Row = { level: AutonomyPolicy['autonomy_level']; tool: string; want: 'allow' | 'deny' | 'ask' }
  const rows: Row[] = [
    // strict → ask everywhere
    { level: 'strict', tool: 'GMAIL_LIST_MESSAGES', want: 'ask' },
    { level: 'strict', tool: 'GMAIL_DRAFT_REPLY', want: 'ask' },
    { level: 'strict', tool: 'GMAIL_SEND_EMAIL', want: 'ask' },
    { level: 'strict', tool: 'GMAIL_ADMIN_LIST', want: 'ask' },
    // normal → read/draft allow, write/admin ask
    { level: 'normal', tool: 'GMAIL_LIST_MESSAGES', want: 'allow' },
    { level: 'normal', tool: 'GMAIL_DRAFT_REPLY', want: 'allow' },
    { level: 'normal', tool: 'GMAIL_SEND_EMAIL', want: 'ask' },
    { level: 'normal', tool: 'GMAIL_ADMIN_LIST', want: 'ask' },
    // lenient → admin still asks; everything else allow
    { level: 'lenient', tool: 'GMAIL_LIST_MESSAGES', want: 'allow' },
    { level: 'lenient', tool: 'GMAIL_DRAFT_REPLY', want: 'allow' },
    { level: 'lenient', tool: 'GMAIL_SEND_EMAIL', want: 'allow' },
    { level: 'lenient', tool: 'GMAIL_ADMIN_LIST', want: 'ask' },
    // yolo → allow everywhere
    { level: 'yolo', tool: 'GMAIL_LIST_MESSAGES', want: 'allow' },
    { level: 'yolo', tool: 'GMAIL_SEND_EMAIL', want: 'allow' },
    { level: 'yolo', tool: 'GMAIL_ADMIN_LIST', want: 'allow' },
  ]
  for (const r of rows) {
    test(`${r.level} + ${r.tool} → ${r.want}`, () => {
      const cls =
        r.tool.includes('ADMIN') ? 'admin'
        : r.tool.includes('DRAFT') ? 'draft'
        : r.tool.includes('LIST') || r.tool.includes('GET') ? 'read'
        : 'write'
      expect(evaluatePolicy(policyOf({ autonomy_level: r.level }), r.tool, cls)).toBe(r.want)
    })
  }
})

describe('evaluatePolicy — overrides beat level', () => {
  test('lenient + slack.*=ask → ask for slack.send_message', () => {
    expect(
      evaluatePolicy(
        policyOf({ autonomy_level: 'lenient', overrides: { 'slack.*': 'ask' } }),
        'slack.send_message',
        'write',
      ),
    ).toBe('ask')
  })

  test('normal + gmail.send_email=allow → allow despite write class', () => {
    expect(
      evaluatePolicy(
        policyOf({
          autonomy_level: 'normal',
          overrides: { 'gmail.send_email': 'allow' },
        }),
        'gmail.send_email',
        'write',
      ),
    ).toBe('allow')
  })

  test('strict + tool override=allow → allow despite strict-asks-everything', () => {
    expect(
      evaluatePolicy(
        policyOf({ autonomy_level: 'strict', overrides: { 'gmail.list': 'allow' } }),
        'gmail.list',
        'read',
      ),
    ).toBe('allow')
  })
})

describe('createInterceptor — happy paths', () => {
  test('yolo: every call allowed; nothing emitted, nothing enqueued', async () => {
    const queue = await realQueue()
    const emit = captureEmit()
    const interceptor = createInterceptor({
      loader: fixedLoader(policyOf({ autonomy_level: 'yolo' })),
      queue,
      registry: fixedRegistry(),
      emit: emit.fn,
      logger: silentLogger(),
    })
    const out = await interceptor.handleBeforeToolCall(
      { toolName: 'GMAIL_SEND_EMAIL', params: { to: 'a@b.com' } },
      { agentId: OC_AGENT_ID, sessionKey: SESS, toolName: 'GMAIL_SEND_EMAIL' },
    )
    expect(out).toBeUndefined()
    expect(emit.calls).toHaveLength(0)
    expect((await queue.listPending()).length).toBe(0)
  })

  test('normal + read: allow', async () => {
    const queue = await realQueue()
    const emit = captureEmit()
    const interceptor = createInterceptor({
      loader: fixedLoader(policyOf({ autonomy_level: 'normal' })),
      queue,
      registry: fixedRegistry(),
      emit: emit.fn,
      logger: silentLogger(),
    })
    const out = await interceptor.handleBeforeToolCall(
      { toolName: 'GMAIL_LIST_MESSAGES', params: { limit: 10 } },
      { agentId: OC_AGENT_ID, sessionKey: SESS, toolName: 'GMAIL_LIST_MESSAGES' },
    )
    expect(out).toBeUndefined()
    expect(emit.calls).toHaveLength(0)
  })

  test('strict: every call enqueues for approval, emits tool.approval_requested', async () => {
    const queue = await realQueue()
    const emit = captureEmit()
    const interceptor = createInterceptor({
      loader: fixedLoader(policyOf({ autonomy_level: 'strict' })),
      queue,
      registry: fixedRegistry(),
      emit: emit.fn,
      idGenerator: () => 'req-strict-1',
      now: () => Date.parse('2026-05-03T10:00:00.000Z'),
      logger: silentLogger(),
    })
    const out = await interceptor.handleBeforeToolCall(
      { toolName: 'GMAIL_LIST_MESSAGES', params: { limit: 10 } },
      { agentId: OC_AGENT_ID, sessionKey: SESS, toolName: 'GMAIL_LIST_MESSAGES' },
    )
    expect(out).toEqual({
      block: true,
      blockReason: expect.stringContaining('queued for approval'),
    } as never)
    if (out && 'blockReason' in out) {
      expect(out.blockReason).toContain('req-strict-1')
    }
    expect(emit.calls).toHaveLength(1)
    expect(emit.calls[0]?.kind).toBe('tool.approval_requested')
    expect(emit.calls[0]?.payload).toMatchObject({
      request_id: 'req-strict-1',
      tool_name: 'GMAIL_LIST_MESSAGES',
      args: { limit: 10 },
      session_key: SESS,
      policy_level: 'strict',
    })
    expect(emit.calls[0]?.agent).toEqual({
      agent_id: KODI_AGENT_ID,
      openclaw_agent_id: OC_AGENT_ID,
      user_id: USER_ID,
    })
    const pending = await queue.listPending()
    expect(pending).toHaveLength(1)
    expect(pending[0]?.request_id).toBe('req-strict-1')
    expect(pending[0]?.tool_name).toBe('GMAIL_LIST_MESSAGES')
    expect(pending[0]?.args_json).toBe('{"limit":10}')
    // 24h default TTL
    const expiresMs =
      new Date(pending[0]!.expires_at).getTime() -
      new Date(pending[0]!.created_at).getTime()
    expect(expiresMs).toBe(24 * 60 * 60 * 1000)
  })

  test('normal + write tool: enqueue + emit', async () => {
    const queue = await realQueue()
    const emit = captureEmit()
    const interceptor = createInterceptor({
      loader: fixedLoader(policyOf({ autonomy_level: 'normal' })),
      queue,
      registry: fixedRegistry(),
      emit: emit.fn,
      idGenerator: () => 'req-normal-write',
      logger: silentLogger(),
    })
    const out = await interceptor.handleBeforeToolCall(
      { toolName: 'GMAIL_SEND_EMAIL', params: { to: 'a@b.com' } },
      { agentId: OC_AGENT_ID, sessionKey: SESS, toolName: 'GMAIL_SEND_EMAIL' },
    )
    expect(out && 'block' in out ? out.block : false).toBe(true)
    expect(emit.calls[0]?.kind).toBe('tool.approval_requested')
    expect((await queue.listPending())[0]?.request_id).toBe('req-normal-write')
  })

  test('override on lenient: slack.*=ask enqueues even though level allows', async () => {
    const queue = await realQueue()
    const emit = captureEmit()
    const interceptor = createInterceptor({
      loader: fixedLoader(
        policyOf({ autonomy_level: 'lenient', overrides: { 'slack.*': 'ask' } }),
      ),
      queue,
      registry: fixedRegistry(),
      emit: emit.fn,
      idGenerator: () => 'req-override',
      logger: silentLogger(),
    })
    const out = await interceptor.handleBeforeToolCall(
      { toolName: 'slack.send_message', params: { channel: '#general', text: 'hi' } },
      { agentId: OC_AGENT_ID, sessionKey: SESS, toolName: 'slack.send_message' },
    )
    expect(out && 'block' in out ? out.block : false).toBe(true)
    expect(emit.calls[0]?.kind).toBe('tool.approval_requested')
  })

  test('unknown tool name → treated as write → asks under normal', async () => {
    const queue = await realQueue()
    const emit = captureEmit()
    const interceptor = createInterceptor({
      loader: fixedLoader(policyOf({ autonomy_level: 'normal' })),
      queue,
      registry: fixedRegistry(),
      emit: emit.fn,
      idGenerator: () => 'req-unknown',
      logger: silentLogger(),
    })
    const out = await interceptor.handleBeforeToolCall(
      { toolName: 'GMAIL_FROBNICATE', params: {} },
      { agentId: OC_AGENT_ID, sessionKey: SESS, toolName: 'GMAIL_FROBNICATE' },
    )
    expect(out && 'block' in out ? out.block : false).toBe(true)
    expect(emit.calls[0]?.kind).toBe('tool.approval_requested')
  })
})

describe('createInterceptor — deny path', () => {
  test('override deny: emits tool.denied, does not enqueue', async () => {
    const queue = await realQueue()
    const emit = captureEmit()
    const interceptor = createInterceptor({
      loader: fixedLoader(
        policyOf({
          autonomy_level: 'normal',
          overrides: { 'gmail.merge_pr': 'deny' },
        }),
      ),
      queue,
      registry: fixedRegistry(),
      emit: emit.fn,
      logger: silentLogger(),
    })
    const out = await interceptor.handleBeforeToolCall(
      { toolName: 'gmail.merge_pr', params: {} },
      { agentId: OC_AGENT_ID, sessionKey: SESS, toolName: 'gmail.merge_pr' },
    )
    expect(out && 'block' in out ? out.block : false).toBe(true)
    if (out && 'blockReason' in out) expect(out.blockReason).toContain('autonomy_normal')
    expect(emit.calls).toHaveLength(1)
    expect(emit.calls[0]?.kind).toBe('tool.denied')
    expect(emit.calls[0]?.payload).toMatchObject({
      tool_name: 'gmail.merge_pr',
      policy_level: 'normal',
    })
    expect(await queue.listPending()).toHaveLength(0)
  })
})

describe('createInterceptor — failure paths', () => {
  test('missing agentId in ctx → fail closed', async () => {
    const queue = await realQueue()
    const emit = captureEmit()
    const interceptor = createInterceptor({
      loader: fixedLoader(policyOf()),
      queue,
      registry: fixedRegistry(),
      emit: emit.fn,
      logger: silentLogger(),
    })
    const out = await interceptor.handleBeforeToolCall(
      { toolName: 'GMAIL_LIST', params: {} },
      { toolName: 'GMAIL_LIST' },
    )
    expect(out && 'block' in out ? out.block : false).toBe(true)
    if (out && 'blockReason' in out) expect(out.blockReason).toContain('no_agent_context')
    expect(emit.calls).toHaveLength(0)
  })

  test('agent not in registry → fail closed', async () => {
    const queue = await realQueue()
    const emit = captureEmit()
    const interceptor = createInterceptor({
      loader: fixedLoader(policyOf()),
      queue,
      registry: fixedRegistry({ unknown: true }),
      emit: emit.fn,
      logger: silentLogger(),
    })
    const out = await interceptor.handleBeforeToolCall(
      { toolName: 'GMAIL_LIST', params: {} },
      { agentId: OC_AGENT_ID, sessionKey: SESS, toolName: 'GMAIL_LIST' },
    )
    expect(out && 'block' in out ? out.block : false).toBe(true)
    if (out && 'blockReason' in out) expect(out.blockReason).toContain('unknown_agent')
    expect(emit.calls).toHaveLength(0)
  })

  test('queue.enqueue rejects → fail closed, no approval_requested emitted', async () => {
    const failingQueue: ApprovalQueue = {
      enqueue: async () => {
        throw new Error('disk full')
      },
      get: async () => null,
      markResolved: async () => {},
      listPending: async () => [],
      sweepExpired: async () => [],
      start: () => {},
      stop: () => {},
      snapshot: () => [],
    }
    const emit = captureEmit()
    const interceptor = createInterceptor({
      loader: fixedLoader(policyOf({ autonomy_level: 'strict' })),
      queue: failingQueue,
      registry: fixedRegistry(),
      emit: emit.fn,
      logger: silentLogger(),
    })
    const out = await interceptor.handleBeforeToolCall(
      { toolName: 'GMAIL_LIST', params: {} },
      { agentId: OC_AGENT_ID, sessionKey: SESS, toolName: 'GMAIL_LIST' },
    )
    expect(out && 'block' in out ? out.block : false).toBe(true)
    if (out && 'blockReason' in out) expect(out.blockReason).toContain('enqueue_failed')
    expect(emit.calls).toHaveLength(0)
  })

  test('agent without kodi_agent_id: still works using openclaw runtime id, no agent envelope on emit', async () => {
    const queue = await realQueue()
    const emit = captureEmit()
    const interceptor = createInterceptor({
      // Loader returns the requested policy regardless of id — simulates
      // the default-policy fallback path.
      loader: fixedLoader(policyOf({ autonomy_level: 'strict' })),
      queue,
      registry: fixedRegistry({ withoutKodiAgentId: true }),
      emit: emit.fn,
      idGenerator: () => 'req-no-kodi',
      logger: silentLogger(),
    })
    const out = await interceptor.handleBeforeToolCall(
      { toolName: 'GMAIL_LIST', params: {} },
      { agentId: OC_AGENT_ID, sessionKey: SESS, toolName: 'GMAIL_LIST' },
    )
    expect(out && 'block' in out ? out.block : false).toBe(true)
    expect(emit.calls[0]?.kind).toBe('tool.approval_requested')
    expect(emit.calls[0]?.agent).toBeUndefined()
    const pending = await queue.listPending()
    expect(pending[0]?.agent_id).toBe(OC_AGENT_ID)
  })
})
