import { describe, expect, test } from 'bun:test'
import {
  AUTONOMY_LEVELS,
  AUTONOMY_OVERRIDE_ACTIONS,
  AutonomyLevelSchema,
  AutonomyOverridesSchema,
  SetAgentAutonomyBodySchema,
  setAgentAutonomyPolicy,
} from './autonomy'
import type { PushResult } from './plugin-client'
import type { Instance } from '@kodi/db'

const AGENT_ID = 'agent-uuid-1'
const ORG_ID = 'org-1'
const USER_ID = 'user-1'
const NOW = Date.parse('2026-05-03T10:00:00.000Z')

const FAKE_INSTANCE: Instance = {
  id: 'instance-1',
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

function silentLogger() {
  return { log: () => {}, warn: () => {}, error: () => {} }
}

type UpsertedRow = {
  agentId: string
  autonomyLevel: string
  overrides: Record<string, string> | null
  updatedByUserId: string
  updatedAt: Date
}

function makeFakeDb(opts: {
  instance?: Instance | null
}): {
  db: any
  upserted: UpsertedRow[]
} {
  const upserted: UpsertedRow[] = []
  const fake = {
    query: {
      instances: {
        findFirst: async () => opts.instance ?? null,
      },
    },
    insert: () => ({
      values: (values: UpsertedRow) => ({
        onConflictDoUpdate: () => ({
          returning: async () => {
            upserted.push(values)
            return [values]
          },
        }),
      }),
    }),
  }
  return { db: fake, upserted }
}

function pushFnReturning(result: PushResult): {
  fn: any
  calls: any[]
} {
  const calls: any[] = []
  return {
    calls,
    fn: async (input: any) => {
      calls.push(input)
      return result
    },
  }
}

describe('SetAgentAutonomyBodySchema', () => {
  test('accepts valid body without overrides', () => {
    const r = SetAgentAutonomyBodySchema.safeParse({ autonomy_level: 'normal' })
    expect(r.success).toBe(true)
  })

  test('accepts valid body with overrides', () => {
    const r = SetAgentAutonomyBodySchema.safeParse({
      autonomy_level: 'lenient',
      overrides: { 'slack.*': 'ask', 'gmail.send_email': 'deny' },
    })
    expect(r.success).toBe(true)
  })

  test('rejects unknown autonomy_level', () => {
    const r = SetAgentAutonomyBodySchema.safeParse({ autonomy_level: 'paranoid' })
    expect(r.success).toBe(false)
  })

  test('rejects unknown override action', () => {
    const r = SetAgentAutonomyBodySchema.safeParse({
      autonomy_level: 'normal',
      overrides: { 'slack.*': 'log-only' },
    })
    expect(r.success).toBe(false)
  })

  test('accepts overrides: null', () => {
    const r = SetAgentAutonomyBodySchema.safeParse({
      autonomy_level: 'normal',
      overrides: null,
    })
    expect(r.success).toBe(true)
  })

  test('rejects empty-string keys', () => {
    const r = SetAgentAutonomyBodySchema.safeParse({
      autonomy_level: 'normal',
      overrides: { '': 'allow' },
    })
    expect(r.success).toBe(false)
  })
})

describe('AUTONOMY_LEVELS / AUTONOMY_OVERRIDE_ACTIONS — exhaustive', () => {
  test('all 4 levels parseable', () => {
    for (const lvl of AUTONOMY_LEVELS) {
      expect(AutonomyLevelSchema.safeParse(lvl).success).toBe(true)
    }
  })
  test('all 3 actions parseable in overrides', () => {
    for (const a of AUTONOMY_OVERRIDE_ACTIONS) {
      const r = AutonomyOverridesSchema.safeParse({ 'tool.x': a })
      expect(r.success).toBe(true)
    }
  })
})

describe('setAgentAutonomyPolicy', () => {
  test('upserts row + pushes to plugin (happy path)', async () => {
    const { db, upserted } = makeFakeDb({ instance: FAKE_INSTANCE })
    const push = pushFnReturning({ ok: true, status: 200 })
    const result = await setAgentAutonomyPolicy({
      agentId: AGENT_ID,
      orgId: ORG_ID,
      autonomyLevel: 'lenient',
      overrides: { 'slack.*': 'ask' },
      decidedByUserId: USER_ID,
      db,
      pushFn: push.fn,
      now: () => NOW,
      logger: silentLogger(),
    })

    expect(upserted).toHaveLength(1)
    expect(upserted[0]?.agentId).toBe(AGENT_ID)
    expect(upserted[0]?.autonomyLevel).toBe('lenient')
    expect(upserted[0]?.overrides).toEqual({ 'slack.*': 'ask' })
    expect(upserted[0]?.updatedByUserId).toBe(USER_ID)
    expect(upserted[0]?.updatedAt.getTime()).toBe(NOW)

    expect(push.calls).toHaveLength(1)
    expect(push.calls[0].instance.id).toBe(FAKE_INSTANCE.id)
    expect(push.calls[0].body).toEqual({
      agent_id: AGENT_ID,
      autonomy_level: 'lenient',
      overrides: { 'slack.*': 'ask' },
    })

    expect(result.reload_pushed).toBe(true)
    expect(result.reload_reason).toBeUndefined()
    expect(result.autonomy_level).toBe('lenient')
  })

  test('empty overrides object is normalized to null', async () => {
    const { db, upserted } = makeFakeDb({ instance: FAKE_INSTANCE })
    const push = pushFnReturning({ ok: true, status: 200 })
    await setAgentAutonomyPolicy({
      agentId: AGENT_ID,
      orgId: ORG_ID,
      autonomyLevel: 'normal',
      overrides: {},
      decidedByUserId: USER_ID,
      db,
      pushFn: push.fn,
      now: () => NOW,
      logger: silentLogger(),
    })
    expect(upserted[0]?.overrides).toBeNull()
    expect(push.calls[0].body.overrides).toBeNull()
  })

  test('no running instance: persists, reload_pushed=false', async () => {
    const { db, upserted } = makeFakeDb({ instance: null })
    const push = pushFnReturning({ ok: true, status: 200 })
    const result = await setAgentAutonomyPolicy({
      agentId: AGENT_ID,
      orgId: ORG_ID,
      autonomyLevel: 'strict',
      decidedByUserId: USER_ID,
      db,
      pushFn: push.fn,
      now: () => NOW,
      logger: silentLogger(),
    })
    expect(upserted).toHaveLength(1)
    expect(push.calls).toHaveLength(0)
    expect(result.reload_pushed).toBe(false)
    expect(result.reload_reason).toBe('no-running-instance')
  })

  test('push failure: persists, reload_pushed=false with reason', async () => {
    const { db, upserted } = makeFakeDb({ instance: FAKE_INSTANCE })
    const push = pushFnReturning({
      ok: false,
      reason: 'request-failed',
      error: 'ECONNREFUSED',
    })
    const result = await setAgentAutonomyPolicy({
      agentId: AGENT_ID,
      orgId: ORG_ID,
      autonomyLevel: 'yolo',
      decidedByUserId: USER_ID,
      db,
      pushFn: push.fn,
      now: () => NOW,
      logger: silentLogger(),
    })
    expect(upserted).toHaveLength(1)
    expect(result.reload_pushed).toBe(false)
    expect(result.reload_reason).toBe('request-failed')
  })

  test('omitted overrides → upserts overrides: null', async () => {
    const { db, upserted } = makeFakeDb({ instance: FAKE_INSTANCE })
    const push = pushFnReturning({ ok: true, status: 200 })
    await setAgentAutonomyPolicy({
      agentId: AGENT_ID,
      orgId: ORG_ID,
      autonomyLevel: 'normal',
      decidedByUserId: USER_ID,
      db,
      pushFn: push.fn,
      now: () => NOW,
      logger: silentLogger(),
    })
    expect(upserted[0]?.overrides).toBeNull()
  })
})
