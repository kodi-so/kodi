import { afterAll, beforeEach, describe, expect, test } from 'bun:test'
import * as fs from 'node:fs/promises'
import * as os from 'node:os'
import * as path from 'node:path'
import {
  createApprovalQueue,
  type PendingApproval,
} from './approval-queue'

const TMP_ROOT = path.join(
  os.tmpdir(),
  `kod-415-tests-${process.pid}-${Date.now().toString(36)}`,
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

beforeEach(() => {
  // No-op; per-test isolation is the freshDir() helper.
})

function silentLogger() {
  return { log: () => {}, warn: () => {}, error: () => {} }
}

function approvalFor(opts: {
  request_id: string
  expires_at?: string
}): Omit<PendingApproval, 'status'> {
  return {
    request_id: opts.request_id,
    agent_id: 'agent-1',
    session_key: 'sess-abc',
    tool_name: 'gmail__send_email',
    args_json: '{"to":"a@b.com"}',
    created_at: '2026-05-03T10:00:00.000Z',
    expires_at: opts.expires_at ?? '2026-05-03T11:00:00.000Z',
  }
}

describe('createApprovalQueue — basic CRUD', () => {
  test('enqueue → get returns the entry with status pending', async () => {
    const dir = await freshDir()
    const q = await createApprovalQueue({
      stateDir: dir,
      logger: silentLogger(),
    })
    await q.enqueue(approvalFor({ request_id: 'req-1' }))
    const got = await q.get('req-1')
    expect(got).not.toBeNull()
    expect(got?.status).toBe('pending')
    expect(got?.tool_name).toBe('gmail__send_email')
  })

  test('get(unknown) returns null', async () => {
    const q = await createApprovalQueue({
      stateDir: await freshDir(),
      logger: silentLogger(),
    })
    expect(await q.get('nope')).toBeNull()
  })

  test('listPending only returns status=pending entries', async () => {
    const q = await createApprovalQueue({
      stateDir: await freshDir(),
      logger: silentLogger(),
    })
    await q.enqueue(approvalFor({ request_id: 'r1' }))
    await q.enqueue(approvalFor({ request_id: 'r2' }))
    await q.markResolved('r1', 'approved', 'user clicked yes')
    const pending = await q.listPending()
    expect(pending.map((p) => p.request_id)).toEqual(['r2'])
  })

  test('markResolved sets status + resolved_at + reason', async () => {
    const q = await createApprovalQueue({
      stateDir: await freshDir(),
      now: () => Date.parse('2026-05-03T12:00:00.000Z'),
      logger: silentLogger(),
    })
    await q.enqueue(approvalFor({ request_id: 'r1' }))
    await q.markResolved('r1', 'denied', 'too risky')
    const got = await q.get('r1')
    expect(got?.status).toBe('denied')
    expect(got?.resolved_at).toBe('2026-05-03T12:00:00.000Z')
    expect(got?.resolution_reason).toBe('too risky')
  })

  test('markResolved on unknown id is idempotent (no throw)', async () => {
    const q = await createApprovalQueue({
      stateDir: await freshDir(),
      logger: silentLogger(),
    })
    await expect(q.markResolved('nope', 'approved')).resolves.toBeUndefined()
  })

  test('markResolved on already-resolved id is idempotent', async () => {
    const q = await createApprovalQueue({
      stateDir: await freshDir(),
      logger: silentLogger(),
    })
    await q.enqueue(approvalFor({ request_id: 'r1' }))
    await q.markResolved('r1', 'approved')
    const before = await q.get('r1')
    await q.markResolved('r1', 'denied') // should be a no-op
    const after = await q.get('r1')
    expect(after?.status).toBe(before?.status)
    expect(after?.status).toBe('approved')
  })

  test('duplicate enqueue is a logged no-op', async () => {
    const q = await createApprovalQueue({
      stateDir: await freshDir(),
      logger: silentLogger(),
    })
    await q.enqueue(approvalFor({ request_id: 'r1' }))
    await q.enqueue(approvalFor({ request_id: 'r1' }))
    expect(q.snapshot()).toHaveLength(1)
  })
})

describe('createApprovalQueue — durable across restart', () => {
  test('enqueue → restart → get works', async () => {
    const dir = await freshDir()
    const q1 = await createApprovalQueue({
      stateDir: dir,
      logger: silentLogger(),
    })
    await q1.enqueue(approvalFor({ request_id: 'r1' }))
    await q1.enqueue(approvalFor({ request_id: 'r2' }))

    const q2 = await createApprovalQueue({
      stateDir: dir,
      logger: silentLogger(),
    })
    expect(await q2.get('r1')).not.toBeNull()
    expect(await q2.get('r2')).not.toBeNull()
  })

  test('markResolved persists across restart', async () => {
    const dir = await freshDir()
    const q1 = await createApprovalQueue({
      stateDir: dir,
      logger: silentLogger(),
    })
    await q1.enqueue(approvalFor({ request_id: 'r1' }))
    await q1.markResolved('r1', 'approved', 'ok')

    const q2 = await createApprovalQueue({
      stateDir: dir,
      logger: silentLogger(),
    })
    const got = await q2.get('r1')
    expect(got?.status).toBe('approved')
    expect(got?.resolution_reason).toBe('ok')
  })

  test('mixed history (multi-enqueue + resolve) replays correctly', async () => {
    const dir = await freshDir()
    const q1 = await createApprovalQueue({ stateDir: dir, logger: silentLogger() })
    await q1.enqueue(approvalFor({ request_id: 'r1' }))
    await q1.enqueue(approvalFor({ request_id: 'r2' }))
    await q1.enqueue(approvalFor({ request_id: 'r3' }))
    await q1.markResolved('r2', 'denied')

    const q2 = await createApprovalQueue({ stateDir: dir, logger: silentLogger() })
    expect((await q2.listPending()).map((e) => e.request_id).sort()).toEqual([
      'r1',
      'r3',
    ])
    expect((await q2.get('r2'))?.status).toBe('denied')
  })

  test('malformed lines are skipped on replay', async () => {
    const dir = await freshDir()
    const q1 = await createApprovalQueue({ stateDir: dir, logger: silentLogger() })
    await q1.enqueue(approvalFor({ request_id: 'r1' }))
    // Corrupt the tail with a bogus line
    await fs.appendFile(
      path.join(dir, 'approvals.jsonl'),
      'not-valid-json\n',
      'utf8',
    )
    await q1.enqueue(approvalFor({ request_id: 'r2' }))

    const q2 = await createApprovalQueue({ stateDir: dir, logger: silentLogger() })
    expect(await q2.get('r1')).not.toBeNull()
    expect(await q2.get('r2')).not.toBeNull()
  })

  test('completely unreadable file is rotated aside, queue starts fresh', async () => {
    const dir = await freshDir()
    const file = path.join(dir, 'approvals.jsonl')
    // Make it a directory so reading the file fails with EISDIR.
    await fs.mkdir(file)

    const q = await createApprovalQueue({
      stateDir: dir,
      logger: silentLogger(),
    })
    expect((q as { recovered: boolean }).recovered).toBe(true)
    // After rotation the path is renamed away; queue starts fresh
    expect(q.snapshot()).toEqual([])
  })
})

describe('createApprovalQueue — sweep', () => {
  test('sweepExpired marks past-due pending entries as expired', async () => {
    const dir = await freshDir()
    const q = await createApprovalQueue({
      stateDir: dir,
      now: () => Date.parse('2026-05-03T12:00:00.000Z'),
      logger: silentLogger(),
    })
    await q.enqueue(
      approvalFor({
        request_id: 'r-old',
        expires_at: '2026-05-03T11:00:00.000Z', // past
      }),
    )
    await q.enqueue(
      approvalFor({
        request_id: 'r-future',
        expires_at: '2026-05-03T13:00:00.000Z', // not yet
      }),
    )
    const swept = await q.sweepExpired()
    expect(swept.map((e) => e.request_id)).toEqual(['r-old'])
    expect((await q.get('r-old'))?.status).toBe('expired')
    expect((await q.get('r-future'))?.status).toBe('pending')
  })

  test('sweepExpired ignores already-resolved entries', async () => {
    const dir = await freshDir()
    const q = await createApprovalQueue({
      stateDir: dir,
      now: () => Date.parse('2026-05-03T12:00:00.000Z'),
      logger: silentLogger(),
    })
    await q.enqueue(
      approvalFor({
        request_id: 'r1',
        expires_at: '2026-05-03T10:00:00.000Z',
      }),
    )
    await q.markResolved('r1', 'approved')
    const swept = await q.sweepExpired()
    expect(swept).toEqual([])
    expect((await q.get('r1'))?.status).toBe('approved')
  })

  test('start/stop timer fires sweep on interval', async () => {
    const dir = await freshDir()
    let virtualNow = Date.parse('2026-05-03T12:00:00.000Z')
    const q = await createApprovalQueue({
      stateDir: dir,
      sweepIntervalMs: 10,
      now: () => virtualNow,
      logger: silentLogger(),
    })
    await q.enqueue(
      approvalFor({
        request_id: 'r-old',
        expires_at: '2026-05-03T11:00:00.000Z',
      }),
    )
    const expiredCalls: string[] = []
    q.start((entry) => {
      expiredCalls.push(entry.request_id)
    })
    // Wait a couple of ticks
    await new Promise((r) => setTimeout(r, 50))
    q.stop()
    expect(expiredCalls).toContain('r-old')
  })
})

describe('createApprovalQueue — concurrency', () => {
  test('100 concurrent enqueues all land', async () => {
    const dir = await freshDir()
    const q = await createApprovalQueue({
      stateDir: dir,
      logger: silentLogger(),
    })
    const ids = Array.from({ length: 100 }, (_, i) => `req-${i}`)
    await Promise.all(
      ids.map((request_id) => q.enqueue(approvalFor({ request_id }))),
    )
    expect((await q.listPending()).length).toBe(100)

    // And the file replay sees all 100
    const q2 = await createApprovalQueue({
      stateDir: dir,
      logger: silentLogger(),
    })
    expect((await q2.listPending()).length).toBe(100)
  })

  test('interleaved enqueue + markResolved is consistent', async () => {
    const dir = await freshDir()
    const q = await createApprovalQueue({
      stateDir: dir,
      logger: silentLogger(),
    })
    const ops: Promise<void>[] = []
    for (let i = 0; i < 20; i++) {
      ops.push(q.enqueue(approvalFor({ request_id: `r-${i}` })))
    }
    await Promise.all(ops)
    const resolves: Promise<void>[] = []
    for (let i = 0; i < 10; i++) {
      resolves.push(q.markResolved(`r-${i}`, 'approved'))
    }
    await Promise.all(resolves)

    const q2 = await createApprovalQueue({
      stateDir: dir,
      logger: silentLogger(),
    })
    const pending = await q2.listPending()
    expect(pending.length).toBe(10)
    expect(pending.map((e) => e.request_id).sort()).toEqual(
      Array.from({ length: 10 }, (_, i) => `r-${i + 10}`).sort(),
    )
  })
})
