import { describe, expect, it } from 'bun:test'
import type { MemoryEvaluationDeps } from './evaluation'
import type { MemoryExecutionDeps } from './execution'
import type {
  MemoryResolutionAccess,
  MemoryResolutionDeps,
  MemoryResolutionPath,
  ResolvedMemoryVault,
} from './resolution'
import type {
  MemoryStorage,
  MemoryStorageListEntry,
  MemoryStorageSearchInput,
  MemoryStorageSearchResult,
  MemoryStorageStat,
  MemoryStorageWriteInput,
} from './storage'
import {
  createLatestOnlyMemoryUpdateScheduler,
  dispatchOpenClawMemoryProposal,
  dispatchProductMemoryEvent,
  normalizeMemoryUpdateEvent,
} from './events'

type MemoryCompletionFn = NonNullable<MemoryEvaluationDeps['completeChat']>
type MemoryCompletionResult = Awaited<ReturnType<MemoryCompletionFn>>
type MemoryResolutionCompletionFn = NonNullable<
  MemoryResolutionDeps['completeResolutionChat']
>
type MemoryResolutionCompletionResult = Awaited<
  ReturnType<MemoryResolutionCompletionFn>
>
type MemoryExecutionCompletionFn = NonNullable<
  MemoryExecutionDeps['completeExecutionChat']
>
type MemoryExecutionCompletionResult = Awaited<
  ReturnType<MemoryExecutionCompletionFn>
>

class WritableMemoryStorage implements MemoryStorage {
  constructor(private readonly files = new Map<string, string>()) {}

  async listDirectory(_path?: string): Promise<MemoryStorageListEntry[]> {
    throw new Error('Not implemented in events test storage')
  }

  async readFile(path: string) {
    const normalizedPath = this.normalizePath(path)
    const content = this.files.get(normalizedPath)
    if (content === undefined) {
      throw new Error(`Missing storage fixture for ${normalizedPath}`)
    }

    return Buffer.from(content)
  }

  async writeFile(input: MemoryStorageWriteInput) {
    this.files.set(
      this.normalizePath(input.path),
      typeof input.body === 'string'
        ? input.body
        : Buffer.from(input.body).toString('utf8')
    )
  }

  async movePath(_fromPath: string, _toPath: string) {
    throw new Error('Not implemented in events test storage')
  }

  async deletePath(_path: string) {
    throw new Error('Not implemented in events test storage')
  }

  async createDirectory(_path: string) {
    // `writeFile` is enough for these tests.
  }

  async statPath(path: string) {
    const normalizedPath = this.normalizePath(path)
    if (!this.files.has(normalizedPath)) {
      return null
    }

    return {
      path: normalizedPath,
      type: 'file' as const,
      size: Buffer.byteLength(this.files.get(normalizedPath) ?? ''),
      lastModified: null,
    } satisfies MemoryStorageStat
  }

  async searchContent(
    _input: MemoryStorageSearchInput
  ): Promise<MemoryStorageSearchResult[]> {
    throw new Error('Not implemented in events test storage')
  }

  getText(path: string) {
    return this.files.get(this.normalizePath(path)) ?? null
  }

  private normalizePath(path?: string) {
    if (!path) return ''
    return path.replace(/^\/+/, '').replace(/\/+$/, '')
  }
}

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

function createResolutionCompletion(
  payload: Record<string, unknown>
): MemoryResolutionCompletionFn {
  return async (input) =>
    ({
      ok: true as const,
      content: JSON.stringify(payload),
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

function createExecutionCompletion(
  payload: Record<string, unknown>
): MemoryExecutionCompletionFn {
  return async (input) =>
    ({
      ok: true as const,
      content: JSON.stringify(payload),
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
    } satisfies Extract<MemoryExecutionCompletionResult, { ok: true }>)
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
          topicLabel: null,
          topicSummary: null,
          topicKeywords: [],
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
    const storage = new WritableMemoryStorage(
      new Map([
        [
          'memory/org_123/members/org_member_123/MEMORY.md',
          `# Kodi Memory

## Important entry points

- \`Preferences/PREFERENCES.md\` — working preferences and communication norms

## Directory guide

- \`Preferences/\` — User-specific preferences, communication patterns, and working style that Kodi should preserve in private member interactions.
`,
        ],
        [
          'memory/org_123/members/org_member_123/Preferences/PREFERENCES.md',
          '# Preferences\n\n## What belongs here\n\nWorking preferences.\n',
        ],
      ])
    )
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
        topicLabel: 'Preference',
        topicSummary: 'A durable personal preference.',
        topicKeywords: ['preference'],
        rationale: ['The event captures a durable personal preference.'],
        signalTags: ['personal_preference'],
      }),
      completeResolutionChat: createResolutionCompletion({
        action: 'create_new',
        targetDirectoryPath: 'Preferences',
        targetFilePath: 'Preferences/Stable Preference.md',
        requiredReads: ['Preferences/PREFERENCES.md'],
        requiresIndexRepair: true,
        requiresManifestRepair: false,
        confidence: 'high',
        rationale: ['The preference belongs in the Preferences area.'],
      }),
      access: createResolutionAccess(),
      storage,
      completeExecutionChat: createExecutionCompletion({
        writes: [
          {
            path: 'Preferences/Stable Preference.md',
            purpose: 'target',
            content:
              '# Stable Preference\n\nThe user prefers async recaps in private dashboard conversations.\n',
          },
          {
            path: 'Preferences/PREFERENCES.md',
            purpose: 'directory_index',
            content:
              '# Preferences\n\n## What belongs here\n\nWorking preferences.\n\n## What each file is for\n\n- `Stable Preference.md` — durable preference for async recaps.\n',
          },
        ],
        confidence: 'high',
        rationale: ['The new preference file needs an index repair.'],
      }),
      syncVaultMetadata: async () => ({
        upsertedCount: 3,
        deletedCount: 0,
      }),
    })

    expect(result.status).toBe('executed')
    expect(result.event.source).toBe('dashboard_assistant')
    expect(result.evaluation.scope).toBe('member')
    expect(result.evaluation.shouldWrite).toBe(true)
    expect(
      storage.getText(
        'memory/org_123/members/org_member_123/Preferences/Stable Preference.md'
      )
    ).toContain('async recaps')
    if (result.status === 'executed') {
      expect(result.plan.scopes[0]?.directoryPath).toBe('Preferences')
      expect(result.execution.executedScopes[0]?.writtenPaths).toEqual([
        'Preferences/Stable Preference.md',
        'Preferences/PREFERENCES.md',
      ])
    }
  })

  it('accepts OpenClaw proposals through the proposal dispatcher', async () => {
    const storage = new WritableMemoryStorage(
      new Map([
        [
          'memory/org_123/org/MEMORY.md',
          `# Kodi Memory

## Important entry points

- \`Current State/CURRENT-STATE.md\` — current org-wide state

## Directory guide

- \`Current State/\` — What the organization is actively tracking right now: current state, next steps, and owners.
`,
        ],
        [
          'memory/org_123/org/Current State/CURRENT-STATE.md',
          '# Current State\n\n## What belongs here\n\nCurrent org-wide state.\n',
        ],
      ])
    )
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
        topicLabel: 'Shared project memory',
        topicSummary: 'A shared project update.',
        topicKeywords: ['project'],
        rationale: ['The proposal updates durable shared project memory.'],
        signalTags: ['project_state', 'agent_proposal'],
      }),
      completeResolutionChat: createResolutionCompletion({
        action: 'create_new',
        targetDirectoryPath: 'Current State',
        targetFilePath: 'Current State/Shared Project Memory.md',
        requiredReads: ['Current State/CURRENT-STATE.md'],
        requiresIndexRepair: true,
        requiresManifestRepair: false,
        confidence: 'medium',
        rationale: ['The current shared state area is the right starting point.'],
      }),
      access: createResolutionAccess(),
      storage,
      completeExecutionChat: createExecutionCompletion({
        writes: [
          {
            path: 'Current State/Shared Project Memory.md',
            purpose: 'target',
            content:
              '# Shared Project Memory\n\nThis file captures the newly proposed shared project memory.\n',
          },
          {
            path: 'Current State/CURRENT-STATE.md',
            purpose: 'directory_index',
            content:
              '# Current State\n\n## What belongs here\n\nCurrent org-wide state.\n\n## What each file is for\n\n- `Shared Project Memory.md` — new shared project memory proposed by the agent.\n',
          },
        ],
        confidence: 'medium',
        rationale: ['The new file belongs in the current-state directory index.'],
      }),
      syncVaultMetadata: async () => ({
        upsertedCount: 3,
        deletedCount: 0,
      }),
    })

    expect(result.status).toBe('executed')
    expect(result.event.source).toBe('openclaw_proposal')
    expect(result.evaluation.shouldWrite).toBe(true)
    expect(result.evaluation.scope).toBe('org')
    expect(
      storage.getText('memory/org_123/org/Current State/Shared Project Memory.md')
    ).toContain('newly proposed shared project memory')
    if (result.status === 'executed') {
      expect(result.plan.scopes[0]?.directoryPath).toBe('Current State')
      expect(result.execution.executedScopes[0]?.writtenPaths).toEqual([
        'Current State/Shared Project Memory.md',
        'Current State/CURRENT-STATE.md',
      ])
    }
  })
})
