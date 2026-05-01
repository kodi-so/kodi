import { describe, expect, it } from 'bun:test'
import type { MemoryPathSyncResult } from './paths'
import {
  createScopedMemoryDirectory,
  createScopedMemoryFile,
  deleteScopedMemoryPath,
  moveScopedMemoryPath,
  renameScopedMemoryPath,
  type MemoryStructureDeps,
} from './structure'
import type {
  MemoryStorage,
  MemoryStorageListEntry,
  MemoryStorageSearchInput,
  MemoryStorageSearchResult,
  MemoryStorageStat,
  MemoryStorageWriteInput,
} from './storage'

class StructuralMemoryStorage implements MemoryStorage {
  constructor(
    private readonly directories = new Set<string>(),
    private readonly files = new Map<string, string>()
  ) {}

  async listDirectory(path = '') {
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
    this.ensureDirectoriesForPath(normalizedPath)
    this.files.set(
      normalizedPath,
      typeof input.body === 'string'
        ? input.body
        : Buffer.from(input.body).toString('utf8')
    )
  }

  async movePath(fromPath: string, toPath: string) {
    const normalizedFromPath = this.normalizePath(fromPath)
    const normalizedToPath = this.normalizePath(toPath)
    const stat = await this.statPath(normalizedFromPath)

    if (!stat) {
      throw new Error(`Path not found: ${normalizedFromPath}`)
    }

    if (stat.type === 'file') {
      const content = this.files.get(normalizedFromPath)
      if (content === undefined) {
        throw new Error(`Path not found: ${normalizedFromPath}`)
      }

      this.ensureDirectoriesForPath(normalizedToPath)
      this.files.set(normalizedToPath, content)
      this.files.delete(normalizedFromPath)
      return
    }

    this.ensureAllDirectories(normalizedToPath)
    const descendantDirectories = [...this.directories].filter(
      (directory) =>
        directory === normalizedFromPath ||
        directory.startsWith(`${normalizedFromPath}/`)
    )
    const descendantFiles = [...this.files.entries()].filter(([path]) =>
      path.startsWith(`${normalizedFromPath}/`)
    )

    for (const directory of descendantDirectories) {
      this.directories.delete(directory)
    }

    for (const [path] of descendantFiles) {
      this.files.delete(path)
    }

    for (const directory of descendantDirectories) {
      const suffix =
        directory === normalizedFromPath
          ? ''
          : directory.slice(normalizedFromPath.length + 1)
      this.directories.add(
        suffix ? `${normalizedToPath}/${suffix}` : normalizedToPath
      )
    }

    for (const [path, content] of descendantFiles) {
      const suffix = path.slice(normalizedFromPath.length + 1)
      this.files.set(`${normalizedToPath}/${suffix}`, content)
    }
  }

  async deletePath(path: string) {
    const normalizedPath = this.normalizePath(path)
    const stat = await this.statPath(normalizedPath)
    if (!stat) {
      throw new Error(`Path not found: ${normalizedPath}`)
    }

    if (stat.type === 'file') {
      this.files.delete(normalizedPath)
      return
    }

    for (const directory of [...this.directories]) {
      if (
        directory === normalizedPath ||
        directory.startsWith(`${normalizedPath}/`)
      ) {
        this.directories.delete(directory)
      }
    }

    for (const filePath of [...this.files.keys()]) {
      if (filePath.startsWith(`${normalizedPath}/`)) {
        this.files.delete(filePath)
      }
    }
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
    throw new Error('Not implemented in structural storage')
  }

  hasPath(path: string) {
    const normalizedPath = this.normalizePath(path)
    return this.files.has(normalizedPath) || this.directories.has(normalizedPath)
  }

  readText(path: string) {
    return this.files.get(this.normalizePath(path)) ?? null
  }

  private normalizePath(path?: string) {
    if (!path) return ''
    return path.replace(/^\/+/, '').replace(/\/+$/, '')
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

  private ensureDirectoriesForPath(path: string) {
    const parent = this.parentPath(path)
    if (parent) {
      this.ensureAllDirectories(parent)
    }
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

function createDeps(storage: StructuralMemoryStorage) {
  const syncCalls: string[] = []

  const deps = {
    storage,
    resolveVault: async (input) => ({
      id: input.scope === 'org' ? 'vault_org' : 'vault_member',
      orgId: input.orgId,
      scopeType: input.scope,
      orgMemberId: input.scope === 'member' ? 'org_member_123' : null,
      rootPath:
        input.scope === 'org'
          ? 'memory/org_123/org'
          : 'memory/org_123/members/org_member_123',
      manifestPath:
        input.scope === 'org'
          ? 'memory/org_123/org/MEMORY.md'
          : 'memory/org_123/members/org_member_123/MEMORY.md',
    }),
    syncVaultMetadata: async (vault) => {
      syncCalls.push(vault.id)
      return {
        upsertedCount: 4,
        deletedCount: 0,
      } satisfies MemoryPathSyncResult
    },
  } satisfies MemoryStructureDeps

  return { deps, syncCalls }
}

describe('memory structural path operations', () => {
  it('creates a new scoped memory directory and syncs metadata', async () => {
    const storage = new StructuralMemoryStorage(
      new Set(['memory', 'memory/org_123', 'memory/org_123/org']),
      new Map()
    )
    const { deps, syncCalls } = createDeps(storage)

    const result = await createScopedMemoryDirectory({
      orgId: 'org_123',
      scope: 'org',
      path: 'Playbooks',
      deps,
    })

    expect(result.vaultId).toBe('vault_org')
    expect(result.path).toBe('Playbooks')
    expect(storage.hasPath('memory/org_123/org/Playbooks')).toBe(true)
    expect(syncCalls).toEqual(['vault_org'])
  })

  it('creates a new scoped memory file and syncs metadata', async () => {
    const storage = new StructuralMemoryStorage(
      new Set([
        'memory',
        'memory/org_123',
        'memory/org_123/members',
        'memory/org_123/members/org_member_123',
        'memory/org_123/members/org_member_123/Preferences',
      ]),
      new Map()
    )
    const { deps, syncCalls } = createDeps(storage)

    const result = await createScopedMemoryFile({
      orgId: 'org_123',
      scope: 'member',
      actorUserId: 'user_123',
      path: 'Preferences/Recap Preferences.md',
      content: '# Recap Preferences\n\nNo Friday recap pings.\n',
      deps,
    })

    expect(result.vaultId).toBe('vault_member')
    expect(storage.readText(
      'memory/org_123/members/org_member_123/Preferences/Recap Preferences.md'
    )).toContain('No Friday recap pings')
    expect(syncCalls).toEqual(['vault_member'])
  })

  it('moves a scoped memory file across directories', async () => {
    const storage = new StructuralMemoryStorage(
      new Set([
        'memory',
        'memory/org_123',
        'memory/org_123/org',
        'memory/org_123/org/Projects',
        'memory/org_123/org/Current State',
      ]),
      new Map([
        [
          'memory/org_123/org/Projects/Launch Checklist.md',
          '# Launch Checklist\n\nDetails.\n',
        ],
      ])
    )
    const { deps, syncCalls } = createDeps(storage)

    const result = await moveScopedMemoryPath({
      orgId: 'org_123',
      scope: 'org',
      fromPath: 'Projects/Launch Checklist.md',
      toPath: 'Current State/Launch Checklist.md',
      deps,
    })

    expect(result.fromPath).toBe('Projects/Launch Checklist.md')
    expect(result.toPath).toBe('Current State/Launch Checklist.md')
    expect(storage.hasPath('memory/org_123/org/Projects/Launch Checklist.md')).toBe(
      false
    )
    expect(
      storage.hasPath('memory/org_123/org/Current State/Launch Checklist.md')
    ).toBe(true)
    expect(syncCalls).toEqual(['vault_org'])
  })

  it('renames a scoped memory file within its directory', async () => {
    const storage = new StructuralMemoryStorage(
      new Set([
        'memory',
        'memory/org_123',
        'memory/org_123/org',
        'memory/org_123/org/Projects',
      ]),
      new Map([
        [
          'memory/org_123/org/Projects/Launch Checklist.md',
          '# Launch Checklist\n\nDetails.\n',
        ],
      ])
    )
    const { deps } = createDeps(storage)

    const result = await renameScopedMemoryPath({
      orgId: 'org_123',
      scope: 'org',
      path: 'Projects/Launch Checklist.md',
      newName: 'Rollout Checklist.md',
      deps,
    })

    expect(result.toPath).toBe('Projects/Rollout Checklist.md')
    expect(storage.hasPath('memory/org_123/org/Projects/Rollout Checklist.md')).toBe(
      true
    )
  })

  it('deletes a scoped memory directory recursively', async () => {
    const storage = new StructuralMemoryStorage(
      new Set([
        'memory',
        'memory/org_123',
        'memory/org_123/org',
        'memory/org_123/org/Projects',
        'memory/org_123/org/Projects/Archive',
      ]),
      new Map([
        [
          'memory/org_123/org/Projects/Archive/Old Launch.md',
          '# Old Launch\n\nStale.\n',
        ],
      ])
    )
    const { deps, syncCalls } = createDeps(storage)

    const result = await deleteScopedMemoryPath({
      orgId: 'org_123',
      scope: 'org',
      path: 'Projects/Archive',
      deps,
    })

    expect(result.path).toBe('Projects/Archive')
    expect(storage.hasPath('memory/org_123/org/Projects/Archive')).toBe(false)
    expect(
      storage.hasPath('memory/org_123/org/Projects/Archive/Old Launch.md')
    ).toBe(false)
    expect(syncCalls).toEqual(['vault_org'])
  })
})
