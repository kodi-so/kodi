import { describe, expect, test } from 'bun:test'
import {
  provisionAgent,
  type ConfigWithAgents,
  type ProvisionDeps,
} from './provision'
import { createAgentRegistry } from './registry'
import type { ComposioModuleApi } from '../composio'
import type { Emitter } from '../event-bus/emitter'

const USER_A = '11111111-1111-4111-8111-111111111111'
const USER_B = '22222222-2222-4222-8222-222222222222'
const ORG = '33333333-3333-4333-8333-333333333333'
const FIXED_NOW = new Date('2026-05-02T12:00:00.000Z')

type EmittedEvent = { kind: string; payload: unknown }
type WorkspaceCall = { dir: string; ensureBootstrapFiles?: boolean }
type FileWrite = { path: string; content: string }

function makeDeps(opts: {
  registry?: ReturnType<typeof createAgentRegistry>
  initialConfig?: ConfigWithAgents
  composioStatus?: 'pending' | 'active' | 'failed' | 'disconnected' | 'skipped'
  composioThrows?: Error
  agentIds?: string[]
}): ProvisionDeps & {
  events: EmittedEvent[]
  workspaceCalls: WorkspaceCall[]
  fileWrites: FileWrite[]
  configWrites: ConfigWithAgents[]
  composioCalls: Array<{
    user_id: string
    openclaw_agent_id: string
    composio_session?: unknown
  }>
} {
  const registry = opts.registry ?? createAgentRegistry()
  const events: EmittedEvent[] = []
  const workspaceCalls: WorkspaceCall[] = []
  const fileWrites: FileWrite[] = []
  const configWrites: ConfigWithAgents[] = []
  const composioCalls: Array<{
    user_id: string
    openclaw_agent_id: string
    composio_session?: unknown
  }> = []

  let cfg: ConfigWithAgents = opts.initialConfig ?? { agents: { list: [] } }

  const emitter: Emitter = {
    emit: async (kind, payload) => {
      events.push({ kind, payload })
    },
  }

  const composio: ComposioModuleApi = {
    registerToolsForAgent: async (params) => {
      composioCalls.push(params)
      if (opts.composioThrows) throw opts.composioThrows
      return { status: opts.composioStatus ?? 'active' }
    },
    unregisterToolsForAgent: async () => {},
  }

  const idQueue = opts.agentIds ? [...opts.agentIds] : []
  const agentIdFactory = idQueue.length
    ? () => idQueue.shift() ?? 'agent_FALLBACK'
    : undefined

  return {
    registry,
    identity: { org_id: ORG },
    emitter,
    composio,
    ensureAgentWorkspace: async (params) => {
      workspaceCalls.push({
        dir: params.dir,
        ensureBootstrapFiles: params.ensureBootstrapFiles,
      })
      return { dir: params.dir }
    },
    loadConfig: () => cfg,
    writeConfigFile: async (next) => {
      cfg = next as ConfigWithAgents
      configWrites.push(next as ConfigWithAgents)
    },
    writeFile: async (p, c) => {
      fileWrites.push({ path: p, content: c })
    },
    resolveStateDir: () => '/state',
    agentIdFactory,
    now: () => FIXED_NOW,
    logger: { log: () => {}, warn: () => {} },
    events,
    workspaceCalls,
    fileWrites,
    configWrites,
    composioCalls,
  }
}

describe('provisionAgent', () => {
  test('happy path: creates workspace, writes IDENTITY, updates config, registers composio, emits event, adds to registry', async () => {
    const deps = makeDeps({ agentIds: ['agent_abc1234'] })
    const result = await provisionAgent(deps, { user_id: USER_A })

    expect(result.created).toBe(true)
    expect(result.openclaw_agent_id).toBe('agent_abc1234')
    expect(result.workspace_dir).toBe('/state/kodi-workspaces/agent_abc1234')
    expect(result.composio_status).toBe('active')

    expect(deps.workspaceCalls).toEqual([
      { dir: '/state/kodi-workspaces/agent_abc1234', ensureBootstrapFiles: true },
    ])

    expect(deps.fileWrites).toHaveLength(1)
    expect(deps.fileWrites[0]!.path).toBe(
      '/state/kodi-workspaces/agent_abc1234/IDENTITY.md',
    )
    expect(deps.fileWrites[0]!.content).toContain(`user_id: ${USER_A}`)
    expect(deps.fileWrites[0]!.content).toContain(`org_id: ${ORG}`)
    expect(deps.fileWrites[0]!.content).toContain(
      `created_at: ${FIXED_NOW.toISOString()}`,
    )

    expect(deps.configWrites).toHaveLength(1)
    const writtenList = deps.configWrites[0]!.agents?.list ?? []
    expect(writtenList).toEqual([
      {
        id: 'agent_abc1234',
        name: 'agent_abc1234',
        workspace: '/state/kodi-workspaces/agent_abc1234',
      },
    ])

    expect(deps.composioCalls).toEqual([
      { user_id: USER_A, openclaw_agent_id: 'agent_abc1234', composio_session: undefined },
    ])

    expect(deps.events).toEqual([
      {
        kind: 'agent.provisioned',
        payload: {
          user_id: USER_A,
          openclaw_agent_id: 'agent_abc1234',
          composio_status: 'active',
        },
      },
    ])

    const stored = deps.registry.getByUser(USER_A)
    expect(stored).toBeDefined()
    expect(stored?.openclaw_agent_id).toBe('agent_abc1234')
    expect(stored?.composio_status).toBe('active')
    expect(stored?.created_at).toBe(FIXED_NOW.toISOString())
  })

  test('idempotent: provisioning the same user twice returns the first result without re-creating', async () => {
    const deps = makeDeps({ agentIds: ['agent_first', 'agent_second'] })
    const first = await provisionAgent(deps, { user_id: USER_A })
    const second = await provisionAgent(deps, { user_id: USER_A })

    expect(second.created).toBe(false)
    expect(second.openclaw_agent_id).toBe(first.openclaw_agent_id)
    expect(deps.workspaceCalls).toHaveLength(1)
    expect(deps.fileWrites).toHaveLength(1)
    expect(deps.configWrites).toHaveLength(1)
    expect(deps.composioCalls).toHaveLength(1)
    expect(deps.events).toHaveLength(1)
  })

  test('composio failure surfaces as composio_status without throwing', async () => {
    const deps = makeDeps({
      agentIds: ['agent_bbb'],
      composioThrows: new Error('composio down'),
    })
    const result = await provisionAgent(deps, { user_id: USER_B })
    expect(result.composio_status).toBe('failed')
    // Still registered, still emits with failed status
    expect(deps.registry.getByUser(USER_B)?.composio_status).toBe('failed')
    expect(deps.events[0]).toEqual({
      kind: 'agent.provisioned',
      payload: {
        user_id: USER_B,
        openclaw_agent_id: 'agent_bbb',
        composio_status: 'failed',
      },
    })
  })

  test('preserves other config fields when writing agents.list', async () => {
    const deps = makeDeps({
      agentIds: ['agent_keep'],
      initialConfig: {
        agents: { list: [] },
        gateway: { port: 4567 },
        someOther: 'value',
      },
    })
    await provisionAgent(deps, { user_id: USER_A })
    const written = deps.configWrites[0]!
    expect(written.gateway).toEqual({ port: 4567 })
    expect(written.someOther).toBe('value')
  })

  test('appends to existing agents.list rather than replacing it', async () => {
    const deps = makeDeps({
      agentIds: ['agent_new'],
      initialConfig: {
        agents: {
          list: [{ id: 'main', name: 'main', workspace: '/main-workspace' }],
        },
      },
    })
    await provisionAgent(deps, { user_id: USER_A })
    const list = deps.configWrites[0]!.agents?.list ?? []
    expect(list).toHaveLength(2)
    expect(list[0]!.id).toBe('main')
    expect(list[1]!.id).toBe('agent_new')
  })

  test('does not duplicate an agents.list entry that already exists', async () => {
    // Defense-in-depth — startup reconcile races shouldn't create dup rows.
    const deps = makeDeps({
      agentIds: ['agent_existing'],
      initialConfig: {
        agents: {
          list: [
            {
              id: 'agent_existing',
              name: 'agent_existing',
              workspace: '/state/kodi-workspaces/agent_existing',
            },
          ],
        },
      },
    })
    await provisionAgent(deps, { user_id: USER_A })
    expect(deps.configWrites).toHaveLength(0)
  })

  test('passes through kodi_agent_id when provided', async () => {
    const KODI_UUID = '44444444-4444-4444-8444-444444444444'
    const deps = makeDeps({ agentIds: ['agent_kodi'] })
    await provisionAgent(deps, { user_id: USER_A, kodi_agent_id: KODI_UUID })
    expect(deps.registry.getByUser(USER_A)?.kodi_agent_id).toBe(KODI_UUID)
  })

  test('passes composio_session through to composio.registerToolsForAgent', async () => {
    const SESSION = { token: 'opaque' }
    const deps = makeDeps({ agentIds: ['agent_sess'] })
    await provisionAgent(deps, { user_id: USER_A, composio_session: SESSION })
    expect(deps.composioCalls[0]?.composio_session).toEqual(SESSION)
  })
})
