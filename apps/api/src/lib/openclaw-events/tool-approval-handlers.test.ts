import { describe, expect, test } from 'bun:test'
import type { EventEnvelope } from '@kodi/shared/events'
import type { Instance } from '@kodi/db'
import {
  createToolApprovalRequestedHandler,
  PLUGIN_TOOL_CALL_APPROVAL_TYPE,
  PLUGIN_TOOL_CALL_SUBJECT_TYPE,
} from './tool-approval-handlers'

const ORG_ID = '00000000-0000-4000-8000-000000000001'
const INSTANCE_ID = '00000000-0000-4000-8000-000000000002'
const USER_ID = '00000000-0000-4000-8000-000000000003'
const KODI_AGENT_ID = '00000000-0000-4000-8000-000000000004'
const REQUEST_ID = '00000000-0000-4000-8000-000000000005'
const IDEM = '00000000-0000-4000-8000-000000000006'
const NOW = Date.parse('2026-05-03T10:00:00.000Z')

const FAKE_INSTANCE: Instance = {
  id: INSTANCE_ID,
  orgId: ORG_ID,
  status: 'running',
  ec2InstanceId: null,
  ipAddress: null,
  hostname: null,
  instanceUrl: null,
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

function envelopeFor(payload: unknown, opts?: { withAgent?: boolean }): EventEnvelope {
  return {
    protocol: 'kodi-bridge.v1',
    plugin_version: '2026-04-21-abc1234',
    instance: { instance_id: INSTANCE_ID, org_id: ORG_ID },
    ...(opts?.withAgent
      ? {
          agent: {
            agent_id: KODI_AGENT_ID,
            openclaw_agent_id: 'agent_oc1',
            user_id: USER_ID,
          },
        }
      : {}),
    event: {
      kind: 'tool.approval_requested',
      verbosity: 'full',
      occurred_at: '2026-05-03T10:00:00.000Z',
      idempotency_key: IDEM,
      payload,
    },
  }
}

type InsertedRow = {
  orgId: string
  approvalType: string
  subjectType: string
  subjectId: string
  toolkitSlug: string | null
  action: string | null
  actionCategory: string | null
  expiresAt: Date | null
  requestPayload: unknown
  previewPayload: unknown
  requestedByUserId: string | null
}

function makeFakeDb(opts: { existing?: { id: string }[] } = {}): {
  db: any
  inserted: InsertedRow[]
} {
  const inserted: InsertedRow[] = []
  const existing = opts.existing ?? []
  const fake = {
    query: {
      approvalRequests: {
        findFirst: async (args: any) => existing[0] ?? undefined,
      },
    },
    insert: () => ({
      values: async (row: InsertedRow) => {
        inserted.push(row)
      },
    }),
  }
  return { db: fake, inserted }
}

function silentLogger() {
  return { log: () => {}, warn: () => {}, error: () => {} }
}

describe('tool.approval_requested dispatcher handler', () => {
  test('inserts an approvalRequests row with the right shape', async () => {
    const { db, inserted } = makeFakeDb()
    const handler = createToolApprovalRequestedHandler({
      db,
      now: () => NOW,
      logger: silentLogger(),
    })
    const env = envelopeFor(
      {
        request_id: REQUEST_ID,
        tool_name: 'composio__agent_oc1__gmail__send_email',
        args: { to: 'a@b.com' },
        session_key: 'sess-1',
        policy_level: 'normal',
      },
      { withAgent: true },
    )
    await handler({ envelope: env, instance: FAKE_INSTANCE })

    expect(inserted).toHaveLength(1)
    const row = inserted[0]!
    expect(row.orgId).toBe(ORG_ID)
    expect(row.approvalType).toBe(PLUGIN_TOOL_CALL_APPROVAL_TYPE)
    expect(row.subjectType).toBe(PLUGIN_TOOL_CALL_SUBJECT_TYPE)
    expect(row.subjectId).toBe(REQUEST_ID)
    expect(row.toolkitSlug).toBe('gmail')
    expect(row.action).toBe('send_email')
    expect(row.actionCategory).toBe('write') // SEND → write
    expect(row.requestedByUserId).toBe(USER_ID)
    // 24h default expiry
    expect(row.expiresAt?.getTime()).toBe(NOW + 24 * 60 * 60 * 1000)

    expect(row.requestPayload).toMatchObject({
      request_id: REQUEST_ID,
      tool_name: 'composio__agent_oc1__gmail__send_email',
      args: { to: 'a@b.com' },
      session_key: 'sess-1',
      policy_level: 'normal',
      instance_id: INSTANCE_ID,
      kodi_agent_id: KODI_AGENT_ID,
      openclaw_agent_id: 'agent_oc1',
      user_id: USER_ID,
    })
    expect(row.previewPayload).toMatchObject({
      tool_name: 'composio__agent_oc1__gmail__send_email',
      toolkit: 'gmail',
      action: 'send_email',
      action_category: 'write',
      policy_level: 'normal',
    })
  })

  test('idempotent: skips insert if a row already exists for (orgId, request_id)', async () => {
    const { db, inserted } = makeFakeDb({
      existing: [{ id: 'existing-row-id' }],
    })
    const handler = createToolApprovalRequestedHandler({
      db,
      now: () => NOW,
      logger: silentLogger(),
    })
    const env = envelopeFor(
      {
        request_id: REQUEST_ID,
        tool_name: 'composio__agent_oc1__gmail__send_email',
        args: {},
        session_key: 'sess-1',
        policy_level: 'normal',
      },
      { withAgent: true },
    )
    await handler({ envelope: env, instance: FAKE_INSTANCE })
    expect(inserted).toHaveLength(0)
  })

  test('handles non-composio tool names gracefully (toolkit/action null)', async () => {
    const { db, inserted } = makeFakeDb()
    const handler = createToolApprovalRequestedHandler({
      db,
      now: () => NOW,
      logger: silentLogger(),
    })
    const env = envelopeFor(
      {
        request_id: REQUEST_ID,
        tool_name: 'memory_save',
        args: {},
        session_key: 'sess-1',
        policy_level: 'strict',
      },
      { withAgent: true },
    )
    await handler({ envelope: env, instance: FAKE_INSTANCE })
    expect(inserted).toHaveLength(1)
    expect(inserted[0]?.toolkitSlug).toBeNull()
    expect(inserted[0]?.action).toBeNull()
  })

  test('drops events with malformed payload (warn-only, no insert)', async () => {
    const { db, inserted } = makeFakeDb()
    const handler = createToolApprovalRequestedHandler({
      db,
      now: () => NOW,
      logger: silentLogger(),
    })
    const env = envelopeFor({
      // missing tool_name
      request_id: REQUEST_ID,
      session_key: 'sess-1',
      policy_level: 'normal',
    })
    await handler({ envelope: env, instance: FAKE_INSTANCE })
    expect(inserted).toHaveLength(0)
  })

  test('handles missing agent envelope (requestedByUserId null)', async () => {
    const { db, inserted } = makeFakeDb()
    const handler = createToolApprovalRequestedHandler({
      db,
      now: () => NOW,
      logger: silentLogger(),
    })
    const env = envelopeFor(
      {
        request_id: REQUEST_ID,
        tool_name: 'composio__agent_oc1__gmail__send_email',
        args: {},
        session_key: 'sess-1',
        policy_level: 'normal',
      },
      { withAgent: false },
    )
    await handler({ envelope: env, instance: FAKE_INSTANCE })
    expect(inserted[0]?.requestedByUserId).toBeNull()
    expect(inserted[0]?.requestPayload).toMatchObject({
      kodi_agent_id: null,
      openclaw_agent_id: null,
      user_id: null,
    })
  })
})
