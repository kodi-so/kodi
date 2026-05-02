import { describe, expect, test } from 'bun:test'
import {
  triggerAgentProvision,
  triggerAgentDeprovision,
  triggerOrgAgentProvision,
  reconcileAgentsForOrg,
  type ReconcileAgentsForOrgInput,
  type TriggerOrgAgentProvisionInput,
  type TriggerProvisionInput,
} from './agent-lifecycle'
import type {
  ProvisionAgentForUserResult,
  ProvisionOrgAgentResult,
  DeprovisionAgentForUserResult,
} from './composio-sessions'

const ORG = '11111111-1111-4111-8111-111111111111'
const USER_A = '22222222-2222-4222-8222-222222222222'
const USER_B = '33333333-3333-4333-8333-333333333333'
const MEMBER_A = '44444444-4444-4444-8444-444444444444'
const MEMBER_B = '55555555-5555-4555-8555-555555555555'

function silentLogger() {
  return { log: () => {}, warn: () => {}, error: () => {} }
}

/**
 * Build a fake `db` whose only used surface is `query.instances.findFirst`
 * (for the trigger guards) and the `select().from().where()` chain
 * `reconcileAgentsForOrg` uses to list members.
 */
function makeFakeDb(opts: {
  instance?: { status: string } | null
  members?: Array<{ memberId: string; userId: string }>
}) {
  const fakeDb = {
    query: {
      instances: {
        findFirst: async () => opts.instance ?? null,
      },
    },
    select: () => ({
      from: () => ({
        where: async () => opts.members ?? [],
      }),
    }),
  }
  return fakeDb as unknown as TriggerProvisionInput['dbInstance']
}

describe('triggerAgentProvision', () => {
  test('skips with no-instance when the org has no instance row', async () => {
    let called = false
    const out = await triggerAgentProvision({
      dbInstance: makeFakeDb({ instance: null }),
      org_id: ORG,
      user_id: USER_A,
      org_member_id: MEMBER_A,
      provisionFn: (async () => {
        called = true
        return {} as ProvisionAgentForUserResult
      }) as unknown as TriggerProvisionInput['provisionFn'],
      logger: silentLogger(),
    })
    expect(out).toEqual({ kind: 'skipped', reason: 'no-instance' })
    expect(called).toBe(false)
  })

  test('skips with instance-not-running when status is installing', async () => {
    let called = false
    const out = await triggerAgentProvision({
      dbInstance: makeFakeDb({ instance: { status: 'installing' } }),
      org_id: ORG,
      user_id: USER_A,
      org_member_id: MEMBER_A,
      provisionFn: (async () => {
        called = true
        return {} as ProvisionAgentForUserResult
      }) as unknown as TriggerProvisionInput['provisionFn'],
      logger: silentLogger(),
    })
    expect(out).toEqual({ kind: 'skipped', reason: 'instance-not-running' })
    expect(called).toBe(false)
  })

  test('starts background work when instance is running', async () => {
    let calls = 0
    const provisionFn = (async () => {
      calls += 1
      return {
        composio_status: 'active',
        registered_tool_count: 3,
      } as unknown as ProvisionAgentForUserResult
    }) as unknown as TriggerProvisionInput['provisionFn']

    const out = await triggerAgentProvision({
      dbInstance: makeFakeDb({ instance: { status: 'running' } }),
      org_id: ORG,
      user_id: USER_A,
      org_member_id: MEMBER_A,
      provisionFn,
      logger: silentLogger(),
    })
    expect(out).toEqual({ kind: 'started' })
    // Wait for background microtasks
    await new Promise((r) => setTimeout(r, 0))
    expect(calls).toBe(1)
  })

  test('background failure does NOT throw to caller', async () => {
    const provisionFn = (async () => {
      throw new Error('orchestrator down')
    }) as unknown as TriggerProvisionInput['provisionFn']

    const out = await triggerAgentProvision({
      dbInstance: makeFakeDb({ instance: { status: 'running' } }),
      org_id: ORG,
      user_id: USER_A,
      org_member_id: MEMBER_A,
      provisionFn,
      logger: silentLogger(),
    })
    expect(out).toEqual({ kind: 'started' })
    await new Promise((r) => setTimeout(r, 0))
  })
})

describe('triggerAgentDeprovision', () => {
  test('always returns started; runs deprovisionFn in background', async () => {
    let called = false
    const deprovisionFn = (async () => {
      called = true
      return { removed: true, pluginResult: null } as unknown as DeprovisionAgentForUserResult
    }) as unknown as Parameters<typeof triggerAgentDeprovision>[0]['deprovisionFn']

    const out = await triggerAgentDeprovision({
      dbInstance: makeFakeDb({ instance: { status: 'running' } }),
      org_id: ORG,
      user_id: USER_A,
      org_member_id: MEMBER_A,
      deprovisionFn,
      logger: silentLogger(),
    })
    expect(out).toEqual({ kind: 'started' })
    await new Promise((r) => setTimeout(r, 0))
    expect(called).toBe(true)
  })

  test('background failure does NOT throw to caller', async () => {
    const deprovisionFn = (async () => {
      throw new Error('plugin offline')
    }) as unknown as Parameters<typeof triggerAgentDeprovision>[0]['deprovisionFn']

    const out = await triggerAgentDeprovision({
      dbInstance: makeFakeDb({ instance: { status: 'running' } }),
      org_id: ORG,
      user_id: USER_A,
      org_member_id: MEMBER_A,
      deprovisionFn,
      logger: silentLogger(),
    })
    expect(out).toEqual({ kind: 'started' })
    await new Promise((r) => setTimeout(r, 0))
  })
})

function noopOrgProvisionFn(): ReconcileAgentsForOrgInput['orgProvisionFn'] {
  return (async () => ({
    openclaw_agents_row_id: 'org-row',
    openclaw_agent_id: 'kodi-agent-org',
    composio_status: 'skipped',
    pluginResult: null,
  })) as unknown as ReconcileAgentsForOrgInput['orgProvisionFn']
}

describe('reconcileAgentsForOrg', () => {
  test('iterates every member, also provisions org agent first', async () => {
    const calls: Array<{ user_id: string; org_member_id: string }> = []
    const provisionFn = (async (input: { user_id: string; org_member_id: string }) => {
      calls.push({
        user_id: (input as { user_id: string }).user_id,
        org_member_id: (input as { org_member_id: string }).org_member_id,
      })
      return {
        composio_status: 'active',
        registered_tool_count: 2,
      } as unknown as ProvisionAgentForUserResult
    }) as unknown as ReconcileAgentsForOrgInput['provisionFn']

    const result = await reconcileAgentsForOrg({
      dbInstance: makeFakeDb({
        members: [
          { memberId: MEMBER_A, userId: USER_A },
          { memberId: MEMBER_B, userId: USER_B },
        ],
      }),
      org_id: ORG,
      provisionFn,
      orgProvisionFn: noopOrgProvisionFn(),
      logger: silentLogger(),
    })

    expect(result.attempted).toBe(2)
    expect(result.succeeded).toBe(2)
    expect(result.failed).toBe(0)
    expect(calls.map((c) => c.user_id).sort()).toEqual([USER_A, USER_B])
    expect(result.orgAgent.ok).toBe(true)
    if (result.orgAgent.ok) {
      expect(result.orgAgent.composio_status).toBe('skipped')
    }
  })

  test('partial failure: continues to next member, reports counts', async () => {
    const provisionFn = (async (input: { user_id: string; org_member_id: string }) => {
      if ((input as { user_id: string }).user_id === USER_A) {
        throw new Error('Composio rate limit')
      }
      return {
        composio_status: 'active',
        registered_tool_count: 1,
      } as unknown as ProvisionAgentForUserResult
    }) as unknown as ReconcileAgentsForOrgInput['provisionFn']

    const result = await reconcileAgentsForOrg({
      dbInstance: makeFakeDb({
        members: [
          { memberId: MEMBER_A, userId: USER_A },
          { memberId: MEMBER_B, userId: USER_B },
        ],
      }),
      org_id: ORG,
      provisionFn,
      orgProvisionFn: noopOrgProvisionFn(),
      logger: silentLogger(),
    })

    expect(result.attempted).toBe(2)
    expect(result.succeeded).toBe(1)
    expect(result.failed).toBe(1)
    const failed = result.results.find((r) => r.org_member_id === MEMBER_A)
    expect(failed?.ok).toBe(false)
    if (failed && !failed.ok) {
      expect(failed.error).toContain('Composio')
    }
  })

  test('empty org: zero member attempts but org agent still provisioned', async () => {
    const result = await reconcileAgentsForOrg({
      dbInstance: makeFakeDb({ members: [] }),
      org_id: ORG,
      provisionFn: (async () => ({
        composio_status: 'active',
        registered_tool_count: 0,
      })) as unknown as ReconcileAgentsForOrgInput['provisionFn'],
      orgProvisionFn: noopOrgProvisionFn(),
      logger: silentLogger(),
    })
    expect(result.attempted).toBe(0)
    expect(result.succeeded).toBe(0)
    expect(result.failed).toBe(0)
    expect(result.results).toEqual([])
    expect(result.orgAgent.ok).toBe(true)
  })

  test('org agent failure does not abort member reconcile', async () => {
    const orgProvisionFn = (async () => {
      throw new Error('org agent down')
    }) as unknown as ReconcileAgentsForOrgInput['orgProvisionFn']

    const result = await reconcileAgentsForOrg({
      dbInstance: makeFakeDb({
        members: [{ memberId: MEMBER_A, userId: USER_A }],
      }),
      org_id: ORG,
      provisionFn: (async () => ({
        composio_status: 'active',
        registered_tool_count: 0,
      })) as unknown as ReconcileAgentsForOrgInput['provisionFn'],
      orgProvisionFn,
      logger: silentLogger(),
    })
    expect(result.orgAgent.ok).toBe(false)
    if (!result.orgAgent.ok) {
      expect(result.orgAgent.error).toContain('org agent down')
    }
    expect(result.attempted).toBe(1)
    expect(result.succeeded).toBe(1)
  })
})

describe('triggerOrgAgentProvision', () => {
  test('skips when org has no instance', async () => {
    let called = false
    const out = await triggerOrgAgentProvision({
      dbInstance: makeFakeDb({ instance: null }),
      org_id: ORG,
      provisionFn: (async () => {
        called = true
        return {} as ProvisionOrgAgentResult
      }) as unknown as TriggerOrgAgentProvisionInput['provisionFn'],
      logger: silentLogger(),
    })
    expect(out).toEqual({ kind: 'skipped', reason: 'no-instance' })
    expect(called).toBe(false)
  })

  test('skips when instance is not running', async () => {
    let called = false
    const out = await triggerOrgAgentProvision({
      dbInstance: makeFakeDb({ instance: { status: 'installing' } }),
      org_id: ORG,
      provisionFn: (async () => {
        called = true
        return {} as ProvisionOrgAgentResult
      }) as unknown as TriggerOrgAgentProvisionInput['provisionFn'],
      logger: silentLogger(),
    })
    expect(out).toEqual({ kind: 'skipped', reason: 'instance-not-running' })
    expect(called).toBe(false)
  })

  test('starts background work when instance is running', async () => {
    let calls = 0
    const provisionFn = (async () => {
      calls += 1
      return {
        openclaw_agents_row_id: 'row-1',
        openclaw_agent_id: 'kodi-agent-org',
        composio_status: 'skipped',
        pluginResult: null,
      } as unknown as ProvisionOrgAgentResult
    }) as unknown as TriggerOrgAgentProvisionInput['provisionFn']

    const out = await triggerOrgAgentProvision({
      dbInstance: makeFakeDb({ instance: { status: 'running' } }),
      org_id: ORG,
      provisionFn,
      logger: silentLogger(),
    })
    expect(out).toEqual({ kind: 'started' })
    await new Promise((r) => setTimeout(r, 0))
    expect(calls).toBe(1)
  })

  test('background failure does NOT throw to caller', async () => {
    const provisionFn = (async () => {
      throw new Error('plugin offline')
    }) as unknown as TriggerOrgAgentProvisionInput['provisionFn']

    const out = await triggerOrgAgentProvision({
      dbInstance: makeFakeDb({ instance: { status: 'running' } }),
      org_id: ORG,
      provisionFn,
      logger: silentLogger(),
    })
    expect(out).toEqual({ kind: 'started' })
    await new Promise((r) => setTimeout(r, 0))
  })
})
