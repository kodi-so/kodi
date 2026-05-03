import { afterAll, describe, expect, test } from 'bun:test'
import * as fs from 'node:fs/promises'
import * as os from 'node:os'
import * as path from 'node:path'
import {
  composeApprovalMessage,
  createResume,
  type SessionInjectFn,
} from './resume'
import {
  createApprovalQueue,
  type ApprovalQueue,
  type PendingApproval,
} from './approval-queue'

const TMP_ROOT = path.join(
  os.tmpdir(),
  `kod-416-tests-${process.pid}-${Date.now().toString(36)}`,
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

const APPROVAL: Omit<PendingApproval, 'status'> = {
  request_id: 'req-1',
  agent_id: 'agent-1',
  session_key: 'sess-abc',
  tool_name: 'gmail__send_email',
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

function captureInject(opts?: { rejectsTimes?: number; runId?: string }): {
  fn: SessionInjectFn
  calls: Array<{ sessionKey: string; message: string }>
} {
  const calls: Array<{ sessionKey: string; message: string }> = []
  let rejectsLeft = opts?.rejectsTimes ?? 0
  return {
    calls,
    fn: async (params) => {
      calls.push(params)
      if (rejectsLeft > 0) {
        rejectsLeft -= 1
        throw new Error('inject rejected')
      }
      return { runId: opts?.runId ?? 'run-xyz' }
    },
  }
}

describe('composeApprovalMessage', () => {
  const approval: PendingApproval = { ...APPROVAL, status: 'pending' }

  test('approved + result string is included', () => {
    const out = composeApprovalMessage(approval, {
      request_id: 'req-1',
      approved: true,
      result: 'message-id-123',
    })
    expect(out).toContain('Approval granted')
    expect(out).toContain('gmail__send_email')
    expect(out).toContain('message-id-123')
  })

  test('approved + result object is JSON-stringified', () => {
    const out = composeApprovalMessage(approval, {
      request_id: 'req-1',
      approved: true,
      result: { id: 'msg_42', status: 'sent' },
    })
    expect(out).toContain('"id":"msg_42"')
  })

  test('approved + no result → ran successfully', () => {
    const out = composeApprovalMessage(approval, {
      request_id: 'req-1',
      approved: true,
    })
    expect(out).toContain('ran successfully')
  })

  test('denied includes the reason and tool name', () => {
    const out = composeApprovalMessage(approval, {
      request_id: 'req-1',
      approved: false,
      reason: 'too risky right now',
    })
    expect(out).toContain('Approval denied')
    expect(out).toContain('too risky right now')
    expect(out).toContain('gmail__send_email')
  })

  test('denied without reason has a default phrase', () => {
    const out = composeApprovalMessage(approval, {
      request_id: 'req-1',
      approved: false,
    })
    expect(out).toContain('no reason given')
  })

  test('long result is truncated to ~500 chars', () => {
    const huge = 'x'.repeat(2000)
    const out = composeApprovalMessage(approval, {
      request_id: 'req-1',
      approved: true,
      result: huge,
    })
    expect(out.length).toBeLessThan(700)
    expect(out).toContain('truncated')
  })
})

describe('createResume — happy paths', () => {
  test('approve: injects message, marks approved, returns runId', async () => {
    const queue = await seededQueue()
    const inject = captureInject({ runId: 'run-7' })
    const resume = createResume({
      queue,
      inject: inject.fn,
      logger: silentLogger(),
    })
    const result = await resume.resumeAgentAfterApproval({
      request_id: 'req-1',
      approved: true,
      result: { id: 'msg-7' },
    })
    expect(result.kind).toBe('resumed')
    if (result.kind === 'resumed') expect(result.runId).toBe('run-7')

    expect(inject.calls).toHaveLength(1)
    expect(inject.calls[0]?.sessionKey).toBe('sess-abc')
    expect(inject.calls[0]?.message).toContain('Approval granted')

    const after = await queue.get('req-1')
    expect(after?.status).toBe('approved')
  })

  test('deny: injects deny message, marks denied with reason', async () => {
    const queue = await seededQueue()
    const inject = captureInject()
    const resume = createResume({
      queue,
      inject: inject.fn,
      logger: silentLogger(),
    })
    const result = await resume.resumeAgentAfterApproval({
      request_id: 'req-1',
      approved: false,
      reason: 'looks risky',
    })
    expect(result.kind).toBe('resumed')
    expect(inject.calls[0]?.message).toContain('Approval denied')
    expect(inject.calls[0]?.message).toContain('looks risky')

    const after = await queue.get('req-1')
    expect(after?.status).toBe('denied')
    expect(after?.resolution_reason).toBe('looks risky')
  })
})

describe('createResume — failure paths', () => {
  test('unknown request_id returns orphaned without injecting', async () => {
    const queue = await seededQueue()
    const inject = captureInject()
    const resume = createResume({
      queue,
      inject: inject.fn,
      logger: silentLogger(),
    })
    const result = await resume.resumeAgentAfterApproval({
      request_id: 'nope',
      approved: true,
    })
    expect(result).toEqual({ kind: 'orphaned', reason: 'unknown_request_id' })
    expect(inject.calls).toHaveLength(0)
  })

  test('inject fails on first attempt then succeeds: retries with backoff, returns resumed', async () => {
    const queue = await seededQueue()
    const inject = captureInject({ rejectsTimes: 2, runId: 'run-after-retry' })
    const sleeps: number[] = []
    const resume = createResume({
      queue,
      inject: inject.fn,
      sleep: async (ms) => {
        sleeps.push(ms)
      },
      logger: silentLogger(),
    })
    const result = await resume.resumeAgentAfterApproval({
      request_id: 'req-1',
      approved: true,
    })
    expect(result.kind).toBe('resumed')
    if (result.kind === 'resumed') expect(result.runId).toBe('run-after-retry')
    expect(inject.calls).toHaveLength(3)
    expect(sleeps).toEqual([250, 500])
    expect((await queue.get('req-1'))?.status).toBe('approved')
  })

  test('inject fails all retries: marks orphaned + fires onOrphan', async () => {
    const queue = await seededQueue()
    const inject: SessionInjectFn = async () => {
      throw new Error('session gone')
    }
    const orphans: PendingApproval[] = []
    const resume = createResume({
      queue,
      inject,
      sleep: async () => {},
      onOrphan: async (entry) => {
        orphans.push(entry)
      },
      logger: silentLogger(),
    })
    const result = await resume.resumeAgentAfterApproval({
      request_id: 'req-1',
      approved: true,
    })
    expect(result).toEqual({ kind: 'orphaned', reason: 'session_unreachable' })
    expect(orphans).toHaveLength(1)
    expect(orphans[0]?.request_id).toBe('req-1')

    const after = await queue.get('req-1')
    expect(after?.status).toBe('orphaned')
    expect(after?.resolution_reason).toContain('inject_failed')
    expect(after?.resolution_reason).toContain('session gone')
  })

  test('orphan: onOrphan throwing does not break the function', async () => {
    const queue = await seededQueue()
    const inject: SessionInjectFn = async () => {
      throw new Error('boom')
    }
    const resume = createResume({
      queue,
      inject,
      sleep: async () => {},
      onOrphan: async () => {
        throw new Error('emit failed')
      },
      logger: silentLogger(),
    })
    const result = await resume.resumeAgentAfterApproval({
      request_id: 'req-1',
      approved: true,
    })
    expect(result.kind).toBe('orphaned')
  })

  test('respects maxRetries override (1 = no retries)', async () => {
    const queue = await seededQueue()
    const inject = captureInject({ rejectsTimes: 5 })
    const sleeps: number[] = []
    const resume = createResume({
      queue,
      inject: inject.fn,
      maxRetries: 1,
      sleep: async (ms) => {
        sleeps.push(ms)
      },
      logger: silentLogger(),
    })
    const result = await resume.resumeAgentAfterApproval({
      request_id: 'req-1',
      approved: true,
    })
    expect(result.kind).toBe('orphaned')
    expect(inject.calls).toHaveLength(1)
    expect(sleeps).toHaveLength(0)
  })
})
