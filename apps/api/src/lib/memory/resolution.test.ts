import { describe, expect, it } from 'bun:test'
import type { MemoryUpdateEvaluation } from './evaluation'
import { normalizeMemoryUpdateEvent } from './events'
import {
  resolveMemoryUpdatePlan,
  type MemoryResolutionAccess,
  type MemoryResolutionDeps,
  type MemoryResolutionPath,
  type ResolvedMemoryVault,
} from './resolution'

type MemoryResolutionCompletionFn = NonNullable<
  MemoryResolutionDeps['completeResolutionChat']
>
type MemoryResolutionCompletionResult = Awaited<
  ReturnType<MemoryResolutionCompletionFn>
>

type AccessFixture = {
  access: MemoryResolutionAccess
}

function createResolutionCompletion(
  resolver: (
    input: Parameters<MemoryResolutionCompletionFn>[0]
  ) => Record<string, unknown>
): MemoryResolutionCompletionFn {
  return async (input) =>
    ({
      ok: true as const,
      content: JSON.stringify(resolver(input)),
      connection: {
        instance: {} as never,
        instanceUrl: 'https://openclaw.test',
        headers: {},
        model: 'openclaw/default',
        routedAgent: {
          id: 'agent_123',
          agentType: input.visibility === 'private' ? 'member' : 'org',
          openclawAgentId: 'agent_123',
          status: 'active',
        },
        fallbackToDefaultAgent: false,
      },
    } satisfies Extract<MemoryResolutionCompletionResult, { ok: true }>)
}

function createAccessFixture(): AccessFixture {
  const orgVault: ResolvedMemoryVault = {
    id: 'vault_org',
    orgId: 'org_123',
    scopeType: 'org',
    orgMemberId: null,
    rootPath: 'memory/org_123/org',
    manifestPath: 'memory/org_123/org/MEMORY.md',
  }

  const memberVault: ResolvedMemoryVault = {
    id: 'vault_member',
    orgId: 'org_123',
    scopeType: 'member',
    orgMemberId: 'org_member_123',
    rootPath: 'memory/org_123/members/org_member_123',
    manifestPath: 'memory/org_123/members/org_member_123/MEMORY.md',
  }

  const files = new Map<string, string>([
    [
      'vault_org:MEMORY.md',
      `# Kodi Memory

## Scope

This vault represents shared Kodi memory for the organization "Acme".

## Important entry points

- \`Projects/PROJECTS.md\` — project navigation and file ownership
- \`Current State/CURRENT-STATE.md\` — current org-wide state

## Directory guide

- \`Projects/\` — Shared project memory, plans, status, milestones, risks, and ownership.
- \`Customers/\` — Durable customer context, relationships, history, and active commitments.
- \`Processes/\` — Repeatable team processes, operating norms, and decision workflows.
- \`Current State/\` — What the organization is actively tracking right now: current state, next steps, and owners.
`,
    ],
    [
      'vault_org:Projects/PROJECTS.md',
      `# Projects

## What belongs here

Shared project memory, plans, status, milestones, risks, and ownership.

## What files exist here

- \`Launch Checklist.md\` — rollout ownership and remaining steps

## What each file is for

- \`Launch Checklist.md\` — owns the launch checklist, rollout status, and follow-up ownership.
`,
    ],
    [
      'vault_org:Projects/Launch Checklist.md',
      `# Launch Checklist

The launch checklist tracks rollout owners, timeline, and remaining project steps.
`,
    ],
    [
      'vault_org:Current State/CURRENT-STATE.md',
      `# Current State

## What belongs here

Current org-wide state, next steps, and owners.
`,
    ],
    [
      'vault_member:MEMORY.md',
      `# Kodi Memory

## Scope

This vault represents private Kodi member memory.

## Important entry points

- \`Preferences/PREFERENCES.md\` — working preferences and communication norms
- \`Current Work/CURRENT-WORK.md\` — active focus and next steps

## Directory guide

- \`Preferences/\` — User-specific preferences, communication patterns, and working style that Kodi should preserve in private member interactions.
- \`Responsibilities/\` — Private or member-scoped responsibilities, ownership areas, and commitments tied to this org member.
- \`Current Work/\` — The member’s active work, next steps, and current focus within this organization.
- \`Relationships/\` — Member-specific relationship context and collaboration patterns that should stay private-scoped.
`,
    ],
    [
      'vault_member:Preferences/PREFERENCES.md',
      `# Preferences

## What belongs here

User-specific preferences, communication patterns, and working style.

## What files exist here

- This directory starts with only this index file.

## What each file is for

- \`PREFERENCES.md\` tracks what belongs in this directory and helps Kodi navigate member memory without reading broadly.
`,
    ],
  ])

  const paths = new Map<string, MemoryResolutionPath[]>([
    [
      'vault_org:',
      [
        directory('Projects'),
        directory('Customers'),
        directory('Processes'),
        directory('Current State'),
      ],
    ],
    [
      'vault_org:Projects',
      [
        indexFile('Projects/PROJECTS.md', 'Projects index'),
        file('Projects/Launch Checklist.md', 'Launch Checklist'),
      ],
    ],
    [
      'vault_org:Current State',
      [indexFile('Current State/CURRENT-STATE.md', 'Current State index')],
    ],
    [
      'vault_member:',
      [
        directory('Preferences'),
        directory('Responsibilities'),
        directory('Current Work'),
        directory('Relationships'),
      ],
    ],
    [
      'vault_member:Preferences',
      [indexFile('Preferences/PREFERENCES.md', 'Preferences index')],
    ],
  ])

  const allPaths = new Map<string, MemoryResolutionPath>()
  for (const entries of paths.values()) {
    for (const entry of entries) {
      allPaths.set(`path:${entry.path}`, entry)
    }
  }

  return {
    access: {
      async resolveVault(input) {
        return input.scope === 'org' ? orgVault : memberVault
      },
      async listPaths(input) {
        return paths.get(`${input.vaultId}:${input.parentPath ?? ''}`) ?? []
      },
      async getPath(input) {
        return allPaths.get(`path:${input.path}`) ?? null
      },
      async searchPaths(input) {
        const queryWords = normalize(input.query)
          .split(/\s+/)
          .filter((word) => word.length >= 3)

        return [...files.entries()]
          .filter(([key]) => key.startsWith(`${input.vaultId}:`))
          .map(([key, content]) => {
            const path = key.split(':').slice(1).join(':')
            const text = normalize(`${path} ${content}`)
            const rank = queryWords.reduce(
              (score, word) => score + (text.includes(word) ? 1 : 0),
              0
            )
            const metadata = allPaths.get(`path:${path}`)
            if (!metadata || rank === 0) return null

            return {
              ...metadata,
              rank,
            }
          })
          .filter((item): item is NonNullable<typeof item> => Boolean(item))
          .sort((left, right) => right.rank - left.rank)
          .slice(0, input.limit)
      },
      async readFile(input) {
        const content = files.get(`${input.vault.id}:${input.path}`)
        if (!content) {
          throw new Error(`Missing file fixture for ${input.vault.id}:${input.path}`)
        }

        return content
      },
    },
  }
}

function directory(path: string): MemoryResolutionPath {
  return {
    path,
    pathType: 'directory',
    parentPath: null,
    title: path,
    isManifest: false,
    isIndex: false,
    lastUpdatedAt: new Date('2026-05-01T00:00:00.000Z'),
  }
}

function indexFile(path: string, title: string): MemoryResolutionPath {
  return {
    path,
    pathType: 'file',
    parentPath: dirname(path),
    title,
    isManifest: false,
    isIndex: true,
    lastUpdatedAt: new Date('2026-05-01T00:00:00.000Z'),
  }
}

function file(path: string, title: string): MemoryResolutionPath {
  return {
    path,
    pathType: 'file',
    parentPath: dirname(path),
    title,
    isManifest: false,
    isIndex: false,
    lastUpdatedAt: new Date('2026-05-01T00:00:00.000Z'),
  }
}

function dirname(path: string) {
  const parts = path.split('/')
  return parts.slice(0, -1).join('/')
}

function normalize(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
}

function baseEvaluation(
  overrides: Partial<MemoryUpdateEvaluation>
): MemoryUpdateEvaluation {
  return {
    scope: 'org',
    action: 'update_existing',
    durability: 'durable',
    shouldWrite: true,
    confidence: 'high',
    rationale: ['fixture'],
    signalTags: [],
    memoryKind: 'other',
    topicLabel: null,
    topicSummary: null,
    topicKeywords: [],
    guardrailsApplied: [],
    engine: 'openclaw',
    ...overrides,
  }
}

describe('resolveMemoryUpdatePlan', () => {
  it('uses model-guided targeted search to update an existing org file', async () => {
    const { access } = createAccessFixture()
    const event = normalizeMemoryUpdateEvent({
      orgId: 'org_123',
      source: 'app_chat',
      occurredAt: '2026-05-01T10:00:00.000Z',
      visibility: 'shared',
      summary: 'Shared app chat thread received a new assistant turn.',
      actor: {
        userId: 'user_123',
        orgMemberId: 'org_member_123',
      },
      metadata: {
        userMessage:
          'We decided to move the launch checklist into the roadmap and Maya owns the follow-up.',
      },
      payload: {
        threadId: 'thread_123',
        messageId: 'message_123',
      },
    })

    const plan = await resolveMemoryUpdatePlan(
      event,
      baseEvaluation({
        scope: 'org',
        topicLabel: 'Launch checklist ownership',
        topicKeywords: ['launch checklist', 'owner'],
      }),
      {
        access,
        completeResolutionChat: createResolutionCompletion(() => ({
          action: 'update_existing',
          targetDirectoryPath: 'Projects',
          targetFilePath: 'Projects/Launch Checklist.md',
          requiredReads: ['Projects/PROJECTS.md', 'Projects/Launch Checklist.md'],
          requiresIndexRepair: false,
          requiresManifestRepair: false,
          confidence: 'high',
          rationale: ['The existing Launch Checklist file already owns this topic.'],
        })),
      }
    )

    expect(plan.scopes).toHaveLength(1)
    expect(plan.scopes[0]?.scope).toBe('org')
    expect(plan.scopes[0]?.directoryPath).toBe('Projects')
    expect(plan.scopes[0]?.targetPath).toBe('Projects/Launch Checklist.md')
    expect(plan.scopes[0]?.action).toBe('update_existing')
    expect(plan.scopes[0]?.requiredReads).toEqual([
      'MEMORY.md',
      'Projects/PROJECTS.md',
      'Projects/Launch Checklist.md',
    ])
  })

  it('creates a new member file from a model-proposed path', async () => {
    const { access } = createAccessFixture()
    const event = normalizeMemoryUpdateEvent({
      orgId: 'org_123',
      source: 'dashboard_assistant',
      occurredAt: '2026-05-01T10:00:00.000Z',
      visibility: 'private',
      summary: 'Dashboard assistant thread received a new assistant turn.',
      actor: {
        userId: 'user_123',
        orgMemberId: 'org_member_123',
      },
      metadata: {
        userMessage: 'Remember that I prefer async recaps.',
      },
      payload: {
        threadId: 'thread_123',
        messageId: 'message_123',
      },
    })

    const plan = await resolveMemoryUpdatePlan(
      event,
      baseEvaluation({
        scope: 'member',
        topicLabel: 'Async recap preference',
        topicKeywords: ['async recaps'],
      }),
      {
        access,
        completeResolutionChat: createResolutionCompletion(() => ({
          action: 'create_new',
          targetDirectoryPath: 'Preferences',
          targetFilePath: 'Preferences/Async Recaps.md',
          requiredReads: ['Preferences/PREFERENCES.md'],
          requiresIndexRepair: true,
          requiresManifestRepair: false,
          confidence: 'high',
          rationale: ['The preference belongs in the Preferences area and no existing file owns it.'],
        })),
      }
    )

    expect(plan.scopes).toHaveLength(1)
    expect(plan.scopes[0]?.scope).toBe('member')
    expect(plan.scopes[0]?.directoryPath).toBe('Preferences')
    expect(plan.scopes[0]?.action).toBe('create_new')
    expect(plan.scopes[0]?.targetPath).toBe('Preferences/Async Recaps.md')
    expect(plan.scopes[0]?.requiresIndexRepair).toBe(true)
  })

  it('builds one scoped plan per target when the evaluator routes to both', async () => {
    const { access } = createAccessFixture()
    const event = normalizeMemoryUpdateEvent({
      orgId: 'org_123',
      source: 'app_chat',
      occurredAt: '2026-05-01T10:00:00.000Z',
      visibility: 'shared',
      summary: 'Shared app chat thread received a new assistant turn.',
      actor: {
        userId: 'user_123',
        orgMemberId: 'org_member_123',
      },
      metadata: {
        userMessage:
          'We agreed to send the customer recap tomorrow, and I want Kodi to remember that I prefer drafting the follow-up myself.',
      },
      payload: {
        threadId: 'thread_123',
        messageId: 'message_123',
      },
    })

    const plan = await resolveMemoryUpdatePlan(
      event,
      baseEvaluation({
        scope: 'both',
        topicLabel: 'Customer follow-up and drafting preference',
        topicKeywords: ['customer recap', 'follow-up', 'drafting'],
      }),
      {
        access,
        completeResolutionChat: createResolutionCompletion((input) =>
          input.visibility === 'shared'
            ? {
                action: 'create_new',
                targetDirectoryPath: 'Projects',
                targetFilePath: 'Projects/Customer Recap Follow-up.md',
                requiredReads: ['Projects/PROJECTS.md'],
                requiresIndexRepair: true,
                requiresManifestRepair: false,
                confidence: 'medium',
                rationale: ['The org side is a shared follow-up commitment that fits the Projects area.'],
              }
            : {
                action: 'create_new',
                targetDirectoryPath: 'Responsibilities',
                targetFilePath: 'Responsibilities/Follow-up Drafting Preference.md',
                requiredReads: [],
                requiresIndexRepair: true,
                requiresManifestRepair: false,
                confidence: 'medium',
                rationale: ['The member side is a personal working preference about handling follow-up drafts.'],
              }
        ),
      }
    )

    expect(plan.scopes.map((scope) => scope.scope)).toEqual(['org', 'member'])
    expect(plan.scopes[0]?.directoryPath).toBe('Projects')
    expect(plan.scopes[1]?.directoryPath).toBe('Responsibilities')
  })
})
