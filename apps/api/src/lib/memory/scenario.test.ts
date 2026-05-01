import { describe, expect, it } from 'bun:test'
import type { MemoryPath, MemoryVault, NewMemoryPath, NewMemoryVault } from '@kodi/db'
import { memoryPaths, memoryVaults } from '@kodi/db'
import {
  buildMemberVaultSeedPlan,
  buildOrgVaultSeedPlan,
  ensureMemberMemoryVault,
  ensureOrgMemoryVault,
} from './bootstrap'
import {
  executeMemoryUpdatePlan,
  type MemoryExecutionDeps,
} from './execution'
import type { MemoryUpdateEvaluation } from './evaluation'
import { normalizeMemoryUpdateEvent } from './events'
import {
  deleteMemoryPath,
  moveMemoryPath,
  syncMemoryVaultMetadata,
  writeMemoryFile,
} from './paths'
import type { MemoryScopeUpdatePlan } from './resolution'
import {
  getMemoryManifest,
  listMemoryDirectory,
  readMemoryPath,
  searchMemory,
} from './service'
import type {
  MemoryStorage,
  MemoryStorageListEntry,
  MemoryStorageSearchInput,
  MemoryStorageSearchResult,
  MemoryStorageStat,
  MemoryStorageWriteInput,
} from './storage'
import {
  createScopedMemoryDirectory,
  createScopedMemoryFile,
  deleteScopedMemoryPath,
  mergeScopedMemoryFiles,
  moveScopedMemoryPath,
  renameScopedMemoryPath,
  splitScopedMemoryFile,
  type MemoryStructureDeps,
} from './structure'

type SqlFacts = {
  equals: Map<string, unknown>
  inValues: Map<string, unknown[]>
  nullColumns: Set<string>
  params: unknown[]
}

type StoredMemoryPath = MemoryPath & {
  contentSearchVectorText?: string | null
}

function normalizePath(path?: string) {
  if (!path) return ''
  return path.replace(/^\/+/, '').replace(/\/+$/, '')
}

function basename(path: string) {
  const normalized = normalizePath(path)
  if (!normalized) return ''
  const parts = normalized.split('/')
  return parts[parts.length - 1] ?? ''
}

function dirname(path: string) {
  const normalized = normalizePath(path)
  if (!normalized) return ''
  const parts = normalized.split('/')
  if (parts.length <= 1) return ''
  return parts.slice(0, -1).join('/')
}

function countMatches(content: string, query: string) {
  const normalizedQuery = query.trim().toLowerCase()
  if (!normalizedQuery) return 0
  return content.toLowerCase().split(normalizedQuery).length - 1
}

function snakeToCamel(value: string) {
  return value.replace(/_([a-z])/g, (_, char: string) => char.toUpperCase())
}

function isSqlNode(value: unknown): value is { queryChunks: unknown[] } {
  return (
    typeof value === 'object' &&
    value !== null &&
    'queryChunks' in value &&
    Array.isArray((value as { queryChunks?: unknown[] }).queryChunks)
  )
}

function isColumnNode(
  value: unknown
): value is {
  name: string
} {
  return (
    typeof value === 'object' &&
    value !== null &&
    'name' in value &&
    typeof (value as { name?: unknown }).name === 'string'
  )
}

function isParamNode(
  value: unknown
): value is {
  value: unknown
} {
  return (
    typeof value === 'object' &&
    value !== null &&
    'value' in value &&
    !Array.isArray(value)
  )
}

function isStringChunkValue(value: unknown, match: string) {
  return (
    typeof value === 'object' &&
    value !== null &&
    'value' in value &&
    Array.isArray((value as { value?: unknown[] }).value) &&
    (value as { value: unknown[] }).value.join('') === match
  )
}

function collectSqlFacts(node: unknown, facts?: SqlFacts): SqlFacts {
  const nextFacts =
    facts ??
    ({
      equals: new Map<string, unknown>(),
      inValues: new Map<string, unknown[]>(),
      nullColumns: new Set<string>(),
      params: [],
    } satisfies SqlFacts)

  if (Array.isArray(node)) {
    for (const item of node) {
      collectSqlFacts(item, nextFacts)
    }
    return nextFacts
  }

  if (typeof node === 'string') {
    nextFacts.params.push(node)
    return nextFacts
  }

  if (isParamNode(node)) {
    nextFacts.params.push(node.value)
    return nextFacts
  }

  if (!isSqlNode(node)) {
    return nextFacts
  }

  const chunks = node.queryChunks

  for (let index = 0; index < chunks.length; index += 1) {
    const chunk = chunks[index]
    const nextChunk = chunks[index + 1]
    const thirdChunk = chunks[index + 2]

    if (
      isColumnNode(chunk) &&
      isStringChunkValue(nextChunk, ' = ') &&
      isParamNode(thirdChunk)
    ) {
      nextFacts.equals.set(snakeToCamel(chunk.name), thirdChunk.value)
    }

    if (
      isColumnNode(chunk) &&
      isStringChunkValue(nextChunk, ' is null')
    ) {
      nextFacts.nullColumns.add(snakeToCamel(chunk.name))
    }

    if (
      isColumnNode(chunk) &&
      isStringChunkValue(nextChunk, ' in ') &&
      Array.isArray(thirdChunk)
    ) {
      nextFacts.inValues.set(
        snakeToCamel(chunk.name),
        thirdChunk
          .filter((item): item is { value: unknown } => isParamNode(item))
          .map((item) => item.value)
      )
    }

    collectSqlFacts(chunk, nextFacts)
  }

  return nextFacts
}

function extractLastStringParam(node: unknown) {
  const params = collectSqlFacts(node).params.filter(
    (value): value is string => typeof value === 'string' && value.length > 0
  )

  return params.at(-1) ?? null
}

function matchesSqlFacts(
  row: Record<string, unknown>,
  where: unknown
) {
  const facts = collectSqlFacts(where)

  for (const [key, value] of facts.equals) {
    if ((row[key] ?? null) !== value) {
      return false
    }
  }

  for (const key of facts.nullColumns) {
    if ((row[key] ?? null) !== null) {
      return false
    }
  }

  for (const [key, values] of facts.inValues) {
    if (!values.includes(row[key])) {
      return false
    }
  }

  return true
}

function pickColumns<T extends Record<string, unknown>>(
  row: T,
  columns?: Record<string, boolean>
) {
  if (!columns) return { ...row }

  const selected: Record<string, unknown> = {}
  for (const [key, enabled] of Object.entries(columns)) {
    if (!enabled) continue
    selected[key] = row[key]
  }
  return selected
}

class ScenarioMemoryStorage implements MemoryStorage {
  readonly directories = new Set<string>()
  readonly files = new Map<string, string>()

  async listDirectory(path = '') {
    const normalizedPath = normalizePath(path)
    const children = new Map<string, MemoryStorageListEntry>()

    for (const directory of this.directories) {
      if (dirname(directory) !== normalizedPath) continue
      children.set(directory, {
        path: directory,
        name: basename(directory),
        type: 'directory',
        size: null,
        lastModified: null,
      })
    }

    for (const [filePath, content] of this.files) {
      if (dirname(filePath) !== normalizedPath) continue
      children.set(filePath, {
        path: filePath,
        name: basename(filePath),
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
    const normalizedPath = normalizePath(path)
    const content = this.files.get(normalizedPath)
    if (content === undefined) {
      throw new Error(`File not found: ${normalizedPath}`)
    }

    return Buffer.from(content)
  }

  async writeFile(input: MemoryStorageWriteInput) {
    const normalizedPath = normalizePath(input.path)
    this.ensureParentDirectories(normalizedPath)
    this.files.set(
      normalizedPath,
      typeof input.body === 'string'
        ? input.body
        : Buffer.from(input.body).toString('utf8')
    )
  }

  async movePath(fromPath: string, toPath: string) {
    const source = normalizePath(fromPath)
    const destination = normalizePath(toPath)

    if (this.files.has(source)) {
      const content = this.files.get(source) ?? ''
      this.files.delete(source)
      this.ensureParentDirectories(destination)
      this.files.set(destination, content)
      return
    }

    const sourcePrefix = `${source}/`
    const destinationPrefix = `${destination}/`

    for (const directory of [...this.directories]) {
      if (directory === source || directory.startsWith(sourcePrefix)) {
        this.directories.delete(directory)
        const suffix = directory === source ? '' : directory.slice(sourcePrefix.length)
        this.directories.add(normalizePath(`${destinationPrefix}${suffix}`))
      }
    }

    for (const [filePath, content] of [...this.files.entries()]) {
      if (!filePath.startsWith(sourcePrefix)) continue
      this.files.delete(filePath)
      const suffix = filePath.slice(sourcePrefix.length)
      this.files.set(normalizePath(`${destinationPrefix}${suffix}`), content)
    }
  }

  async deletePath(path: string) {
    const normalizedPath = normalizePath(path)
    if (this.files.delete(normalizedPath)) {
      return
    }

    const prefix = `${normalizedPath}/`
    for (const directory of [...this.directories]) {
      if (directory === normalizedPath || directory.startsWith(prefix)) {
        this.directories.delete(directory)
      }
    }
    for (const filePath of [...this.files.keys()]) {
      if (filePath.startsWith(prefix)) {
        this.files.delete(filePath)
      }
    }
  }

  async createDirectory(path: string) {
    const normalizedPath = normalizePath(path)
    if (!normalizedPath) return
    this.ensureParentDirectories(normalizedPath)
    this.directories.add(normalizedPath)
  }

  async statPath(path: string) {
    const normalizedPath = normalizePath(path)
    if (this.files.has(normalizedPath)) {
      return {
        path: normalizedPath,
        type: 'file' as const,
        size: Buffer.byteLength(this.files.get(normalizedPath) ?? ''),
        lastModified: null,
      } satisfies MemoryStorageStat
    }

    if (!normalizedPath || this.directories.has(normalizedPath)) {
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
    return []
  }

  private ensureParentDirectories(path: string) {
    const segments = normalizePath(path).split('/').slice(0, -1)
    for (let index = 0; index < segments.length; index += 1) {
      this.directories.add(segments.slice(0, index + 1).join('/'))
    }
  }
}

class ScenarioMemoryDatabase {
  vaults: MemoryVault[] = []
  paths: StoredMemoryPath[] = []

  query = {
    memoryVaults: {
      findFirst: async (_options: {
        columns?: Record<string, boolean>
        where?: unknown
      }) => undefined as Record<string, unknown> | undefined,
    },
    memoryPaths: {
      findFirst: async (_options: {
        columns?: Record<string, boolean>
        where?: unknown
      }) => undefined as Record<string, unknown> | undefined,
      findMany: async (_options: {
        columns?: Record<string, boolean>
        where?: unknown
      }) => [] as Record<string, unknown>[],
    },
  }

  constructor() {
    this.query.memoryVaults.findFirst = async (options: {
      columns?: Record<string, boolean>
      where?: unknown
    }) => {
      const row = this.vaults.find((vault) =>
        matchesSqlFacts(vault as unknown as Record<string, unknown>, options.where)
      )
      return row ? pickColumns(row as unknown as Record<string, unknown>, options.columns) : undefined
    }

    this.query.memoryPaths.findFirst = async (options: {
      columns?: Record<string, boolean>
      where?: unknown
    }) => {
      const row = this.paths.find((path) =>
        matchesSqlFacts(path as unknown as Record<string, unknown>, options.where)
      )
      return row ? pickColumns(row as unknown as Record<string, unknown>, options.columns) : undefined
    }

    this.query.memoryPaths.findMany = async (options: {
      columns?: Record<string, boolean>
      where?: unknown
    }) => {
      return this.paths
        .filter((path) =>
          matchesSqlFacts(path as unknown as Record<string, unknown>, options.where)
        )
        .map((path) =>
          pickColumns(path as unknown as Record<string, unknown>, options.columns)
        )
    }
  }

  async execute(_value: unknown) {
    return
  }

  async transaction<T>(callback: (tx: this) => Promise<T>) {
    return callback(this)
  }

  insert(table: unknown) {
    return {
      values: (input: NewMemoryVault | NewMemoryPath) => {
        if (table === memoryVaults) {
          const row: MemoryVault = {
            id: (input as NewMemoryVault).id ?? crypto.randomUUID(),
            orgId: (input as NewMemoryVault).orgId,
            scopeType: (input as NewMemoryVault).scopeType,
            orgMemberId: (input as NewMemoryVault).orgMemberId ?? null,
            rootPath: (input as NewMemoryVault).rootPath,
            manifestPath: (input as NewMemoryVault).manifestPath,
            storageBackend: (input as NewMemoryVault).storageBackend ?? 'r2',
            createdAt: new Date(),
            updatedAt: new Date(),
          }

          this.vaults.push(row)

          return {
            returning: async () => [row],
          }
        }

        const rowInput = input as NewMemoryPath & {
          contentSearchVector?: unknown
        }

        const contentSearchVectorText = extractLastStringParam(
          rowInput.contentSearchVector
        )

        const existingIndex = this.paths.findIndex(
          (path) =>
            path.vaultId === rowInput.vaultId && path.path === rowInput.path
        )

        const row: StoredMemoryPath = {
          id:
            existingIndex >= 0
              ? this.paths[existingIndex]?.id ?? crypto.randomUUID()
              : rowInput.id ?? crypto.randomUUID(),
          vaultId: rowInput.vaultId,
          path: rowInput.path,
          pathType: rowInput.pathType,
          parentPath: rowInput.parentPath ?? null,
          title: rowInput.title ?? null,
          isManifest: rowInput.isManifest ?? false,
          isIndex: rowInput.isIndex ?? false,
          contentSearchVector:
            typeof contentSearchVectorText === 'string'
              ? contentSearchVectorText
              : null,
          contentSearchVectorText:
            typeof contentSearchVectorText === 'string'
              ? contentSearchVectorText
              : null,
          lastUpdatedAt: rowInput.lastUpdatedAt ?? new Date(),
          createdAt:
            existingIndex >= 0
              ? this.paths[existingIndex]?.createdAt ?? new Date()
              : new Date(),
          updatedAt: new Date(),
        }

        if (existingIndex >= 0) {
          this.paths[existingIndex] = row
        } else {
          this.paths.push(row)
        }

        return {
          onConflictDoUpdate: async () => {},
        }
      },
    }
  }

  delete(table: unknown) {
    if (table !== memoryPaths) {
      throw new Error('Only memoryPaths deletion is supported in scenario tests.')
    }

    return {
      where: async (condition: unknown) => {
        this.paths = this.paths.filter(
          (path) =>
            !matchesSqlFacts(
              path as unknown as Record<string, unknown>,
              condition
            )
        )
      },
    }
  }

  select(_fields: Record<string, unknown>) {
    return {
      from: (_table: unknown) => ({
        where: (condition: unknown) => {
          const query = extractLastStringParam(condition) ?? ''

          const rows = this.paths
            .filter((path) =>
              matchesSqlFacts(
                path as unknown as Record<string, unknown>,
                condition
              )
            )
            .map((path) => ({
              path: path.path,
              title: path.title,
              isManifest: path.isManifest,
              isIndex: path.isIndex,
              lastUpdatedAt: path.lastUpdatedAt,
              rank:
                typeof query === 'string' && path.contentSearchVectorText
                  ? countMatches(path.contentSearchVectorText, query)
                  : 0,
            }))
            .filter((row) => row.rank > 0)

          return {
            orderBy: (..._args: unknown[]) => ({
              limit: async (limit: number) =>
                rows
                  .sort((left, right) => {
                    if (left.rank !== right.rank) return right.rank - left.rank
                    return (
                      right.lastUpdatedAt.getTime() - left.lastUpdatedAt.getTime()
                    )
                  })
                  .slice(0, limit),
            }),
          }
        },
      }),
    }
  }
}

type StructureCompletionFn = NonNullable<MemoryExecutionDeps['completeStructureChat']>
type StructureCompletionResult = Awaited<ReturnType<StructureCompletionFn>>

function createStructureCompletion(
  payload: Record<string, unknown>
): StructureCompletionFn {
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
    } satisfies Extract<StructureCompletionResult, { ok: true }>)
}

describe('memory foundation scenario coverage', () => {
  it('covers vault bootstrap, file operations, parsing, and scoped search through the service layer', async () => {
    const database = new ScenarioMemoryDatabase()
    const storage = new ScenarioMemoryStorage()

    const org = {
      id: 'org_123',
      name: 'Kodi',
      slug: 'kodi',
    }
    const member = {
      org,
      orgMember: {
        id: 'org_member_123',
        orgId: org.id,
        userId: 'user_123',
        role: 'member' as const,
      },
    }

    const orgVault = await ensureOrgMemoryVault(database as never, org, storage)
    const memberVault = await ensureMemberMemoryVault(
      database as never,
      member,
      storage
    )

    expect(orgVault.scopeType).toBe('org')
    expect(memberVault.scopeType).toBe('member')
    expect(database.vaults).toHaveLength(2)

    const orgSeedPlan = buildOrgVaultSeedPlan(org)
    const memberSeedPlan = buildMemberVaultSeedPlan(member)

    expect(storage.files.has(orgSeedPlan.manifestPath)).toBe(true)
    expect(storage.files.has(memberSeedPlan.manifestPath)).toBe(true)

    await writeMemoryFile({
      database: database as never,
      vault: {
        id: orgVault.id,
        rootPath: orgVault.rootPath,
        manifestPath: orgVault.manifestPath,
      },
      path: 'Projects/Launch Plan.md',
      body: '# Launch Plan\n\nRocket lantern signal for org retrieval.',
      storage,
    })

    await writeMemoryFile({
      database: database as never,
      vault: {
        id: memberVault.id,
        rootPath: memberVault.rootPath,
        manifestPath: memberVault.manifestPath,
      },
      path: 'Current Work/Private Focus.md',
      body: '# Private Focus\n\nPrivate lighthouse signal for member retrieval.',
      storage,
    })

    await moveMemoryPath({
      database: database as never,
      vault: {
        id: orgVault.id,
        rootPath: orgVault.rootPath,
        manifestPath: orgVault.manifestPath,
      },
      fromPath: 'Projects/Launch Plan.md',
      toPath: 'Projects/Launch Notes.md',
      storage,
    })

    await deleteMemoryPath({
      database: database as never,
      vault: {
        id: memberVault.id,
        rootPath: memberVault.rootPath,
        manifestPath: memberVault.manifestPath,
      },
      path: 'Relationships/RELATIONSHIPS.md',
      storage,
    })

    const orgManifest = await getMemoryManifest(database as never, {
      orgId: org.id,
      orgMemberId: member.orgMember.id,
      scope: 'org',
      storage,
    })
    expect(orgManifest.parsed.scopeType).toBe('org')
    expect(orgManifest.parsed.importantEntryPoints[1]?.path).toBe(
      'Projects/PROJECTS.md'
    )

    const memberManifest = await getMemoryManifest(database as never, {
      orgId: org.id,
      orgMemberId: member.orgMember.id,
      scope: 'member',
      storage,
    })
    expect(memberManifest.parsed.scopeType).toBe('member')

    const orgProjects = await listMemoryDirectory(database as never, {
      orgId: org.id,
      orgMemberId: member.orgMember.id,
      scope: 'org',
      path: 'Projects',
    })
    expect(orgProjects.entries.map((entry) => entry.path)).toEqual([
      'Projects/Launch Notes.md',
      'Projects/PROJECTS.md',
    ])

    const orgIndex = await readMemoryPath(database as never, {
      orgId: org.id,
      orgMemberId: member.orgMember.id,
      scope: 'org',
      path: 'Projects/PROJECTS.md',
      storage,
    })
    expect(orgIndex.parsed?.kind).toBe('directoryIndex')

    const orgFile = await readMemoryPath(database as never, {
      orgId: org.id,
      orgMemberId: member.orgMember.id,
      scope: 'org',
      path: 'Projects/Launch Notes.md',
      storage,
    })
    expect(orgFile.path).toBe('Projects/Launch Notes.md')
    expect(orgFile.content).toContain('Rocket lantern signal')
    expect(orgFile.parsed).toBeNull()

    const memberCurrentWork = await listMemoryDirectory(database as never, {
      orgId: org.id,
      orgMemberId: member.orgMember.id,
      scope: 'member',
      path: 'Current Work',
    })
    expect(memberCurrentWork.entries.map((entry) => entry.path)).toEqual([
      'Current Work/CURRENT-WORK.md',
      'Current Work/Private Focus.md',
    ])

    const memberRelationships = await listMemoryDirectory(database as never, {
      orgId: org.id,
      orgMemberId: member.orgMember.id,
      scope: 'member',
      path: 'Relationships',
    })
    expect(memberRelationships.entries).toHaveLength(0)

    const orgSearch = await searchMemory(database as never, {
      orgId: org.id,
      orgMemberId: member.orgMember.id,
      scope: 'org',
      query: 'rocket lantern',
      limit: 5,
      storage,
    })
    expect(orgSearch.results.map((result) => result.path)).toContain(
      'Projects/Launch Notes.md'
    )
    expect(orgSearch.results.every((result) => result.scopeType === 'org')).toBe(
      true
    )

    const memberSearch = await searchMemory(database as never, {
      orgId: org.id,
      orgMemberId: member.orgMember.id,
      scope: 'member',
      query: 'private lighthouse',
      limit: 5,
      storage,
    })
    expect(memberSearch.results.map((result) => result.path)).toContain(
      'Current Work/Private Focus.md'
    )
    expect(
      memberSearch.results.every((result) => result.scopeType === 'member')
    ).toBe(true)

    const combinedSearch = await searchMemory(database as never, {
      orgId: org.id,
      orgMemberId: member.orgMember.id,
      scope: 'all',
      query: 'signal',
      limit: 10,
      storage,
    })
    expect(
      combinedSearch.results.some((result) => result.scopeType === 'org')
    ).toBe(true)
    expect(
      combinedSearch.results.some((result) => result.scopeType === 'member')
    ).toBe(true)
  })

  it('covers structural maintenance across org and member vaults, including worker-driven maintenance', async () => {
    const database = new ScenarioMemoryDatabase()
    const storage = new ScenarioMemoryStorage()

    const org = {
      id: 'org_456',
      name: 'Kodi',
      slug: 'kodi',
    }
    const member = {
      org,
      orgMember: {
        id: 'org_member_456',
        orgId: org.id,
        userId: 'user_456',
        role: 'member' as const,
      },
    }

    const orgVault = await ensureOrgMemoryVault(database as never, org, storage)
    const memberVault = await ensureMemberMemoryVault(
      database as never,
      member,
      storage
    )
    const syncScenarioStructureVault: NonNullable<
      MemoryStructureDeps['syncVaultMetadata']
    > = async (vault, syncStorage) =>
      syncMemoryVaultMetadata(
        database as never,
        {
          id: vault.id,
          rootPath: vault.rootPath,
          manifestPath: vault.manifestPath,
        },
        syncStorage
      )
    const structureDeps: MemoryStructureDeps = {
      database: database as never,
      storage,
      resolveVault: async (input) =>
        input.scope === 'member'
          ? {
              id: memberVault.id,
              orgId: memberVault.orgId,
              scopeType: memberVault.scopeType,
              orgMemberId: memberVault.orgMemberId,
              rootPath: memberVault.rootPath,
              manifestPath: memberVault.manifestPath,
            }
          : {
              id: orgVault.id,
              orgId: orgVault.orgId,
              scopeType: orgVault.scopeType,
              orgMemberId: orgVault.orgMemberId,
              rootPath: orgVault.rootPath,
              manifestPath: orgVault.manifestPath,
            },
      syncVaultMetadata: syncScenarioStructureVault,
    }

    await createScopedMemoryDirectory({
      orgId: org.id,
      scope: 'org',
      path: 'Runbooks',
      deps: structureDeps,
    })
    await createScopedMemoryFile({
      orgId: org.id,
      scope: 'org',
      path: 'Runbooks/Onboarding Master.md',
      content:
        '# Onboarding Master\n\nChecklist tasks and owners for the onboarding program.\n',
      deps: structureDeps,
    })
    await renameScopedMemoryPath({
      orgId: org.id,
      scope: 'org',
      path: 'Runbooks',
      newName: 'Playbooks',
      deps: structureDeps,
    })
    await splitScopedMemoryFile({
      orgId: org.id,
      scope: 'org',
      sourcePath: 'Playbooks/Onboarding Master.md',
      targets: [
        {
          path: 'Playbooks/Onboarding Checklist.md',
          content:
            '# Onboarding Checklist\n\nChecklist tasks for the onboarding program.\n',
        },
        {
          path: 'Playbooks/Onboarding Owners.md',
          content:
            '# Onboarding Owners\n\nOwners for the onboarding program.\n',
        },
      ],
      deps: structureDeps,
    })
    await mergeScopedMemoryFiles({
      orgId: org.id,
      scope: 'org',
      sourcePaths: [
        'Playbooks/Onboarding Checklist.md',
        'Playbooks/Onboarding Owners.md',
      ],
      targetPath: 'Playbooks/Onboarding Guide.md',
      content:
        '# Onboarding Program Guide\n\nThe onboarding program guide combines checklist tasks and owners.\n',
      deps: structureDeps,
    })
    await moveScopedMemoryPath({
      orgId: org.id,
      scope: 'org',
      fromPath: 'Playbooks/Onboarding Guide.md',
      toPath: 'Processes/Onboarding Guide.md',
      deps: structureDeps,
    })
    await renameScopedMemoryPath({
      orgId: org.id,
      scope: 'org',
      path: 'Processes/Onboarding Guide.md',
      newName: 'Onboarding Program Guide.md',
      deps: structureDeps,
    })

    await createScopedMemoryDirectory({
      orgId: org.id,
      scope: 'member',
      actorUserId: member.orgMember.userId,
      actorOrgMemberId: member.orgMember.id,
      path: 'Working Sets',
      deps: structureDeps,
    })
    await createScopedMemoryFile({
      orgId: org.id,
      scope: 'member',
      actorUserId: member.orgMember.userId,
      actorOrgMemberId: member.orgMember.id,
      path: 'Working Sets/Research Threads.md',
      content:
        '# Research Threads\n\nPrivate research thread priorities for Q2.\n',
      deps: structureDeps,
    })
    await renameScopedMemoryPath({
      orgId: org.id,
      scope: 'member',
      actorUserId: member.orgMember.userId,
      actorOrgMemberId: member.orgMember.id,
      path: 'Working Sets',
      newName: 'Private Projects',
      deps: structureDeps,
    })
    await moveScopedMemoryPath({
      orgId: org.id,
      scope: 'member',
      actorUserId: member.orgMember.userId,
      actorOrgMemberId: member.orgMember.id,
      fromPath: 'Private Projects/Research Threads.md',
      toPath: 'Current Work/Research Threads.md',
      deps: structureDeps,
    })
    await renameScopedMemoryPath({
      orgId: org.id,
      scope: 'member',
      actorUserId: member.orgMember.userId,
      actorOrgMemberId: member.orgMember.id,
      path: 'Current Work/Research Threads.md',
      newName: 'Q2 Research Threads.md',
      deps: structureDeps,
    })
    await deleteScopedMemoryPath({
      orgId: org.id,
      scope: 'member',
      actorUserId: member.orgMember.userId,
      actorOrgMemberId: member.orgMember.id,
      path: 'Private Projects',
      deps: structureDeps,
    })

    const structuralEvent = normalizeMemoryUpdateEvent({
      orgId: org.id,
      source: 'user_request',
      occurredAt: '2026-05-01T18:45:00.000Z',
      visibility: 'shared',
      summary: 'Rename the shared onboarding guide so the final title is consistent.',
      actor: {
        userId: member.orgMember.userId,
        orgMemberId: member.orgMember.id,
      },
      payload: {
        requestId: 'request_structure_1',
        surface: 'memory_ui',
        path: 'Processes/Onboarding Program Guide.md',
      },
    })
    const structuralEvaluation: MemoryUpdateEvaluation = {
      scope: 'org',
      action: 'trigger_structural_maintenance',
      durability: 'durable',
      shouldWrite: true,
      confidence: 'high',
      rationale: ['The final shared guide title should be normalized.'],
      signalTags: ['structure'],
      memoryKind: 'other',
      topicLabel: 'Shared onboarding program guide',
      topicSummary: 'Normalize the final title of the shared onboarding guide.',
      topicKeywords: ['onboarding', 'guide', 'title'],
      guardrailsApplied: [],
      engine: 'openclaw',
    }
    const structuralPlan: MemoryScopeUpdatePlan = {
      scope: 'org',
      vaultId: orgVault.id,
      rootPath: orgVault.rootPath,
      manifestPath: orgVault.manifestPath,
      directoryPath: 'Processes',
      indexPath: 'Processes/PROCESSES.md',
      targetPath: 'Processes/Onboarding Program Guide.md',
      action: 'trigger_structural_maintenance',
      requiredReads: [
        'MEMORY.md',
        'Processes/PROCESSES.md',
        'Processes/Onboarding Program Guide.md',
      ],
      candidatePaths: ['Processes/Onboarding Program Guide.md'],
      searchQuery: 'shared onboarding guide title',
      requiresIndexRepair: true,
      requiresManifestRepair: false,
      rationale: ['Rename the shared guide to the final stable title.'],
    }

    const executionResult = await executeMemoryUpdatePlan(
      structuralEvent,
      structuralEvaluation,
      {
        scopes: [structuralPlan],
        requiredReads: ['org:Processes/Onboarding Program Guide.md'],
      },
      {
        database: database as never,
        storage,
        resolveVault: structureDeps.resolveVault,
        syncVaultMetadata: async (vault, syncStorage) => {
          const resolvedVaultId =
            (vault as { vaultId?: string; id?: string }).vaultId ??
            (vault as { id?: string }).id

          if (!resolvedVaultId) {
            throw new Error('Scenario sync expected a vault id.')
          }

          return syncMemoryVaultMetadata(
            database as never,
            {
              id: resolvedVaultId,
              rootPath: vault.rootPath,
              manifestPath: vault.manifestPath,
            },
            syncStorage
          )
        },
        completeStructureChat: createStructureCompletion({
          operation: 'rename_path',
          path: 'Processes/Onboarding Program Guide.md',
          newName: 'Shared Onboarding Program Guide.md',
          rationale: ['The shared guide should use the canonical final title.'],
        }),
      }
    )

    expect(executionResult.executedScopes).toHaveLength(1)
    expect(executionResult.deferredScopes).toHaveLength(0)
    expect(executionResult.executedScopes[0]?.structuralOperation).toBe(
      'rename_path'
    )

    const orgManifest = await getMemoryManifest(database as never, {
      orgId: org.id,
      orgMemberId: member.orgMember.id,
      scope: 'org',
      storage,
    })
    expect(orgManifest.content).toContain('Playbooks/')
    expect(orgManifest.content).not.toContain('Runbooks/')

    const orgProcesses = await listMemoryDirectory(database as never, {
      orgId: org.id,
      orgMemberId: member.orgMember.id,
      scope: 'org',
      path: 'Processes',
    })
    expect(orgProcesses.entries.map((entry) => entry.path)).toContain(
      'Processes/Shared Onboarding Program Guide.md'
    )

    const orgPlaybooks = await listMemoryDirectory(database as never, {
      orgId: org.id,
      orgMemberId: member.orgMember.id,
      scope: 'org',
      path: 'Playbooks',
    })
    expect(orgPlaybooks.entries.map((entry) => entry.path)).toContain(
      'Playbooks/PLAYBOOKS.md'
    )

    const orgGuide = await readMemoryPath(database as never, {
      orgId: org.id,
      orgMemberId: member.orgMember.id,
      scope: 'org',
      path: 'Processes/Shared Onboarding Program Guide.md',
      storage,
    })
    expect(orgGuide.content).toContain('onboarding program guide')

    const orgSearch = await searchMemory(database as never, {
      orgId: org.id,
      orgMemberId: member.orgMember.id,
      scope: 'org',
      query: 'combines checklist tasks',
      limit: 5,
      storage,
    })
    expect(orgSearch.results.map((result) => result.path)).toContain(
      'Processes/Shared Onboarding Program Guide.md'
    )

    const memberCurrentWork = await listMemoryDirectory(database as never, {
      orgId: org.id,
      orgMemberId: member.orgMember.id,
      scope: 'member',
      path: 'Current Work',
    })
    expect(memberCurrentWork.entries.map((entry) => entry.path)).toContain(
      'Current Work/Q2 Research Threads.md'
    )

    const memberPrivateProjects = await listMemoryDirectory(database as never, {
      orgId: org.id,
      orgMemberId: member.orgMember.id,
      scope: 'member',
      path: 'Private Projects',
    })
    expect(memberPrivateProjects.entries).toHaveLength(0)

    const memberSearch = await searchMemory(database as never, {
      orgId: org.id,
      orgMemberId: member.orgMember.id,
      scope: 'member',
      query: 'research thread priorities',
      limit: 5,
      storage,
    })
    expect(memberSearch.results.map((result) => result.path)).toContain(
      'Current Work/Q2 Research Threads.md'
    )
  })
})
