import { describe, expect, test } from 'bun:test'
import {
  reconcileAgents,
  RECONCILE_AGENTS_PATH,
  type ReconcileDeps,
} from './reconcile'
import { createAgentRegistry, type AgentRegistryEntry } from './registry'
import type { KodiClient } from '../bridge-core/kodi-client'
import type { ProvisionInput, ProvisionResult } from './provision'
import type { DeprovisionInput, DeprovisionResult } from './deprovision'

const USER_A = '11111111-1111-4111-8111-111111111111'
const USER_B = '22222222-2222-4222-8222-222222222222'
const USER_C = '33333333-3333-4333-8333-333333333333'

const ENTRY_A_LOCAL: AgentRegistryEntry = {
  user_id: USER_A,
  openclaw_agent_id: 'kodi-member-agent-a',
  workspace_dir: '/state/kodi-workspaces/kodi-member-agent-a',
  composio_status: 'active',
  created_at: '2026-05-02T12:00:00.000Z',
}

function silentLogger() {
  return { log: () => {}, warn: () => {}, error: () => {} }
}

function fakeKodiClient(opts: {
  status?: number
  body?: unknown
  bodyText?: string
  throws?: Error
}): KodiClient & { calls: Array<{ path: string; init: unknown }> } {
  const calls: Array<{ path: string; init: unknown }> = []
  const client: KodiClient = {
    signedFetch: async (path, init) => {
      calls.push({ path, init })
      if (opts.throws) throw opts.throws
      const status = opts.status ?? 200
      const text = opts.bodyText ?? JSON.stringify(opts.body ?? { agents: [] })
      return new Response(text, {
        status,
        headers: { 'content-type': 'application/json' },
      })
    },
  }
  return Object.assign(client, { calls })
}

type ProvisionCall = ProvisionInput
type DeprovisionCall = DeprovisionInput

function captureProvisionDeps(opts?: {
  provisionThrowsFor?: string
  deprovisionThrowsFor?: string
}): {
  registry: ReturnType<typeof createAgentRegistry>
  provisionCalls: ProvisionCall[]
  deprovisionCalls: DeprovisionCall[]
  provision: (input: ProvisionInput) => Promise<ProvisionResult>
  deprovision: (input: DeprovisionInput) => Promise<DeprovisionResult>
} {
  const registry = createAgentRegistry()
  const provisionCalls: ProvisionCall[] = []
  const deprovisionCalls: DeprovisionCall[] = []
  return {
    registry,
    provisionCalls,
    deprovisionCalls,
    provision: async (input) => {
      provisionCalls.push(input)
      if (opts?.provisionThrowsFor === input.user_id) {
        throw new Error('provision blew up')
      }
      // Mirror the real provision: add to registry under the override id.
      registry.add({
        user_id: input.user_id,
        openclaw_agent_id: input.openclaw_agent_id ?? `agent_gen_${input.user_id.slice(0, 4)}`,
        workspace_dir: '/state/kodi-workspaces/x',
        composio_status: 'active',
        created_at: '2026-05-02T12:00:00.000Z',
      })
      return {
        openclaw_agent_id: input.openclaw_agent_id ?? `agent_gen_${input.user_id.slice(0, 4)}`,
        workspace_dir: '/state/kodi-workspaces/x',
        composio_status: 'active',
        registered_tool_count: input.actions?.length ?? 0,
        created: true,
      }
    },
    deprovision: async (input) => {
      deprovisionCalls.push(input)
      if (opts?.deprovisionThrowsFor === input.user_id) {
        throw new Error('deprovision blew up')
      }
      const removed = registry.getByUser(input.user_id)
      if (removed) registry.remove(removed.openclaw_agent_id)
      return {
        ok: true,
        removed: !!removed,
        openclaw_agent_id: removed?.openclaw_agent_id,
      }
    },
  }
}

function makeEntry(opts: {
  user_id: string
  openclaw_agent_id: string
  agent_type?: 'org' | 'member'
  composio_session_id?: string | null
  actions?: Array<{ name: string; description: string; toolkit: string; action: string; parameters?: unknown }>
}) {
  return {
    kodi_agent_id: `kodi-${opts.user_id.slice(0, 4)}`,
    openclaw_agent_id: opts.openclaw_agent_id,
    agent_type: opts.agent_type ?? 'member',
    user_id: opts.user_id,
    composio_session_id: opts.composio_session_id ?? null,
    actions: (opts.actions ?? []).map((a) => ({
      ...a,
      parameters: a.parameters ?? null,
    })),
  }
}

function buildDeps(
  client: KodiClient,
  capture: ReturnType<typeof captureProvisionDeps>,
): ReconcileDeps {
  return {
    kodiClient: client,
    registry: capture.registry,
    provision: capture.provision,
    deprovision: capture.deprovision,
    logger: silentLogger(),
  }
}

describe('reconcileAgents — happy paths', () => {
  test('cold start: empty local + 2 in Kodi → 2 created', async () => {
    const client = fakeKodiClient({
      body: {
        agents: [
          makeEntry({ user_id: USER_A, openclaw_agent_id: 'kodi-a' }),
          makeEntry({ user_id: USER_B, openclaw_agent_id: 'kodi-b' }),
        ],
      },
    })
    const cap = captureProvisionDeps()
    const result = await reconcileAgents(buildDeps(client, cap))

    expect(result.ok).toBe(true)
    expect(client.calls).toHaveLength(1)
    expect(client.calls[0]?.path).toBe(RECONCILE_AGENTS_PATH)

    expect(cap.provisionCalls).toHaveLength(2)
    // openclaw_agent_id override is honoured
    expect(cap.provisionCalls[0]?.openclaw_agent_id).toBe('kodi-a')
    expect(cap.provisionCalls[1]?.openclaw_agent_id).toBe('kodi-b')
    expect(cap.deprovisionCalls).toEqual([])
    expect(result.results.filter((r) => r.ok && r.action === 'created')).toHaveLength(2)
  })

  test('drift: 1 local-only orphan → deprovisioned, 1 kodi-only → created', async () => {
    const client = fakeKodiClient({
      body: {
        agents: [makeEntry({ user_id: USER_B, openclaw_agent_id: 'kodi-b' })],
      },
    })
    const cap = captureProvisionDeps()
    cap.registry.add(ENTRY_A_LOCAL)

    const result = await reconcileAgents(buildDeps(client, cap))
    expect(result.ok).toBe(true)
    expect(cap.deprovisionCalls).toEqual([{ user_id: USER_A }])
    expect(cap.provisionCalls).toHaveLength(1)
    expect(cap.provisionCalls[0]?.user_id).toBe(USER_B)
  })

  test('idempotent re-run: same set in both → reused, no creates/drops', async () => {
    const client = fakeKodiClient({
      body: {
        agents: [makeEntry({ user_id: USER_A, openclaw_agent_id: 'kodi-member-agent-a' })],
      },
    })
    const cap = captureProvisionDeps()
    cap.registry.add(ENTRY_A_LOCAL)

    const result = await reconcileAgents(buildDeps(client, cap))
    expect(result.ok).toBe(true)
    expect(cap.deprovisionCalls).toEqual([])
    // Re-syncs Composio via the same provision call (idempotent on the
    // composio module side, which diffs the action list).
    expect(cap.provisionCalls).toHaveLength(1)
    expect(result.results.find((r) => r.ok && r.action === 'reused')).toBeDefined()
  })
})

describe('reconcileAgents — failure paths', () => {
  test('Kodi unreachable: ok=false, registry untouched', async () => {
    const client = fakeKodiClient({ throws: new Error('ECONNREFUSED') })
    const cap = captureProvisionDeps()
    cap.registry.add(ENTRY_A_LOCAL)

    const result = await reconcileAgents(buildDeps(client, cap))
    expect(result.ok).toBe(false)
    expect(result.error).toContain('ECONNREFUSED')
    expect(cap.provisionCalls).toEqual([])
    expect(cap.deprovisionCalls).toEqual([])
    expect(cap.registry.list()).toHaveLength(1)
  })

  test('Kodi 5xx: ok=false', async () => {
    const client = fakeKodiClient({ status: 503, bodyText: 'unavailable' })
    const cap = captureProvisionDeps()
    const result = await reconcileAgents(buildDeps(client, cap))
    expect(result.ok).toBe(false)
    expect(result.error).toContain('503')
  })

  test('Kodi returns malformed body: ok=false', async () => {
    const client = fakeKodiClient({ bodyText: 'not-json' })
    const cap = captureProvisionDeps()
    const result = await reconcileAgents(buildDeps(client, cap))
    expect(result.ok).toBe(false)
    expect(result.error).toContain('failed to parse JSON')
  })

  test('Kodi returns wrong shape: ok=false', async () => {
    const client = fakeKodiClient({ body: { wrong: 'shape' } })
    const cap = captureProvisionDeps()
    const result = await reconcileAgents(buildDeps(client, cap))
    expect(result.ok).toBe(false)
    expect(result.error).toContain('invalid response shape')
  })

  test('per-agent provision throws: continues, surfaces per-entry failure', async () => {
    const client = fakeKodiClient({
      body: {
        agents: [
          makeEntry({ user_id: USER_A, openclaw_agent_id: 'kodi-a' }),
          makeEntry({ user_id: USER_B, openclaw_agent_id: 'kodi-b' }),
        ],
      },
    })
    const cap = captureProvisionDeps({ provisionThrowsFor: USER_A })
    const result = await reconcileAgents(buildDeps(client, cap))
    expect(result.ok).toBe(true) // overall reconcile succeeded
    const failed = result.results.find((r) => !r.ok && r.action === 'create_failed')
    expect(failed?.user_id).toBe(USER_A)
    const succeeded = result.results.find(
      (r) => r.ok && r.action === 'created' && r.user_id === USER_B,
    )
    expect(succeeded).toBeDefined()
  })

  test('per-agent deprovision throws: continues, surfaces per-entry failure', async () => {
    const client = fakeKodiClient({ body: { agents: [] } })
    const cap = captureProvisionDeps({ deprovisionThrowsFor: USER_A })
    cap.registry.add(ENTRY_A_LOCAL)

    const result = await reconcileAgents(buildDeps(client, cap))
    expect(result.ok).toBe(true)
    const failed = result.results.find((r) => !r.ok && r.action === 'deprovision_failed')
    expect(failed?.user_id).toBe(USER_A)
  })
})

describe('reconcileAgents — input parsing', () => {
  test.each([
    ['agent_type missing', { agents: [{ kodi_agent_id: 'k', openclaw_agent_id: 'o', user_id: 'u', composio_session_id: null, actions: [] }] }],
    ['agent_type wrong', { agents: [{ ...makeEntry({ user_id: USER_A, openclaw_agent_id: 'k' }), agent_type: 'not-a-kind' }] }],
    ['user_id empty', { agents: [{ ...makeEntry({ user_id: USER_A, openclaw_agent_id: 'k' }), user_id: '' }] }],
    ['action missing toolkit', { agents: [{ ...makeEntry({ user_id: USER_A, openclaw_agent_id: 'k' }), actions: [{ name: 'x', description: '' }] }] }],
  ])('rejects bad shape: %s', async (_label, body) => {
    const client = fakeKodiClient({ body })
    const cap = captureProvisionDeps()
    const result = await reconcileAgents(buildDeps(client, cap))
    expect(result.ok).toBe(false)
    expect(result.error).toContain('invalid response shape')
  })
})

describe('agent-manager exports', () => {
  test('RECONCILE_AGENTS_PATH matches Kodi route', () => {
    expect(RECONCILE_AGENTS_PATH).toBe('/api/openclaw/agents')
  })
})
