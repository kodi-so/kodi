import { describe, expect, test } from 'bun:test'
import {
  deprovisionAgent,
  type DeprovisionDeps,
} from './deprovision'
import type { ConfigWithAgents } from './provision'
import { createAgentRegistry, type AgentRegistryEntry } from './registry'
import type { ComposioModuleApi } from '../composio'
import type { Emitter } from '../event-bus/emitter'

const USER = '11111111-1111-4111-8111-111111111111'
const AGENT_ID = 'agent_to_kill'
const WORKSPACE = '/state/kodi-workspaces/agent_to_kill'

const ENTRY: AgentRegistryEntry = {
  user_id: USER,
  openclaw_agent_id: AGENT_ID,
  workspace_dir: WORKSPACE,
  composio_status: 'active',
  created_at: '2026-05-02T12:00:00.000Z',
}

type EmittedEvent = { kind: string; payload: unknown }
type RmCall = { path: string; opts: { recursive: boolean; force: boolean } }

function makeDeps(opts: {
  preload?: AgentRegistryEntry
  initialConfig?: ConfigWithAgents
  composioUnregisterThrows?: Error
  rmThrowsFor?: string
  resolveAgentDir?: DeprovisionDeps['resolveAgentDir']
}): DeprovisionDeps & {
  registry: ReturnType<typeof createAgentRegistry>
  events: EmittedEvent[]
  rmCalls: RmCall[]
  configWrites: ConfigWithAgents[]
  composioUnregisterCalls: Array<{ openclaw_agent_id: string }>
} {
  const registry = createAgentRegistry()
  if (opts.preload) registry.add(opts.preload)
  const events: EmittedEvent[] = []
  const rmCalls: RmCall[] = []
  const configWrites: ConfigWithAgents[] = []
  const composioUnregisterCalls: Array<{ openclaw_agent_id: string }> = []

  let cfg: ConfigWithAgents = opts.initialConfig ?? {
    agents: {
      list: [
        { id: AGENT_ID, name: AGENT_ID, workspace: WORKSPACE },
        { id: 'main', name: 'main', workspace: '/main' },
      ],
    },
  }

  const emitter: Emitter = {
    emit: async (kind, payload) => {
      events.push({ kind, payload })
    },
  }

  const composio: ComposioModuleApi = {
    registerToolsForAgent: async () => ({ status: 'pending', registered_tool_count: 0 }),
    runActionForAgent: async () => ({ kind: 'failed', reason: 'no_session', message: 'mock' }),
    unregisterToolsForAgent: async (params) => {
      composioUnregisterCalls.push(params)
      if (opts.composioUnregisterThrows) throw opts.composioUnregisterThrows
    },
  }

  return {
    registry,
    emitter,
    composio,
    loadConfig: () => cfg,
    writeConfigFile: async (next) => {
      cfg = next as ConfigWithAgents
      configWrites.push(next as ConfigWithAgents)
    },
    rm: async (p, o) => {
      rmCalls.push({ path: p, opts: o })
      if (opts.rmThrowsFor && p === opts.rmThrowsFor) {
        throw new Error(`rm failed for ${p}`)
      }
    },
    resolveAgentDir: opts.resolveAgentDir,
    logger: { log: () => {}, warn: () => {} },
    events,
    rmCalls,
    configWrites,
    composioUnregisterCalls,
  }
}

describe('deprovisionAgent', () => {
  test('happy path: unregisters tools, scrubs config, removes workspace, emits event, removes from registry', async () => {
    const deps = makeDeps({ preload: ENTRY })
    const result = await deprovisionAgent(deps, { user_id: USER })

    expect(result).toEqual({
      ok: true,
      removed: true,
      openclaw_agent_id: AGENT_ID,
    })

    expect(deps.composioUnregisterCalls).toEqual([
      { openclaw_agent_id: AGENT_ID },
    ])

    expect(deps.configWrites).toHaveLength(1)
    const list = deps.configWrites[0]!.agents?.list ?? []
    expect(list.find((e) => e.id === AGENT_ID)).toBeUndefined()
    expect(list.find((e) => e.id === 'main')).toBeDefined()

    expect(deps.rmCalls).toEqual([
      { path: WORKSPACE, opts: { recursive: true, force: true } },
    ])

    expect(deps.events).toEqual([
      {
        kind: 'agent.deprovisioned',
        payload: { user_id: USER, openclaw_agent_id: AGENT_ID },
      },
    ])

    expect(deps.registry.getByUser(USER)).toBeUndefined()
    expect(deps.registry.getByAgentId(AGENT_ID)).toBeUndefined()
  })

  test('unknown user: returns removed=false, no side effects', async () => {
    const deps = makeDeps({})
    const result = await deprovisionAgent(deps, { user_id: USER })
    expect(result).toEqual({ ok: true, removed: false })
    expect(deps.composioUnregisterCalls).toEqual([])
    expect(deps.configWrites).toEqual([])
    expect(deps.rmCalls).toEqual([])
    expect(deps.events).toEqual([])
  })

  test('composio unregister failure does not block teardown', async () => {
    const deps = makeDeps({
      preload: ENTRY,
      composioUnregisterThrows: new Error('composio offline'),
    })
    const result = await deprovisionAgent(deps, { user_id: USER })
    expect(result.removed).toBe(true)
    expect(deps.configWrites).toHaveLength(1)
    expect(deps.rmCalls.length).toBeGreaterThan(0)
    expect(deps.events).toHaveLength(1)
    expect(deps.registry.getByUser(USER)).toBeUndefined()
  })

  test('skips config write when agent is not in agents.list', async () => {
    const deps = makeDeps({
      preload: ENTRY,
      initialConfig: {
        agents: { list: [{ id: 'main', name: 'main', workspace: '/main' }] },
      },
    })
    const result = await deprovisionAgent(deps, { user_id: USER })
    expect(result.removed).toBe(true)
    expect(deps.configWrites).toEqual([])
  })

  test('removes agent dir when resolveAgentDir is provided', async () => {
    const AGENT_DIR = '/openclaw-state/agents/agent_to_kill/agent'
    const deps = makeDeps({
      preload: ENTRY,
      resolveAgentDir: ({ agentId }) =>
        `/openclaw-state/agents/${agentId}/agent`,
    })
    await deprovisionAgent(deps, { user_id: USER })
    const paths = deps.rmCalls.map((c) => c.path)
    expect(paths).toEqual([WORKSPACE, AGENT_DIR])
  })

  test('continues teardown if resolveAgentDir/rm throws for the agent dir', async () => {
    const deps = makeDeps({
      preload: ENTRY,
      resolveAgentDir: () => '/dies/here',
      rmThrowsFor: '/dies/here',
    })
    const result = await deprovisionAgent(deps, { user_id: USER })
    expect(result.removed).toBe(true)
    expect(deps.events).toHaveLength(1)
    expect(deps.registry.getByUser(USER)).toBeUndefined()
  })
})
