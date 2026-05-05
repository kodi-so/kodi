import { describe, expect, it } from 'bun:test'
import type { MemoryUpdateEvaluation } from './evaluation'
import {
  executeMemoryUpdatePlan,
  type MemoryExecutionDeps,
} from './execution'
import { normalizeMemoryUpdateEvent } from './events'
import type { MemoryScopeUpdatePlan } from './resolution'
import type {
  MemoryStorage,
  MemoryStorageListEntry,
  MemoryStorageSearchInput,
  MemoryStorageSearchResult,
  MemoryStorageStat,
  MemoryStorageWriteInput,
} from './storage'

type MemoryExecutionCompletionFn = NonNullable<
  MemoryExecutionDeps['completeExecutionChat']
>
type MemoryExecutionCompletionResult = Awaited<
  ReturnType<MemoryExecutionCompletionFn>
>
type MemoryStructureCompletionFn = NonNullable<
  MemoryExecutionDeps['completeStructureChat']
>
type MemoryStructureCompletionResult = Awaited<
  ReturnType<MemoryStructureCompletionFn>
>

class WritableMemoryStorage implements MemoryStorage {
  constructor(
    private readonly directories = new Set<string>(),
    private readonly files = new Map<string, string>()
  ) {}

  async listDirectory(path = ''): Promise<MemoryStorageListEntry[]> {
    const normalizedPath = this.normalizePath(path)
    const children = new Map<string, MemoryStorageListEntry>()

    for (const directory of this.directories) {
      if (this.parentPath(directory) !== normalizedPath) continue
      children.set(directory, {
        path: directory,
        name: this.basename(directory),
        type: 'directory',
        size: null,
        lastModified: null,
      })
    }

    for (const [filePath, content] of this.files) {
      if (this.parentPath(filePath) !== normalizedPath) continue
      children.set(filePath, {
        path: filePath,
        name: this.basename(filePath),
        type: 'file',
        size: Buffer.byteLength(content),
        lastModified: null,
      })
    }

    return [...children.values()].sort((left, right) =>
      left.path.localeCompare(right.path)
    )
  }

  async readFile(path: string) {
    const normalizedPath = this.normalizePath(path)
    const content = this.files.get(normalizedPath)
    if (content === undefined) {
      throw new Error(`Path not found: ${normalizedPath}`)
    }

    return Buffer.from(content)
  }

  async writeFile(input: MemoryStorageWriteInput) {
    const normalizedPath = this.normalizePath(input.path)
    this.ensureParentDirectories(normalizedPath)
    this.files.set(
      normalizedPath,
      typeof input.body === 'string'
        ? input.body
        : Buffer.from(input.body).toString('utf8')
    )
  }

  async movePath(_fromPath: string, _toPath: string) {
    const normalizedFromPath = this.normalizePath(_fromPath)
    const normalizedToPath = this.normalizePath(_toPath)
    const stat = await this.statPath(normalizedFromPath)

    if (!stat) {
      throw new Error(`Path not found: ${normalizedFromPath}`)
    }

    if (stat.type === 'file') {
      const content = this.files.get(normalizedFromPath)
      if (content === undefined) {
        throw new Error(`Path not found: ${normalizedFromPath}`)
      }

      this.ensureParentDirectories(normalizedToPath)
      this.files.set(normalizedToPath, content)
      this.files.delete(normalizedFromPath)
      return
    }

    throw new Error('Directory moves are not needed in execution test storage')
  }

  async deletePath(_path: string) {
    const normalizedPath = this.normalizePath(_path)
    const stat = await this.statPath(normalizedPath)

    if (!stat) {
      throw new Error(`Path not found: ${normalizedPath}`)
    }

    if (stat.type === 'file') {
      this.files.delete(normalizedPath)
      return
    }

    throw new Error('Directory deletes are not needed in execution test storage')
  }

  async createDirectory(path: string) {
    this.ensureAllDirectories(this.normalizePath(path))
  }

  async statPath(path: string) {
    const normalizedPath = this.normalizePath(path)

    if (this.files.has(normalizedPath)) {
      return {
        path: normalizedPath,
        type: 'file' as const,
        size: Buffer.byteLength(this.files.get(normalizedPath) ?? ''),
        lastModified: null,
      } satisfies MemoryStorageStat
    }

    if (this.directories.has(normalizedPath)) {
      return {
        path: normalizedPath,
        type: 'directory' as const,
        size: null,
        lastModified: null,
      } satisfies MemoryStorageStat
    }

    return null
  }

  async searchContent(
    _input: MemoryStorageSearchInput
  ): Promise<MemoryStorageSearchResult[]> {
    throw new Error('Not implemented in execution test storage')
  }

  getText(path: string) {
    return this.files.get(this.normalizePath(path)) ?? null
  }

  private normalizePath(path?: string) {
    if (!path) return ''
    return path.replace(/^\/+/, '').replace(/\/+$/, '')
  }

  private ensureParentDirectories(path: string) {
    const parts = path.split('/')
    if (parts.length <= 1) return
    this.ensureAllDirectories(parts.slice(0, -1).join('/'))
  }

  private parentPath(path: string) {
    const normalizedPath = this.normalizePath(path)
    const parts = normalizedPath.split('/')
    if (parts.length <= 1) return ''
    return parts.slice(0, -1).join('/')
  }

  private basename(path: string) {
    const normalizedPath = this.normalizePath(path)
    const parts = normalizedPath.split('/')
    return parts[parts.length - 1] ?? ''
  }

  private ensureAllDirectories(path: string) {
    const normalizedPath = this.normalizePath(path)
    if (!normalizedPath) return

    const parts = normalizedPath.split('/')
    for (let index = 1; index <= parts.length; index += 1) {
      this.directories.add(parts.slice(0, index).join('/'))
    }
  }
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

function createStructureCompletion(
  payload: Record<string, unknown>
): MemoryStructureCompletionFn {
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
    } satisfies Extract<MemoryStructureCompletionResult, { ok: true }>)
}

function baseEvaluation(
  overrides: Partial<MemoryUpdateEvaluation> = {}
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
    topicLabel: 'Fixture topic',
    topicSummary: 'Fixture summary',
    topicKeywords: ['fixture'],
    guardrailsApplied: [],
    engine: 'openclaw',
    ...overrides,
  }
}

function basePlan(
  overrides: Partial<MemoryScopeUpdatePlan> = {}
): MemoryScopeUpdatePlan {
  return {
    scope: 'org',
    vaultId: 'vault_org',
    rootPath: 'memory/org_123/org',
    manifestPath: 'memory/org_123/org/MEMORY.md',
    directoryPath: 'Projects',
    indexPath: 'Projects/PROJECTS.md',
    targetPath: 'Projects/Launch Checklist.md',
    action: 'update_existing',
    requiredReads: [
      'MEMORY.md',
      'Projects/PROJECTS.md',
      'Projects/Launch Checklist.md',
    ],
    candidatePaths: ['Projects/Launch Checklist.md'],
    searchQuery: 'launch checklist owner',
    requiresIndexRepair: false,
    requiresManifestRepair: false,
    rationale: ['The existing launch checklist file owns this topic.'],
    ...overrides,
  }
}

describe('executeMemoryUpdatePlan', () => {
  it('updates an existing target file and syncs vault metadata once', async () => {
    const storage = new WritableMemoryStorage(
      new Set([
        'memory',
        'memory/org_123',
        'memory/org_123/org',
        'memory/org_123/org/Projects',
      ]),
      new Map([
        [
          'memory/org_123/org/MEMORY.md',
          '# Kodi Memory\n\n## Directory guide\n\n- `Projects/` — Shared project memory.\n',
        ],
        [
          'memory/org_123/org/Projects/PROJECTS.md',
          '# Projects\n\n## What each file is for\n\n- `Launch Checklist.md` — rollout ownership.\n',
        ],
        [
          'memory/org_123/org/Projects/Launch Checklist.md',
          '# Launch Checklist\n\nOld content.\n',
        ],
      ])
    )
    const syncedVaults: string[] = []
    const event = normalizeMemoryUpdateEvent({
      orgId: 'org_123',
      source: 'app_chat',
      occurredAt: '2026-05-01T10:00:00.000Z',
      visibility: 'shared',
      summary: 'The launch checklist now belongs to Maya.',
      actor: {
        userId: 'user_123',
        orgMemberId: 'org_member_123',
      },
      payload: {
        threadId: 'thread_123',
        messageId: 'message_123',
      },
    })

    const result = await executeMemoryUpdatePlan(
      event,
      baseEvaluation(),
      {
        scopes: [basePlan()],
        requiredReads: ['org:MEMORY.md'],
      },
      {
        storage,
        completeExecutionChat: createExecutionCompletion({
          writes: [
            {
              path: 'Projects/Launch Checklist.md',
              purpose: 'target',
              content:
                '# Launch Checklist\n\nMaya owns the rollout follow-up and remaining launch tasks.\n',
            },
          ],
          confidence: 'high',
          rationale: ['This is the minimal durable update to the owned file.'],
        }),
        syncVaultMetadata: async (vault) => {
          syncedVaults.push('vaultId' in vault ? vault.vaultId : vault.id)
          return {
            upsertedCount: 3,
            deletedCount: 0,
          }
        },
      }
    )

    expect(result.executedScopes).toHaveLength(1)
    expect(result.deferredScopes).toHaveLength(0)
    expect(result.executedScopes[0]?.writtenPaths).toEqual([
      'Projects/Launch Checklist.md',
    ])
    expect(storage.getText('memory/org_123/org/Projects/Launch Checklist.md')).toContain(
      'Maya owns the rollout follow-up'
    )
    expect(syncedVaults).toEqual(['vault_org'])
  })

  it('creates a new file plus index and manifest repairs when the plan requires them', async () => {
    const storage = new WritableMemoryStorage(
      new Set(['memory', 'memory/org_123', 'memory/org_123/org']),
      new Map([
        [
          'memory/org_123/org/MEMORY.md',
          '# Kodi Memory\n\n## Directory guide\n\n- `Projects/` — Shared project memory.\n',
        ],
      ])
    )
    const event = normalizeMemoryUpdateEvent({
      orgId: 'org_123',
      source: 'app_chat',
      occurredAt: '2026-05-01T10:00:00.000Z',
      visibility: 'shared',
      summary: 'We should preserve the onboarding playbook.',
      actor: {
        userId: 'user_123',
        orgMemberId: 'org_member_123',
      },
      payload: {
        threadId: 'thread_123',
        messageId: 'message_123',
      },
    })

    const result = await executeMemoryUpdatePlan(
      event,
      baseEvaluation({
        action: 'create_new',
        topicLabel: 'Onboarding playbook',
      }),
      {
        scopes: [
          basePlan({
            directoryPath: 'Playbooks',
            indexPath: null,
            targetPath: 'Playbooks/Onboarding.md',
            action: 'create_new',
            requiredReads: ['MEMORY.md'],
            candidatePaths: [],
            searchQuery: 'onboarding playbook',
            requiresIndexRepair: true,
            requiresManifestRepair: true,
            rationale: ['The org needs a new top-level Playbooks area.'],
          }),
        ],
        requiredReads: ['org:MEMORY.md'],
      },
      {
        storage,
        completeExecutionChat: createExecutionCompletion({
          writes: [
            {
              path: 'Playbooks/Onboarding.md',
              purpose: 'target',
              content:
                '# Onboarding\n\nThis file tracks the durable onboarding playbook for new hires.\n',
            },
            {
              path: 'Playbooks/PLAYBOOKS.md',
              purpose: 'directory_index',
              content:
                '# Playbooks\n\n## What belongs here\n\nRepeatable playbooks.\n\n## What each file is for\n\n- `Onboarding.md` — durable onboarding playbook for new hires.\n',
            },
            {
              path: 'MEMORY.md',
              purpose: 'manifest',
              content:
                '# Kodi Memory\n\n## Directory guide\n\n- `Projects/` — Shared project memory.\n- `Playbooks/` — Repeatable operational playbooks.\n',
            },
          ],
          confidence: 'medium',
          rationale: ['The new directory needs both navigation repairs.'],
        }),
        syncVaultMetadata: async () => ({
          upsertedCount: 3,
          deletedCount: 0,
        }),
      }
    )

    expect(result.executedScopes).toHaveLength(1)
    expect(storage.getText('memory/org_123/org/Playbooks/Onboarding.md')).toContain(
      'durable onboarding playbook'
    )
    expect(storage.getText('memory/org_123/org/Playbooks/PLAYBOOKS.md')).toContain(
      '`Onboarding.md`'
    )
    expect(storage.getText('memory/org_123/org/MEMORY.md')).toContain(
      '`Playbooks/`'
    )
  })

  it('executes structural delete actions through the maintenance worker', async () => {
    const storage = new WritableMemoryStorage(
      new Set([
        'memory',
        'memory/org_123',
        'memory/org_123/org',
        'memory/org_123/org/Projects',
      ]),
      new Map([
        [
          'memory/org_123/org/MEMORY.md',
          '# Kodi Memory\n\n## Scope\n\nShared org memory.\n\n## How this vault is organized\n\nKodi maintains shared org memory in concise directories.\n\n## Important entry points\n\n- `MEMORY.md` — this manifest for the scoped vault\n- `Projects/PROJECTS.md` — index for the Projects directory\n\n## Directory guide\n\n- `Projects/` — Shared project memory.\n\n## Structural rules\n\n- Keep navigation aligned with the live vault structure.\n\n## Update rules\n\n- Keep navigation concise and current.\n',
        ],
        [
          'memory/org_123/org/Projects/PROJECTS.md',
          '# Projects\n\n## What belongs here\n\nShared project memory.\n\n## What files exist here\n\n- `Launch Checklist.md` — Launch Checklist\n\n## What each file is for\n\n- `Launch Checklist.md` — rollout checklist and ownership.\n\n## Naming and structural conventions\n\n- Keep file titles concise.\n',
        ],
        [
          'memory/org_123/org/Projects/Launch Checklist.md',
          '# Launch Checklist\n\nOutdated duplicate content.\n',
        ],
      ])
    )
    const event = normalizeMemoryUpdateEvent({
      orgId: 'org_123',
      source: 'openclaw_proposal',
      occurredAt: '2026-05-01T10:00:00.000Z',
      visibility: 'system',
      summary: 'The agent wants to reorganize obsolete memory.',
      actor: {
        openclawAgentId: 'agent_123',
      },
      payload: {
        proposalId: 'proposal_123',
        toolCallId: 'tool_123',
        operation: 'delete',
      },
    })

    const result = await executeMemoryUpdatePlan(
      event,
      baseEvaluation({
        action: 'delete_obsolete',
      }),
      {
        scopes: [
          basePlan({
            action: 'delete_obsolete',
          }),
        ],
        requiredReads: [],
      },
      {
        storage,
        completeStructureChat: createStructureCompletion({
          operation: 'delete_path',
          path: 'Projects/Launch Checklist.md',
          rationale: ['The duplicate file is obsolete and should be removed.'],
        }),
        syncVaultMetadata: async () => ({
          upsertedCount: 2,
          deletedCount: 1,
        }),
      }
    )

    expect(result.executedScopes).toHaveLength(1)
    expect(result.deferredScopes).toHaveLength(0)
    expect(result.executedScopes[0]?.structuralOperation).toBe('delete_path')
    expect(storage.getText('memory/org_123/org/Projects/Launch Checklist.md')).toBe(
      null
    )
    expect(storage.getText('memory/org_123/org/Projects/PROJECTS.md')).not.toContain(
      '`Launch Checklist.md`'
    )
  })
})
