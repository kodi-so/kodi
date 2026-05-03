import { describe, expect, test } from 'bun:test'
import {
  decidePluginToolApproval,
  isPluginToolCallApproval,
  PLUGIN_TOOL_CALL_APPROVAL_TYPE,
  PLUGIN_TOOL_CALL_SUBJECT_TYPE,
  PluginToolApprovalError,
} from './plugin-tool-approvals'
import type { PushResult } from './openclaw/plugin-client'
import type { Instance } from '@kodi/db'

const ORG_ID = 'org-1'
const ROW_ID = 'row-1'
const REQ_ID = 'req-1'
const INSTANCE_ID = 'instance-1'
const USER_ID = 'user-1'
const NOW = Date.parse('2026-05-03T10:00:00.000Z')

const FAKE_INSTANCE: Instance = {
  id: INSTANCE_ID,
  orgId: ORG_ID,
  status: 'running',
  ec2InstanceId: null,
  ipAddress: null,
  hostname: null,
  instanceUrl: 'https://instance.local',
  gatewayToken: null,
  dnsRecordId: null,
  litellmCustomerId: null,
  litellmVirtualKey: null,
  errorMessage: null,
  sshUser: 'ubuntu',
  lastHealthCheck: null,
  pluginVersionInstalled: null,
  pluginHmacSecretEncrypted: null,
  lastPluginHeartbeatAt: null,
  bundleVersionTarget: null,
  createdAt: new Date(),
}

type ApprovalRow = {
  id: string
  orgId: string
  approvalType: string
  subjectType: string
  subjectId: string
  status: 'pending' | 'approved' | 'rejected' | 'expired'
  expiresAt: Date | null
  requestPayload: unknown
}

function pendingRow(overrides: Partial<ApprovalRow> = {}): ApprovalRow {
  return {
    id: ROW_ID,
    orgId: ORG_ID,
    approvalType: PLUGIN_TOOL_CALL_APPROVAL_TYPE,
    subjectType: PLUGIN_TOOL_CALL_SUBJECT_TYPE,
    subjectId: REQ_ID,
    status: 'pending',
    expiresAt: new Date(NOW + 24 * 60 * 60 * 1000),
    requestPayload: {
      request_id: REQ_ID,
      instance_id: INSTANCE_ID,
      tool_name: 'composio__agent_oc1__gmail__send_email',
      args: { to: 'a@b.com' },
    },
    ...overrides,
  }
}

function makeFakeDb(opts: {
  row?: ApprovalRow
  instance?: Instance | null
}): {
  db: any
  updates: Array<{ id: string; status: string }>
} {
  const updates: Array<{ id: string; status: string }> = []
  let currentRow = opts.row
  const fake = {
    query: {
      approvalRequests: {
        findFirst: async () => currentRow,
      },
      instances: {
        findFirst: async () => opts.instance ?? null,
      },
    },
    update: () => ({
      set: (patch: { status: string }) => ({
        where: async () => {
          if (currentRow) {
            currentRow = { ...currentRow, status: patch.status as any }
            updates.push({ id: currentRow.id, status: patch.status })
          }
        },
      }),
    }),
  }
  return { db: fake, updates }
}

function silentLogger() {
  return { log: () => {}, warn: () => {}, error: () => {} }
}

function pushFnReturning(result: PushResult): {
  fn: typeof import('./openclaw/plugin-client').pushApprovalsResolve
  calls: any[]
} {
  const calls: any[] = []
  return {
    calls,
    fn: (async (input: any) => {
      calls.push(input)
      return result
    }) as never,
  }
}

describe('isPluginToolCallApproval', () => {
  test('matches plugin-typed rows', () => {
    expect(
      isPluginToolCallApproval({
        approvalType: PLUGIN_TOOL_CALL_APPROVAL_TYPE,
        subjectType: PLUGIN_TOOL_CALL_SUBJECT_TYPE,
      }),
    ).toBe(true)
  })
  test('rejects existing meeting/tool-action rows', () => {
    expect(
      isPluginToolCallApproval({
        approvalType: 'tool_action_execution',
        subjectType: 'tool_action_run',
      }),
    ).toBe(false)
  })
})

describe('decidePluginToolApproval — happy paths', () => {
  test('approve: posts to plugin, marks row approved', async () => {
    const { db, updates } = makeFakeDb({
      row: pendingRow(),
      instance: FAKE_INSTANCE,
    })
    const push = pushFnReturning({ ok: true, status: 200, parsedBody: { status: 'resumed' } })
    const result = await decidePluginToolApproval({
      approvalRequestId: ROW_ID,
      orgId: ORG_ID,
      decidedByUserId: USER_ID,
      decision: 'approved',
      db,
      pushFn: push.fn,
      now: () => NOW,
      logger: silentLogger(),
    })
    expect(result.status).toBe('approved')
    expect(push.calls).toHaveLength(1)
    expect(push.calls[0].requestId).toBe(REQ_ID)
    expect(push.calls[0].body).toEqual({ approved: true })
    expect(updates).toEqual([{ id: ROW_ID, status: 'approved' }])
  })

  test('reject with reason: forwards reason in the body', async () => {
    const { db, updates } = makeFakeDb({
      row: pendingRow(),
      instance: FAKE_INSTANCE,
    })
    const push = pushFnReturning({ ok: true, status: 200 })
    const result = await decidePluginToolApproval({
      approvalRequestId: ROW_ID,
      orgId: ORG_ID,
      decidedByUserId: USER_ID,
      decision: 'rejected',
      reason: 'too risky',
      db,
      pushFn: push.fn,
      now: () => NOW,
      logger: silentLogger(),
    })
    expect(result.status).toBe('rejected')
    expect(push.calls[0].body).toEqual({ approved: false, reason: 'too risky' })
    expect(updates[0]?.status).toBe('rejected')
  })
})

describe('decidePluginToolApproval — already decided / expired', () => {
  test('already-decided: short-circuits, does not call plugin', async () => {
    const { db, updates } = makeFakeDb({
      row: pendingRow({ status: 'approved' }),
      instance: FAKE_INSTANCE,
    })
    const push = pushFnReturning({ ok: true, status: 200 })
    const result = await decidePluginToolApproval({
      approvalRequestId: ROW_ID,
      orgId: ORG_ID,
      decidedByUserId: USER_ID,
      decision: 'approved',
      db,
      pushFn: push.fn,
      now: () => NOW,
      logger: silentLogger(),
    })
    expect(result.status).toBe('already_decided')
    expect(push.calls).toHaveLength(0)
    expect(updates).toHaveLength(0)
  })

  test('row expired locally: marks expired, does not call plugin', async () => {
    const { db, updates } = makeFakeDb({
      row: pendingRow({ expiresAt: new Date(NOW - 1) }),
      instance: FAKE_INSTANCE,
    })
    const push = pushFnReturning({ ok: true, status: 200 })
    const result = await decidePluginToolApproval({
      approvalRequestId: ROW_ID,
      orgId: ORG_ID,
      decidedByUserId: USER_ID,
      decision: 'approved',
      db,
      pushFn: push.fn,
      now: () => NOW,
      logger: silentLogger(),
    })
    expect(result.status).toBe('expired')
    expect(push.calls).toHaveLength(0)
    expect(updates[0]?.status).toBe('expired')
  })

  test('plugin returns 410: marks expired', async () => {
    const { db, updates } = makeFakeDb({
      row: pendingRow(),
      instance: FAKE_INSTANCE,
    })
    const push = pushFnReturning({
      ok: false,
      status: 410,
      reason: 'http-error',
      error: 'gone',
    })
    const result = await decidePluginToolApproval({
      approvalRequestId: ROW_ID,
      orgId: ORG_ID,
      decidedByUserId: USER_ID,
      decision: 'approved',
      db,
      pushFn: push.fn,
      now: () => NOW,
      logger: silentLogger(),
    })
    expect(result.status).toBe('expired')
    expect(updates[0]?.status).toBe('expired')
  })

  test('plugin returns 404: marks expired (plugin lost the queue entry)', async () => {
    const { db, updates } = makeFakeDb({
      row: pendingRow(),
      instance: FAKE_INSTANCE,
    })
    const push = pushFnReturning({
      ok: false,
      status: 404,
      reason: 'http-error',
      error: 'not found',
    })
    const result = await decidePluginToolApproval({
      approvalRequestId: ROW_ID,
      orgId: ORG_ID,
      decidedByUserId: USER_ID,
      decision: 'rejected',
      db,
      pushFn: push.fn,
      now: () => NOW,
      logger: silentLogger(),
    })
    expect(result.status).toBe('expired')
    expect(updates[0]?.status).toBe('expired')
  })
})

describe('decidePluginToolApproval — failure paths', () => {
  test('row not found → throws NOT_FOUND', async () => {
    const { db } = makeFakeDb({ row: undefined, instance: FAKE_INSTANCE })
    await expect(
      decidePluginToolApproval({
        approvalRequestId: ROW_ID,
        orgId: ORG_ID,
        decidedByUserId: USER_ID,
        decision: 'approved',
        db,
        now: () => NOW,
        logger: silentLogger(),
      }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' })
  })

  test('wrong type → throws WRONG_TYPE', async () => {
    const { db } = makeFakeDb({
      row: pendingRow({
        approvalType: 'tool_action_execution',
        subjectType: 'tool_action_run',
      }),
      instance: FAKE_INSTANCE,
    })
    await expect(
      decidePluginToolApproval({
        approvalRequestId: ROW_ID,
        orgId: ORG_ID,
        decidedByUserId: USER_ID,
        decision: 'approved',
        db,
        now: () => NOW,
        logger: silentLogger(),
      }),
    ).rejects.toMatchObject({ code: 'WRONG_TYPE' })
  })

  test('instance no longer registered → throws INSTANCE_GONE', async () => {
    const { db } = makeFakeDb({ row: pendingRow(), instance: null })
    await expect(
      decidePluginToolApproval({
        approvalRequestId: ROW_ID,
        orgId: ORG_ID,
        decidedByUserId: USER_ID,
        decision: 'approved',
        db,
        now: () => NOW,
        logger: silentLogger(),
      }),
    ).rejects.toMatchObject({ code: 'INSTANCE_GONE' })
  })

  test('plugin call fails with non-404/410 → throws PLUGIN_CALL_FAILED', async () => {
    const { db } = makeFakeDb({ row: pendingRow(), instance: FAKE_INSTANCE })
    const push = pushFnReturning({
      ok: false,
      reason: 'request-failed',
      error: 'ECONNRESET',
    })
    await expect(
      decidePluginToolApproval({
        approvalRequestId: ROW_ID,
        orgId: ORG_ID,
        decidedByUserId: USER_ID,
        decision: 'approved',
        db,
        pushFn: push.fn,
        now: () => NOW,
        logger: silentLogger(),
      }),
    ).rejects.toMatchObject({ code: 'PLUGIN_CALL_FAILED' })
  })

  test('PluginToolApprovalError carries httpStatus', () => {
    const err = new PluginToolApprovalError('NOT_FOUND', 'gone', 404)
    expect(err.httpStatus).toBe(404)
    expect(err.code).toBe('NOT_FOUND')
  })
})
