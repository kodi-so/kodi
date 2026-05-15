import { afterAll, describe, expect, test } from 'bun:test'
import * as fs from 'node:fs/promises'
import * as os from 'node:os'
import * as path from 'node:path'
import {
  createApprovalsResolveHandler,
  parseApprovalsResolveBody,
  type ApprovalsEmitFn,
} from './approvals-resolve'
import {
  createApprovalQueue,
  type ApprovalQueue,
  type PendingApproval,
} from '../autonomy/approval-queue'
import { createResume, type SessionInjectFn } from '../autonomy/resume'
import { createAgentRegistry, type AgentRegistry } from '../agent-manager/registry'
import {
  buildComposioToolName,
  type ComposioModuleApi,
  type RunActionResult,
} from '../composio'

const TMP_ROOT = path.join(
  os.tmpdir(),
  `kod-391-tests-${process.pid}-${Date.now().toString(36)}`,
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
const OC_AGENT = 'agent_oc1'
const USER_ID = '22222222-2222-4222-8222-222222222222'
const SESS = 'sess-1'
const REQ_ID = 'req-001'
const TOOL = buildComposioToolName({
  openclaw_agent_id: OC_AGENT,
  toolkit: 'gmail',
  action: 'send_email',
})

const APPROVAL: Omit<PendingApproval, 'status'> = {
  request_id: REQ_ID,
  agent_id: KODI_AGENT_ID,
  session_key: SESS,
  tool_name: TOOL,
  args_json: '{"to":"a@b.com"}',
  created_at: '2026-05-03T10:00:00.000Z',
  expires_at: '2026-05-04T10:00:00.000Z',
}

async function seededQueue(): Promise<ApprovalQueue> {
  const dir = await freshDir()
  const q = await createApprovalQueue({
    stateDir: dir,
    logger: silentLogger(),
  })
  await q.enqueue(APPROVAL)
  return q
}

function seededRegistry(): AgentRegistry {
  const r = createAgentRegistry()
  r.add({
    user_id: USER_ID,
    openclaw_agent_id: OC_AGENT,
    workspace_dir: '/tmp/agent',
    kodi_agent_id: KODI_AGENT_ID,
    composio_status: 'active',
    created_at: '2026-05-03T10:00:00.000Z',
  })
  return r
}

function captureInject(opts?: { runId?: string }): {
  fn: SessionInjectFn
  calls: Array<{ sessionKey: string; message: string }>
} {
  const calls: Array<{ sessionKey: string; message: string }> = []
  return {
    calls,
    fn: async (params) => {
      calls.push(params)
      return { runId: opts?.runId ?? 'run-xyz' }
    },
  }
}

function captureEmit(): {
  fn: ApprovalsEmitFn
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
    fn: (kind, payload, opts) => {
      calls.push({ kind, payload, agent: opts?.agent })
    },
  }
}

function fixedComposio(opts?: {
  runResult?: RunActionResult
  runCalls?: Array<{ tool_name: string; params: Record<string, unknown>; user_id: string }>
}): ComposioModuleApi {
  const calls = opts?.runCalls ?? []
  return {
    registerToolsForAgent: async () => ({ status: 'active', registered_tool_count: 0 }),
    unregisterToolsForAgent: async () => {},
    runActionForAgent: async (input) => {
      calls.push(input)
      return opts?.runResult ?? { kind: 'ok', payload: { id: 'msg_1' } }
    },
  }
}

describe('parseApprovalsResolveBody', () => {
  test('accepts { approved: true }', () => {
    const r = parseApprovalsResolveBody({ approved: true })
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.value).toEqual({ approved: true })
  })
  test('accepts { approved: false, reason }', () => {
    const r = parseApprovalsResolveBody({ approved: false, reason: 'risky' })
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.value.reason).toBe('risky')
  })
  test('rejects non-object', () => {
    expect(parseApprovalsResolveBody('hi').ok).toBe(false)
    expect(parseApprovalsResolveBody(null).ok).toBe(false)
    expect(parseApprovalsResolveBody([]).ok).toBe(false)
  })
  test('rejects missing approved', () => {
    expect(parseApprovalsResolveBody({}).ok).toBe(false)
  })
  test('rejects non-boolean approved', () => {
    expect(parseApprovalsResolveBody({ approved: 'yes' }).ok).toBe(false)
  })
  test('rejects non-string reason', () => {
    expect(parseApprovalsResolveBody({ approved: false, reason: 42 }).ok).toBe(false)
  })
})

describe('createApprovalsResolveHandler — happy paths', () => {
  test('approve + tool runs ok: dispatcher called, resume called with payload, queue approved, audit emitted', async () => {
    const queue = await seededQueue()
    const registry = seededRegistry()
    const inject = captureInject({ runId: 'run-7' })
    const resume = createResume({
      queue,
      inject: inject.fn,
      logger: silentLogger(),
    })
    const runCalls: Array<{ tool_name: string; params: Record<string, unknown>; user_id: string }> = []
    const composio = fixedComposio({
      runResult: { kind: 'ok', payload: { id: 'msg_42' } },
      runCalls,
    })
    const emit = captureEmit()
    const handler = createApprovalsResolveHandler({
      queue,
      resume,
      composio,
      registry,
      emit: emit.fn,
      logger: silentLogger(),
    })

    const result = await handler(REQ_ID, { approved: true })
    expect(result.kind).toBe('ok')
    if (result.kind === 'ok') {
      expect(result.body.status).toBe('resumed')
      expect(result.body.run_id).toBe('run-7')
      expect(result.body.execution).toEqual({ status: 'ok' })
    }

    expect(runCalls).toEqual([
      { tool_name: TOOL, params: { to: 'a@b.com' }, user_id: USER_ID },
    ])
    expect(inject.calls).toHaveLength(1)
    expect(inject.calls[0]?.message).toContain('Approval granted')
    expect(inject.calls[0]?.message).toContain('msg_42')

    const after = await queue.get(REQ_ID)
    expect(after?.status).toBe('approved')

    // KOD-393 audit: approve+success emits BOTH tool.approval_resolved
    // AND tool.invoke.after (the deferred re-run bypasses the SDK's
    // after_tool_call hook so we emit it manually).
    expect(emit.calls).toHaveLength(2)
    expect(emit.calls[0]?.kind).toBe('tool.approval_resolved')
    expect(emit.calls[0]?.payload).toEqual({ request_id: REQ_ID, approved: true })
    expect(emit.calls[0]?.agent).toEqual({
      agent_id: KODI_AGENT_ID,
      openclaw_agent_id: OC_AGENT,
      user_id: USER_ID,
    })
    expect(emit.calls[1]?.kind).toBe('tool.invoke.after')
    expect(emit.calls[1]?.payload).toMatchObject({
      tool_name: TOOL,
      outcome: 'ok',
    })
    expect(typeof emit.calls[1]?.payload.duration_ms).toBe('number')
    expect(emit.calls[1]?.agent).toEqual({
      agent_id: KODI_AGENT_ID,
      openclaw_agent_id: OC_AGENT,
      user_id: USER_ID,
    })
  })

  test('approve + tool fails: still resume with failure description, queue still approved, audit emitted', async () => {
    const queue = await seededQueue()
    const registry = seededRegistry()
    const inject = captureInject()
    const resume = createResume({
      queue,
      inject: inject.fn,
      logger: silentLogger(),
    })
    const composio = fixedComposio({
      runResult: { kind: 'failed', reason: 'dispatch_failed', message: 'OAuth expired' },
    })
    const emit = captureEmit()
    const handler = createApprovalsResolveHandler({
      queue,
      resume,
      composio,
      registry,
      emit: emit.fn,
      logger: silentLogger(),
    })

    const result = await handler(REQ_ID, { approved: true })
    expect(result.kind).toBe('ok')
    if (result.kind === 'ok') {
      expect(result.body.status).toBe('resumed')
      expect(result.body.execution).toEqual({
        status: 'failed',
        reason: 'dispatch_failed: OAuth expired',
      })
    }
    // The agent gets a message describing the failure path so the user
    // isn't left in the dark.
    expect(inject.calls[0]?.message).toContain('Approval granted')
    expect(inject.calls[0]?.message).toContain('OAuth expired')

    const after = await queue.get(REQ_ID)
    expect(after?.status).toBe('approved')

    // approval_resolved + tool.invoke.after with outcome=error.
    expect(emit.calls).toHaveLength(2)
    expect(emit.calls[0]?.kind).toBe('tool.approval_resolved')
    expect(emit.calls[1]?.kind).toBe('tool.invoke.after')
    expect(emit.calls[1]?.payload).toMatchObject({
      tool_name: TOOL,
      outcome: 'error',
      error: 'dispatch_failed: OAuth expired',
    })
  })

  test('deny: no tool run, resume called with deny, queue marked denied', async () => {
    const queue = await seededQueue()
    const registry = seededRegistry()
    const inject = captureInject()
    const resume = createResume({
      queue,
      inject: inject.fn,
      logger: silentLogger(),
    })
    const runCalls: Array<{ tool_name: string; params: Record<string, unknown>; user_id: string }> = []
    const composio = fixedComposio({ runCalls })
    const emit = captureEmit()
    const handler = createApprovalsResolveHandler({
      queue,
      resume,
      composio,
      registry,
      emit: emit.fn,
      logger: silentLogger(),
    })

    const result = await handler(REQ_ID, { approved: false, reason: 'too risky' })
    expect(result.kind).toBe('ok')
    if (result.kind === 'ok') {
      expect(result.body.status).toBe('resumed')
      expect(result.body.execution).toEqual({ status: 'skipped' })
    }
    expect(runCalls).toHaveLength(0)
    expect(inject.calls[0]?.message).toContain('Approval denied')
    expect(inject.calls[0]?.message).toContain('too risky')

    const after = await queue.get(REQ_ID)
    expect(after?.status).toBe('denied')
    expect(after?.resolution_reason).toBe('too risky')

    expect(emit.calls[0]?.payload).toEqual({
      request_id: REQ_ID,
      approved: false,
      reason: 'too risky',
    })
  })
})

describe('createApprovalsResolveHandler — failure paths', () => {
  test('unknown request_id → notFound', async () => {
    const queue = await seededQueue()
    const registry = seededRegistry()
    const resume = createResume({
      queue,
      inject: captureInject().fn,
      logger: silentLogger(),
    })
    const composio = fixedComposio()
    const emit = captureEmit()
    const handler = createApprovalsResolveHandler({
      queue,
      resume,
      composio,
      registry,
      emit: emit.fn,
      logger: silentLogger(),
    })
    const result = await handler('does-not-exist', { approved: true })
    expect(result).toEqual({ kind: 'notFound' })
    expect(emit.calls).toHaveLength(0)
  })

  test('expired request_id → gone (410)', async () => {
    const queue = await seededQueue()
    await queue.markResolved(REQ_ID, 'expired', 'sweep')
    const registry = seededRegistry()
    const resume = createResume({
      queue,
      inject: captureInject().fn,
      logger: silentLogger(),
    })
    const composio = fixedComposio()
    const emit = captureEmit()
    const handler = createApprovalsResolveHandler({
      queue,
      resume,
      composio,
      registry,
      emit: emit.fn,
      logger: silentLogger(),
    })
    const result = await handler(REQ_ID, { approved: true })
    expect(result).toEqual({ kind: 'gone' })
    expect(emit.calls).toHaveLength(0)
  })

  test('already-resolved (approved): idempotent 200, no side effects', async () => {
    const queue = await seededQueue()
    await queue.markResolved(REQ_ID, 'approved')
    const registry = seededRegistry()
    const inject = captureInject()
    const resume = createResume({
      queue,
      inject: inject.fn,
      logger: silentLogger(),
    })
    const runCalls: Array<{ tool_name: string; params: Record<string, unknown>; user_id: string }> = []
    const composio = fixedComposio({ runCalls })
    const emit = captureEmit()
    const handler = createApprovalsResolveHandler({
      queue,
      resume,
      composio,
      registry,
      emit: emit.fn,
      logger: silentLogger(),
    })
    const result = await handler(REQ_ID, { approved: true })
    expect(result.kind).toBe('ok')
    if (result.kind === 'ok') {
      expect(result.body.status).toBe('already_resolved')
    }
    expect(runCalls).toHaveLength(0)
    expect(inject.calls).toHaveLength(0)
    expect(emit.calls).toHaveLength(0)
  })

  test('badRequest body: returns badRequest', async () => {
    const queue = await seededQueue()
    const registry = seededRegistry()
    const resume = createResume({
      queue,
      inject: captureInject().fn,
      logger: silentLogger(),
    })
    const composio = fixedComposio()
    const emit = captureEmit()
    const handler = createApprovalsResolveHandler({
      queue,
      resume,
      composio,
      registry,
      emit: emit.fn,
      logger: silentLogger(),
    })
    const result = await handler(REQ_ID, { approved: 'yes' as never })
    expect(result.kind).toBe('badRequest')
  })

  test('approve when registry has no entry: skips execution + resumes with failure, queue still approved', async () => {
    const queue = await seededQueue()
    // empty registry
    const registry = createAgentRegistry()
    const inject = captureInject()
    const resume = createResume({
      queue,
      inject: inject.fn,
      logger: silentLogger(),
    })
    const composio = fixedComposio()
    const emit = captureEmit()
    const handler = createApprovalsResolveHandler({
      queue,
      resume,
      composio,
      registry,
      emit: emit.fn,
      logger: silentLogger(),
    })
    const result = await handler(REQ_ID, { approved: true })
    expect(result.kind).toBe('ok')
    if (result.kind === 'ok') {
      expect(result.body.execution?.status).toBe('failed')
    }
    expect(inject.calls[0]?.message).toContain('could not run')
    const after = await queue.get(REQ_ID)
    expect(after?.status).toBe('approved')
  })

  test('resume orphan path: returns kind ok status orphaned, audit still emitted', async () => {
    const queue = await seededQueue()
    const registry = seededRegistry()
    const failingInject: SessionInjectFn = async () => {
      throw new Error('session gone')
    }
    const resume = createResume({
      queue,
      inject: failingInject,
      sleep: async () => {},
      logger: silentLogger(),
    })
    const composio = fixedComposio()
    const emit = captureEmit()
    const handler = createApprovalsResolveHandler({
      queue,
      resume,
      composio,
      registry,
      emit: emit.fn,
      logger: silentLogger(),
    })
    const result = await handler(REQ_ID, { approved: true })
    expect(result.kind).toBe('ok')
    if (result.kind === 'ok') expect(result.body.status).toBe('orphaned')
    // approval_resolved + tool.invoke.after — both emitted regardless
    // of resume orphan outcome (audit is independent of agent reach).
    expect(emit.calls).toHaveLength(2)
    expect(emit.calls[0]?.kind).toBe('tool.approval_resolved')
    expect(emit.calls[1]?.kind).toBe('tool.invoke.after')
    const after = await queue.get(REQ_ID)
    expect(after?.status).toBe('orphaned')
  })
})
