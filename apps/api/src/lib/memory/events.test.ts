import { describe, expect, it } from 'bun:test'
import type { MemoryEvaluationDeps } from './evaluation'
import type { MemoryResolutionAccess, MemoryResolutionPath, ResolvedMemoryVault } from './resolution'
import {
  createLatestOnlyMemoryUpdateScheduler,
  dispatchOpenClawMemoryProposal,
  dispatchProductMemoryEvent,
  normalizeMemoryUpdateEvent,
} from './events'

type MemoryCompletionFn = NonNullable<MemoryEvaluationDeps['completeChat']>
type MemoryCompletionResult = Awaited<ReturnType<MemoryCompletionFn>>

function createResolutionAccess(): MemoryResolutionAccess {
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

## Important entry points

- \`Current State/CURRENT-STATE.md\` — current org-wide state

## Directory guide

- \`Current State/\` — What the organization is actively tracking right now: current state, next steps, and owners.
`,
    ],
    [
      'vault_org:Current State/CURRENT-STATE.md',
      '# Current State\n\n## What belongs here\n\nCurrent org-wide state.\n',
    ],
    [
      'vault_member:MEMORY.md',
      `# Kodi Memory

## Important entry points

- \`Preferences/PREFERENCES.md\` — working preferences and communication norms

## Directory guide

- \`Preferences/\` — User-specific preferences, communication patterns, and working style that Kodi should preserve in private member interactions.
`,
    ],
    [
      'vault_member:Preferences/PREFERENCES.md',
      '# Preferences\n\n## What belongs here\n\nWorking preferences.\n',
    ],
  ])

  const pathMap = new Map<string, MemoryResolutionPath[]>([
    [
      'vault_org:',
      [directory('Current State')],
    ],
    [
      'vault_org:Current State',
      [indexFile('Current State/CURRENT-STATE.md', 'Current State index')],
    ],
    [
      'vault_member:',
      [directory('Preferences')],
    ],
    [
      'vault_member:Preferences',
      [indexFile('Preferences/PREFERENCES.md', 'Preferences index')],
    ],
  ])

  return {
    async resolveVault(input) {
      return input.scope === 'org' ? orgVault : memberVault
    },
    async listPaths(input) {
      return pathMap.get(`${input.vaultId}:${input.parentPath ?? ''}`) ?? []
    },
    async getPath() {
      return null
    },
    async searchPaths() {
      return []
    },
    async readFile(input) {
      const content = files.get(`${input.vault.id}:${input.path}`)
      if (!content) throw new Error(`Missing fixture for ${input.vault.id}:${input.path}`)
      return content
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
    parentPath: path.split('/').slice(0, -1).join('/'),
    title,
    isManifest: false,
    isIndex: true,
    lastUpdatedAt: new Date('2026-05-01T00:00:00.000Z'),
  }
}

function createModelCompletion(
  payload: Record<string, unknown>
): MemoryCompletionFn {
  return async () => ({
    ok: true as const,
    content: JSON.stringify(payload),
    connection: {
      instance: {} as never,
      instanceUrl: 'https://openclaw.test',
      headers: {},
      model: 'openclaw/default',
      routedAgent: {
        id: 'agent_123',
        agentType: 'org' as const,
        openclawAgentId: 'agent_123',
        status: 'active' as const,
      },
      fallbackToDefaultAgent: false,
    },
  } satisfies Extract<MemoryCompletionResult, { ok: true }>)
}

function deferred() {
  let resolve!: () => void
  const promise = new Promise<void>((res) => {
    resolve = res
  })
  return { promise, resolve }
}

describe('normalizeMemoryUpdateEvent', () => {
  it('assigns a stable dedupe key for meeting evidence', () => {
    const event = normalizeMemoryUpdateEvent({
      orgId: 'org_123',
      source: 'meeting',
      occurredAt: '2026-04-30T12:00:00.000Z',
      visibility: 'shared',
      summary: 'Meeting completed with new decisions.',
      payload: {
        meetingSessionId: 'meeting_123',
        eventId: 'event_123',
        lastEventSequence: 42,
        trigger: 'completed',
      },
    })

    expect(event.id).toBeTruthy()
    expect(event.occurredAt).toBeInstanceOf(Date)
    expect(event.dedupeKey).toBe('meeting:org_123:meeting_123')
  })

  it('preserves explicit dedupe keys when callers provide one', () => {
    const event = normalizeMemoryUpdateEvent({
      orgId: 'org_123',
      source: 'user_request',
      occurredAt: new Date('2026-04-30T12:00:00.000Z'),
      summary: 'User asked Kodi to refresh the process memory.',
      dedupeKey: 'memory-ui:request_123',
      payload: {
        requestId: 'request_123',
        surface: 'memory_ui',
        path: 'Processes/PROCESSES.md',
      },
    })

    expect(event.dedupeKey).toBe('memory-ui:request_123')
  })
})

describe('createLatestOnlyMemoryUpdateScheduler', () => {
  it('coalesces overlapping events to the latest event per dedupe key', async () => {
    const gate = deferred()
    const seen: string[] = []

    const schedule = createLatestOnlyMemoryUpdateScheduler(async (job) => {
      seen.push(job.event.summary)

      if (job.event.summary === 'First change') {
        await gate.promise
      }

      return {
        status: 'ignored' as const,
        reason: 'low-information' as const,
        event: job.event,
        evaluation: {
          scope: 'none' as const,
          action: 'ignore' as const,
          durability: 'unknown' as const,
          shouldWrite: false,
          confidence: 'low' as const,
          rationale: ['placeholder'],
          signalTags: [],
          memoryKind: 'other' as const,
          guardrailsApplied: [],
          engine: 'guardrail-fallback' as const,
          ignoredReason: 'low-information' as const,
        },
      }
    })

    const run1 = schedule({
      orgId: 'org_123',
      source: 'app_chat',
      occurredAt: '2026-04-30T12:00:00.000Z',
      visibility: 'private',
      summary: 'First change',
      payload: {
        threadId: 'thread_123',
        messageId: 'message_1',
      },
    })

    const run2 = schedule({
      orgId: 'org_123',
      source: 'app_chat',
      occurredAt: '2026-04-30T12:00:10.000Z',
      visibility: 'private',
      summary: 'Second change',
      payload: {
        threadId: 'thread_123',
        messageId: 'message_2',
      },
    })

    const run3 = schedule({
      orgId: 'org_123',
      source: 'app_chat',
      occurredAt: '2026-04-30T12:00:20.000Z',
      visibility: 'private',
      summary: 'Third change',
      payload: {
        threadId: 'thread_123',
        messageId: 'message_3',
      },
    })

    gate.resolve()
    const result = await Promise.all([run1, run2, run3])

    expect(seen).toEqual(['First change', 'Third change'])
    expect(result[0].event.summary).toBe('Third change')
    expect(result[1].event.summary).toBe('Third change')
    expect(result[2].event.summary).toBe('Third change')
  })
})

describe('memory update dispatch entrypoints', () => {
  it('accepts product events through the product dispatcher', async () => {
    const result = await dispatchProductMemoryEvent({
      orgId: 'org_123',
      source: 'dashboard_assistant',
      occurredAt: '2026-04-30T12:00:00.000Z',
      visibility: 'private',
      summary: 'Dashboard conversation revealed a stable preference.',
      actor: {
        userId: 'user_123',
        orgMemberId: 'org_member_123',
      },
      payload: {
        threadId: 'thread_123',
        messageId: 'message_123',
      },
    }, {
      completeChat: createModelCompletion({
        shouldWrite: true,
        scope: 'member',
        action: 'update_existing',
        durability: 'durable',
        confidence: 'high',
        memoryKind: 'preference',
        rationale: ['The event captures a durable personal preference.'],
        signalTags: ['personal_preference'],
      }),
      access: createResolutionAccess(),
    })

    expect(result.status).toBe('planned')
    expect(result.event.source).toBe('dashboard_assistant')
    expect(result.evaluation.scope).toBe('member')
    expect(result.evaluation.shouldWrite).toBe(true)
    if (result.status === 'planned') {
      expect(result.plan.scopes[0]?.directoryPath).toBe('Preferences')
    }
  })

  it('accepts OpenClaw proposals through the proposal dispatcher', async () => {
    const result = await dispatchOpenClawMemoryProposal({
      orgId: 'org_123',
      source: 'openclaw_proposal',
      occurredAt: '2026-04-30T12:00:00.000Z',
      visibility: 'system',
      summary: 'Agent proposed updating shared project memory.',
      actor: {
        openclawAgentId: 'agent_123',
      },
      payload: {
        proposalId: 'proposal_123',
        toolCallId: 'tool_123',
        sessionKey: 'session_123',
        operation: 'update',
      },
    }, {
      completeChat: createModelCompletion({
        shouldWrite: true,
        scope: 'org',
        action: 'update_existing',
        durability: 'durable',
        confidence: 'medium',
        memoryKind: 'project',
        rationale: ['The proposal updates durable shared project memory.'],
        signalTags: ['project_state', 'agent_proposal'],
      }),
      access: createResolutionAccess(),
    })

    expect(result.status).toBe('planned')
    expect(result.event.source).toBe('openclaw_proposal')
    expect(result.evaluation.shouldWrite).toBe(true)
    expect(result.evaluation.scope).toBe('org')
    if (result.status === 'planned') {
      expect(result.plan.scopes[0]?.directoryPath).toBe('Current State')
    }
  })
})
