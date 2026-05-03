import { describe, expect, test } from 'bun:test'
import {
  buildAgentToolLoadout,
  computeEffectiveToolkitAllowlist,
  parseDefaultToolkitsEnv,
  rotateAgentToolLoadout,
  toolToComposioAction,
  type BuildAgentToolLoadoutResult,
  type ComposioToolFetcher,
  type ProvisionAgentForUserResult,
  type RawComposioTool,
  type RotateAgentToolLoadoutInput,
} from './composio-sessions'

const USER = '11111111-1111-4111-8111-111111111111'

const RAW_GMAIL_SEND: RawComposioTool = {
  slug: 'GMAIL_SEND_EMAIL',
  name: 'Send Email',
  description: 'Send an email via Gmail',
  toolkitSlug: 'gmail',
  inputParameters: { type: 'object', properties: { to: { type: 'string' } } },
}

const RAW_SLACK_POST: RawComposioTool = {
  slug: 'SLACK_POST_MESSAGE',
  name: 'Post Message',
  description: 'Post a message to a Slack channel',
  toolkit: { slug: 'slack' },
  inputParameters: { type: 'object' },
}

describe('toolToComposioAction', () => {
  test('maps a typical Composio tool to the plugin action shape', () => {
    expect(toolToComposioAction(RAW_GMAIL_SEND)).toEqual({
      name: 'gmail__send_email',
      description: 'Send an email via Gmail',
      parameters: { type: 'object', properties: { to: { type: 'string' } } },
      toolkit: 'gmail',
      action: 'send_email',
    })
  })

  test('falls back to nested toolkit.slug when toolkitSlug is absent', () => {
    expect(toolToComposioAction(RAW_SLACK_POST)).toEqual({
      name: 'slack__post_message',
      description: 'Post a message to a Slack channel',
      parameters: { type: 'object' },
      toolkit: 'slack',
      action: 'post_message',
    })
  })

  test('lowercases toolkit and slug', () => {
    expect(
      toolToComposioAction({
        slug: 'Github_Create_Issue',
        toolkitSlug: 'GitHub',
      }),
    ).toEqual({
      name: 'github__create_issue',
      description: '',
      parameters: null,
      toolkit: 'github',
      action: 'create_issue',
    })
  })

  test('falls back to the full lowered slug when toolkit prefix is absent', () => {
    // Defensive — Composio rarely (if ever) returns slugs that don't
    // start with the toolkit, but if it does we just keep the slug.
    expect(
      toolToComposioAction({
        slug: 'CUSTOM_THING',
        toolkitSlug: 'gmail',
      }),
    ).toEqual({
      name: 'gmail__custom_thing',
      description: '',
      parameters: null,
      toolkit: 'gmail',
      action: 'custom_thing',
    })
  })

  test('returns null when slug is missing', () => {
    expect(
      toolToComposioAction({
        slug: '' as string,
        toolkitSlug: 'gmail',
      }),
    ).toBeNull()
  })

  test('returns null when toolkit cannot be resolved', () => {
    expect(toolToComposioAction({ slug: 'GMAIL_SEND_EMAIL' })).toBeNull()
  })
})

describe('buildAgentToolLoadout', () => {
  test('empty allowlist returns ok with no actions, no fetch', async () => {
    let fetcherCalls = 0
    const fetcher: ComposioToolFetcher = async () => {
      fetcherCalls += 1
      return []
    }
    const result = await buildAgentToolLoadout({
      user_id: USER,
      toolkit_allowlist: [],
      composioToolFetcher: fetcher,
    })
    expect(result).toEqual<BuildAgentToolLoadoutResult>({
      actions: [],
      toolkits_with_actions: [],
      ok: true,
      error: null,
    })
    expect(fetcherCalls).toBe(0)
  })

  test('happy path maps every tool the fetcher returns', async () => {
    const fetcher: ComposioToolFetcher = async ({ user_id, toolkits }) => {
      expect(user_id).toBe(USER)
      expect(toolkits).toEqual(['gmail', 'slack'])
      return [RAW_GMAIL_SEND, RAW_SLACK_POST]
    }
    const result = await buildAgentToolLoadout({
      user_id: USER,
      toolkit_allowlist: ['gmail', 'slack'],
      composioToolFetcher: fetcher,
    })
    expect(result.ok).toBe(true)
    expect(result.actions).toHaveLength(2)
    expect(result.toolkits_with_actions).toEqual(['gmail', 'slack'])
  })

  test('skips tools that fail to map (no slug, no toolkit) without erroring', async () => {
    const fetcher: ComposioToolFetcher = async () => [
      RAW_GMAIL_SEND,
      { slug: 'NO_TOOLKIT' } as RawComposioTool,
      { slug: '' } as RawComposioTool,
    ]
    const result = await buildAgentToolLoadout({
      user_id: USER,
      toolkit_allowlist: ['gmail'],
      composioToolFetcher: fetcher,
    })
    expect(result.ok).toBe(true)
    expect(result.actions).toHaveLength(1)
    expect(result.actions[0]?.name).toBe('gmail__send_email')
  })

  test('Composio fetcher throws → ok=false with error message', async () => {
    const fetcher: ComposioToolFetcher = async () => {
      throw new Error('Composio is down')
    }
    const result = await buildAgentToolLoadout({
      user_id: USER,
      toolkit_allowlist: ['gmail'],
      composioToolFetcher: fetcher,
    })
    expect(result.ok).toBe(false)
    expect(result.error).toBe('Composio is down')
    expect(result.actions).toEqual([])
    expect(result.toolkits_with_actions).toEqual([])
  })

  test('toolkits_with_actions is sorted', async () => {
    const fetcher: ComposioToolFetcher = async () => [
      RAW_SLACK_POST,
      RAW_GMAIL_SEND,
      {
        slug: 'GITHUB_LIST_REPOS',
        toolkitSlug: 'github',
        inputParameters: {},
      } as RawComposioTool,
    ]
    const result = await buildAgentToolLoadout({
      user_id: USER,
      toolkit_allowlist: ['github', 'slack', 'gmail'],
      composioToolFetcher: fetcher,
    })
    expect(result.toolkits_with_actions).toEqual(['github', 'gmail', 'slack'])
  })
})

describe('rotateAgentToolLoadout (KOD-386)', () => {
  function fakeDb(opts: { member: { id: string } | null }) {
    return {
      query: {
        orgMembers: {
          findFirst: async () => opts.member ?? undefined,
        },
      },
    } as unknown as RotateAgentToolLoadoutInput['dbInstance']
  }

  test('returns rotated:false when the user has no org_members row', async () => {
    let called = false
    const provisionFn = (async () => {
      called = true
      return {} as ProvisionAgentForUserResult
    }) as unknown as RotateAgentToolLoadoutInput['provisionFn']

    const result = await rotateAgentToolLoadout({
      dbInstance: fakeDb({ member: null }),
      org_id: '11111111-1111-4111-8111-111111111111',
      user_id: USER,
      provisionFn,
    })
    expect(result.rotated).toBe(false)
    if (!result.rotated) {
      expect(result.reason).toBe('no-member-row')
    }
    expect(called).toBe(false)
  })

  test('delegates to provisionFn with the resolved org_member_id', async () => {
    const calls: Array<Record<string, unknown>> = []
    const provisionFn = (async (input: Record<string, unknown>) => {
      calls.push(input)
      return {
        openclaw_agent_id: 'agent_x',
        composio_status: 'active',
        registered_tool_count: 3,
      } as unknown as ProvisionAgentForUserResult
    }) as unknown as RotateAgentToolLoadoutInput['provisionFn']

    const result = await rotateAgentToolLoadout({
      dbInstance: fakeDb({ member: { id: 'member-1' } }),
      org_id: '11111111-1111-4111-8111-111111111111',
      user_id: USER,
      provisionFn,
    })
    expect(result.rotated).toBe(true)
    expect(calls).toHaveLength(1)
    expect(calls[0]?.org_member_id).toBe('member-1')
    expect(calls[0]?.user_id).toBe(USER)
  })
})

describe('parseDefaultToolkitsEnv (KOD-388)', () => {
  test('empty / unset returns empty set', () => {
    expect(parseDefaultToolkitsEnv(undefined).size).toBe(0)
    expect(parseDefaultToolkitsEnv('').size).toBe(0)
    expect(parseDefaultToolkitsEnv('  ').size).toBe(0)
  })

  test('splits, trims, lowercases, drops empties', () => {
    const set = parseDefaultToolkitsEnv('Gmail, Slack ,googlecalendar,,  github')
    expect(Array.from(set).sort()).toEqual([
      'github',
      'gmail',
      'googlecalendar',
      'slack',
    ])
  })

  test('single value', () => {
    const set = parseDefaultToolkitsEnv('gmail')
    expect(Array.from(set)).toEqual(['gmail'])
  })
})

describe('computeEffectiveToolkitAllowlist — env defaults (KOD-388)', () => {
  // We don't exercise the real DB; just stub `dbInstance` to return the
  // shapes the function reads. The two queries are
  // `listPersistedConnections` and `listToolkitPolicies`, both of which
  // accept a `db` and return promises.
  function fakeDb(opts: {
    connections: Array<{ toolkitSlug: string; connectedAccountStatus: string }>
    policies: Array<{ toolkitSlug: string; enabled?: boolean }>
  }) {
    // listPersistedConnections + listToolkitPolicies both accept a db and
    // call .query.<table>.findMany. They live in apps/api/src/lib/composio.ts
    // and route through the drizzle relational query API. Easiest stub:
    // reach into Drizzle's findMany shape.
    return {
      query: {
        toolkitConnections: {
          findMany: async () => opts.connections,
        },
        toolkitPolicies: {
          findMany: async () => opts.policies,
        },
      },
    } as unknown as Parameters<typeof computeEffectiveToolkitAllowlist>[0]['dbInstance']
  }

  test('policy empty + env default set: intersect connections with default', async () => {
    const result = await computeEffectiveToolkitAllowlist({
      dbInstance: fakeDb({
        connections: [
          { toolkitSlug: 'gmail', connectedAccountStatus: 'ACTIVE' },
          { toolkitSlug: 'slack', connectedAccountStatus: 'ACTIVE' },
          { toolkitSlug: 'github', connectedAccountStatus: 'ACTIVE' },
        ],
        policies: [],
      }),
      org_id: 'o1',
      user_id: USER,
      defaultToolkits: new Set(['gmail', 'slack']),
    })
    expect(result).toEqual(['gmail', 'slack'])
  })

  test('policy empty + no env default: fall back to all connected', async () => {
    const result = await computeEffectiveToolkitAllowlist({
      dbInstance: fakeDb({
        connections: [
          { toolkitSlug: 'gmail', connectedAccountStatus: 'ACTIVE' },
          { toolkitSlug: 'slack', connectedAccountStatus: 'ACTIVE' },
        ],
        policies: [],
      }),
      org_id: 'o1',
      user_id: USER,
      defaultToolkits: new Set(),
    })
    expect(result).toEqual(['gmail', 'slack'])
  })

  test('policy non-empty: env default is ignored, intersect with policy', async () => {
    const result = await computeEffectiveToolkitAllowlist({
      dbInstance: fakeDb({
        connections: [
          { toolkitSlug: 'gmail', connectedAccountStatus: 'ACTIVE' },
          { toolkitSlug: 'slack', connectedAccountStatus: 'ACTIVE' },
          { toolkitSlug: 'github', connectedAccountStatus: 'ACTIVE' },
        ],
        policies: [
          { toolkitSlug: 'gmail', enabled: true },
          { toolkitSlug: 'github', enabled: true },
          { toolkitSlug: 'slack', enabled: false },
        ],
      }),
      org_id: 'o1',
      user_id: USER,
      defaultToolkits: new Set(['slack']), // would match if env default applied
    })
    // policy wins: only gmail + github (slack disabled by policy)
    expect(result).toEqual(['github', 'gmail'])
  })

  test('inactive connections filtered regardless of policy/default', async () => {
    const result = await computeEffectiveToolkitAllowlist({
      dbInstance: fakeDb({
        connections: [
          { toolkitSlug: 'gmail', connectedAccountStatus: 'ACTIVE' },
          { toolkitSlug: 'slack', connectedAccountStatus: 'EXPIRED' },
        ],
        policies: [],
      }),
      org_id: 'o1',
      user_id: USER,
      defaultToolkits: new Set(['gmail', 'slack']),
    })
    expect(result).toEqual(['gmail'])
  })

  test('user has no connections at all: empty result', async () => {
    const result = await computeEffectiveToolkitAllowlist({
      dbInstance: fakeDb({ connections: [], policies: [] }),
      org_id: 'o1',
      user_id: USER,
      defaultToolkits: new Set(['gmail']),
    })
    expect(result).toEqual([])
  })

  test('policies exist but all enabled=false: nothing allowed (KOD-388 stricter behavior)', async () => {
    // Pre-KOD-388 code's `enabledToolkits.size === 0` predicate
    // accidentally treated "all disabled" the same as "no policies" and
    // allowed everything. The new logic distinguishes them: admin
    // explicitly disabled all toolkits → nothing allowed.
    const result = await computeEffectiveToolkitAllowlist({
      dbInstance: fakeDb({
        connections: [
          { toolkitSlug: 'gmail', connectedAccountStatus: 'ACTIVE' },
          { toolkitSlug: 'slack', connectedAccountStatus: 'ACTIVE' },
        ],
        policies: [
          { toolkitSlug: 'gmail', enabled: false },
          { toolkitSlug: 'slack', enabled: false },
        ],
      }),
      org_id: 'o1',
      user_id: USER,
      defaultToolkits: new Set(['gmail', 'slack']), // ignored — policy is non-empty
    })
    expect(result).toEqual([])
  })
})
