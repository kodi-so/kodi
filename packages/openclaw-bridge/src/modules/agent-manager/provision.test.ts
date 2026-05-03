import { describe, expect, test } from 'bun:test'
import {
  provisionAgent,
  type ConfigWithAgents,
  type ProvisionDeps,
} from './provision'
import { createAgentRegistry } from './registry'
import type { ComposioAction, ComposioModuleApi, ComposioStatus } from '../composio'
import type { Emitter } from '../event-bus/emitter'

const USER_A = '11111111-1111-4111-8111-111111111111'
const USER_B = '22222222-2222-4222-8222-222222222222'
const ORG = '33333333-3333-4333-8333-333333333333'
const FIXED_NOW = new Date('2026-05-02T12:00:00.000Z')

const ACTION_GMAIL: ComposioAction = {
  name: 'gmail__send_email',
  description: 'Send a Gmail message',
  parameters: { type: 'object' },
  toolkit: 'gmail',
  action: 'send_email',
}
const ACTION_SLACK: ComposioAction = {
  name: 'slack__post_message',
  description: 'Post a Slack message',
  parameters: { type: 'object' },
  toolkit: 'slack',
  action: 'post_message',
}

type EmittedEvent = { kind: string; payload: unknown }
type WorkspaceCall = { dir: string; ensureBootstrapFiles?: boolean }
type FileWrite = { path: string; content: string }
type ComposioCall = {
  user_id: string
  openclaw_agent_id: string
  composio_session_id?: string | null
  actions: readonly ComposioAction[]
}

function makeDeps(opts: {
  registry?: ReturnType<typeof createAgentRegistry>
  initialConfig?: ConfigWithAgents
  composioStatus?: ComposioStatus
  composioThrows?: Error
  composioToolCount?: number
  agentIds?: string[]
}): ProvisionDeps & {
  events: EmittedEvent[]
  workspaceCalls: WorkspaceCall[]
  fileWrites: FileWrite[]
  configWrites: ConfigWithAgents[]
  composioCalls: ComposioCall[]
} {
  const registry = opts.registry ?? createAgentRegistry()
  const events: EmittedEvent[] = []
  const workspaceCalls: WorkspaceCall[] = []
  const fileWrites: FileWrite[] = []
  const configWrites: ConfigWithAgents[] = []
  const composioCalls: ComposioCall[] = []

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
      return {
        status: opts.composioStatus ?? 'active',
        registered_tool_count:
          opts.composioToolCount ?? params.actions.length,
      }
    },
    runActionForAgent: async () => ({ kind: 'failed', reason: 'no_session', message: 'mock' }),
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

describe('provisionAgent — first-time path', () => {
  test('creates workspace, writes IDENTITY, updates config, registers composio with actions, emits event, adds to registry', async () => {
    const deps = makeDeps({ agentIds: ['agent_abc1234'] })
    const result = await provisionAgent(deps, {
      user_id: USER_A,
      composio_session_id: 'sess_xyz',
      actions: [ACTION_GMAIL],
    })

    expect(result.created).toBe(true)
    expect(result.openclaw_agent_id).toBe('agent_abc1234')
    expect(result.workspace_dir).toBe('/state/kodi-workspaces/agent_abc1234')
    expect(result.composio_status).toBe('active')
    expect(result.registered_tool_count).toBe(1)

    expect(deps.workspaceCalls).toEqual([
      { dir: '/state/kodi-workspaces/agent_abc1234', ensureBootstrapFiles: true },
    ])

    expect(deps.fileWrites).toHaveLength(1)
    expect(deps.fileWrites[0]!.path).toBe(
      '/state/kodi-workspaces/agent_abc1234/IDENTITY.md',
    )
    expect(deps.fileWrites[0]!.content).toContain(`user_id: ${USER_A}`)
    expect(deps.fileWrites[0]!.content).toContain(`org_id: ${ORG}`)

    expect(deps.composioCalls).toEqual([
      {
        user_id: USER_A,
        openclaw_agent_id: 'agent_abc1234',
        composio_session_id: 'sess_xyz',
        actions: [ACTION_GMAIL],
      },
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
    expect(stored?.composio_status).toBe('active')
  })

  test('empty actions list: agent provisions with registered_tool_count=0', async () => {
    const deps = makeDeps({ agentIds: ['agent_empty'] })
    const result = await provisionAgent(deps, {
      user_id: USER_A,
      actions: [],
    })
    expect(result.created).toBe(true)
    expect(result.registered_tool_count).toBe(0)
    expect(deps.composioCalls[0]?.actions).toEqual([])
  })

  test('composio failure surfaces as composio_status without throwing', async () => {
    const deps = makeDeps({
      agentIds: ['agent_bbb'],
      composioThrows: new Error('composio down'),
    })
    const result = await provisionAgent(deps, {
      user_id: USER_B,
      actions: [ACTION_GMAIL],
    })
    expect(result.composio_status).toBe('failed')
    expect(result.registered_tool_count).toBe(0)
    expect(deps.events[0]).toEqual({
      kind: 'agent.provisioned',
      payload: {
        user_id: USER_B,
        openclaw_agent_id: 'agent_bbb',
        composio_status: 'failed',
      },
    })
  })

  test('passes through kodi_agent_id when provided', async () => {
    const KODI_UUID = '44444444-4444-4444-8444-444444444444'
    const deps = makeDeps({ agentIds: ['agent_kodi'] })
    await provisionAgent(deps, {
      user_id: USER_A,
      kodi_agent_id: KODI_UUID,
      actions: [],
    })
    expect(deps.registry.getByUser(USER_A)?.kodi_agent_id).toBe(KODI_UUID)
  })

  test('openclaw_agent_id override (KOD-387) wins over the factory', async () => {
    const deps = makeDeps({ agentIds: ['agent_factory_default'] })
    const result = await provisionAgent(deps, {
      user_id: USER_A,
      actions: [],
      openclaw_agent_id: 'kodi-member-agent-explicit',
    })
    expect(result.openclaw_agent_id).toBe('kodi-member-agent-explicit')
    expect(result.workspace_dir).toBe(
      '/state/kodi-workspaces/kodi-member-agent-explicit',
    )
    const stored = deps.registry.getByUser(USER_A)
    expect(stored?.openclaw_agent_id).toBe('kodi-member-agent-explicit')
  })

  test('null composio_session_id is normalized and passed through', async () => {
    const deps = makeDeps({ agentIds: ['agent_nosess'] })
    await provisionAgent(deps, {
      user_id: USER_A,
      composio_session_id: null,
      actions: [],
    })
    expect(deps.composioCalls[0]?.composio_session_id).toBeNull()
  })
})

describe('provisionAgent — re-provision path (idempotent)', () => {
  test('existing user: returns same openclaw_agent_id, syncs composio with new actions, no workspace/identity/config writes, no event re-emit', async () => {
    const deps = makeDeps({ agentIds: ['agent_existing'] })
    // First call to seed registry
    await provisionAgent(deps, {
      user_id: USER_A,
      actions: [ACTION_GMAIL],
    })
    // Reset capture buffers to focus on re-provision side effects
    deps.workspaceCalls.length = 0
    deps.fileWrites.length = 0
    deps.configWrites.length = 0
    deps.events.length = 0
    deps.composioCalls.length = 0

    const second = await provisionAgent(deps, {
      user_id: USER_A,
      composio_session_id: 'sess_new',
      actions: [ACTION_GMAIL, ACTION_SLACK],
    })

    expect(second.created).toBe(false)
    expect(second.openclaw_agent_id).toBe('agent_existing')
    expect(second.registered_tool_count).toBe(2)
    expect(second.composio_status).toBe('active')

    // No filesystem / config side effects on the re-provision path
    expect(deps.workspaceCalls).toEqual([])
    expect(deps.fileWrites).toEqual([])
    expect(deps.configWrites).toEqual([])
    expect(deps.events).toEqual([])

    // BUT composio.registerToolsForAgent IS called with the updated set
    expect(deps.composioCalls).toEqual([
      {
        user_id: USER_A,
        openclaw_agent_id: 'agent_existing',
        composio_session_id: 'sess_new',
        actions: [ACTION_GMAIL, ACTION_SLACK],
      },
    ])
  })

  test('re-provision propagates composio_status changes onto the registry', async () => {
    const deps = makeDeps({ agentIds: ['agent_evolving'] })
    await provisionAgent(deps, { user_id: USER_A, actions: [ACTION_GMAIL] })
    expect(deps.registry.getByUser(USER_A)?.composio_status).toBe('active')

    // Flip composio to failed for the next call
    deps.composio = {
      registerToolsForAgent: async () => ({
        status: 'failed',
        registered_tool_count: 0,
      }),
      runActionForAgent: async () => ({ kind: 'failed', reason: 'no_session', message: 'mock' }),
      unregisterToolsForAgent: async () => {},
    }

    const second = await provisionAgent(deps, {
      user_id: USER_A,
      actions: [ACTION_GMAIL],
    })
    expect(second.composio_status).toBe('failed')
    expect(deps.registry.getByUser(USER_A)?.composio_status).toBe('failed')
  })

  test('re-provision with empty actions: agent stays alive, registered_tool_count=0', async () => {
    const deps = makeDeps({ agentIds: ['agent_revoked'] })
    await provisionAgent(deps, { user_id: USER_A, actions: [ACTION_GMAIL] })
    deps.composioCalls.length = 0

    const second = await provisionAgent(deps, {
      user_id: USER_A,
      actions: [],
    })
    expect(second.created).toBe(false)
    expect(second.registered_tool_count).toBe(0)
    expect(deps.registry.getByUser(USER_A)).toBeDefined()
    expect(deps.composioCalls[0]?.actions).toEqual([])
  })
})

describe('provisionAgent — config preservation', () => {
  test('preserves other config fields when writing agents.list', async () => {
    const deps = makeDeps({
      agentIds: ['agent_keep'],
      initialConfig: {
        agents: { list: [] },
        gateway: { port: 4567 },
        someOther: 'value',
      },
    })
    await provisionAgent(deps, { user_id: USER_A, actions: [] })
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
    await provisionAgent(deps, { user_id: USER_A, actions: [] })
    const list = deps.configWrites[0]!.agents?.list ?? []
    expect(list).toHaveLength(2)
    expect(list[0]!.id).toBe('main')
    expect(list[1]!.id).toBe('agent_new')
  })

  test('does not duplicate an agents.list entry that already exists', async () => {
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
    await provisionAgent(deps, { user_id: USER_A, actions: [] })
    expect(deps.configWrites).toHaveLength(0)
  })
})
