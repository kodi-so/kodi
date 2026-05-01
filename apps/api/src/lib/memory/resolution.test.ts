import { describe, expect, it } from 'bun:test'
import type { MemoryUpdateEvaluation } from './evaluation'
import { normalizeMemoryUpdateEvent } from './events'
import {
  resolveMemoryUpdatePlan,
  type MemoryResolutionAccess,
  type MemoryResolutionPath,
  type ResolvedMemoryVault,
} from './resolution'

type AccessFixture = {
  access: MemoryResolutionAccess
  orgVault: ResolvedMemoryVault
  memberVault: ResolvedMemoryVault
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
    ['vault_org:Current State', [indexFile('Current State/CURRENT-STATE.md', 'Current State index')]],
    [
      'vault_member:',
      [
        directory('Preferences'),
        directory('Responsibilities'),
        directory('Current Work'),
        directory('Relationships'),
      ],
    ],
    ['vault_member:Preferences', [indexFile('Preferences/PREFERENCES.md', 'Preferences index')]],
  ])

  const allPaths = new Map<string, MemoryResolutionPath>()
  for (const entries of paths.values()) {
    for (const entry of entries) {
      allPaths.set(`${entry.parentPath ?? dirname(entry.path)}:${entry.path}`, entry)
      allPaths.set(`path:${entry.path}`, entry)
    }
  }

  const access: MemoryResolutionAccess = {
    async resolveVault(input) {
      return input.scope === 'org' ? orgVault : memberVault
    },
    async listPaths(input) {
      const key = `${input.vaultId}:${input.parentPath ?? ''}`
      return paths.get(key) ?? []
    },
    async getPath(input) {
      return allPaths.get(`path:${input.path}`) ?? null
    },
    async searchPaths(input) {
      const queryWords = normalize(input.query)
        .split(/\s+/)
        .filter((word) => word.length >= 3)

      const matches = [...files.entries()]
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

      return matches
    },
    async readFile(input) {
      const key = `${input.vault.id}:${input.path}`
      const content = files.get(key)
      if (!content) {
        throw new Error(`Missing file fixture for ${key}`)
      }

      return content
    },
  }

  return { access, orgVault, memberVault }
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
    guardrailsApplied: [],
    engine: 'openclaw',
    ...overrides,
  }
}

describe('resolveMemoryUpdatePlan', () => {
  it('uses targeted search to update an existing org project file', async () => {
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
        memoryKind: 'project',
        signalTags: ['launch_checklist', 'owner_change'],
      }),
      { access }
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

  it('creates a new member preference file when no existing file owns the topic', async () => {
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
        memoryKind: 'preference',
        signalTags: ['async_recaps'],
      }),
      { access }
    )

    expect(plan.scopes).toHaveLength(1)
    expect(plan.scopes[0]?.scope).toBe('member')
    expect(plan.scopes[0]?.directoryPath).toBe('Preferences')
    expect(plan.scopes[0]?.action).toBe('create_new')
    expect(plan.scopes[0]?.targetPath).toBe('Preferences/Async Recaps.md')
    expect(plan.scopes[0]?.requiresIndexRepair).toBe(true)
  })

  it('builds one scope plan per target when evaluation routes to both', async () => {
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
        memoryKind: 'responsibility',
        signalTags: ['customer_follow_up', 'personal_preference'],
      }),
      { access }
    )

    expect(plan.scopes.map((scope) => scope.scope)).toEqual(['org', 'member'])
    expect(plan.scopes[0]?.directoryPath).toBe('Projects')
    expect(plan.scopes[1]?.directoryPath).toBe('Responsibilities')
  })
})
