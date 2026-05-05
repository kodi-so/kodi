import { describe, expect, it } from 'bun:test'
import {
  buildMemoryPathSyncRecord,
  collectMemoryPathSyncRecords,
  isDirectoryIndexPath,
} from './paths'
import type {
  MemoryStorage,
  MemoryStorageListEntry,
  MemoryStorageSearchInput,
  MemoryStorageSearchResult,
  MemoryStorageStat,
  MemoryStorageWriteInput,
} from './storage'

class FakeMemoryStorage implements MemoryStorage {
  constructor(
    private readonly directories: Set<string>,
    private readonly files: Map<string, string>
  ) {}

  async listDirectory(path = '') {
    const normalizedPath = this.normalizePath(path)
    const children = new Map<string, MemoryStorageListEntry>()

    for (const directory of this.directories) {
      const parentPath = this.parentPath(directory)
      if (parentPath !== normalizedPath) continue

      children.set(directory, {
        path: directory,
        name: this.basename(directory),
        type: 'directory',
        size: null,
        lastModified: null,
      })
    }

    for (const [filePath, content] of this.files) {
      const parentPath = this.parentPath(filePath)
      if (parentPath !== normalizedPath) continue

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

  async writeFile(_input: MemoryStorageWriteInput) {
    throw new Error('Not implemented in fake storage')
  }

  async movePath(_fromPath: string, _toPath: string) {
    throw new Error('Not implemented in fake storage')
  }

  async deletePath(_path: string) {
    throw new Error('Not implemented in fake storage')
  }

  async createDirectory(_path: string) {
    throw new Error('Not implemented in fake storage')
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
    throw new Error('Not implemented in fake storage')
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
}

describe('isDirectoryIndexPath', () => {
  it('recognizes directory index filenames based on their parent directory', () => {
    expect(isDirectoryIndexPath('Projects/PROJECTS.md')).toBe(true)
    expect(isDirectoryIndexPath('Current State/CURRENT-STATE.md')).toBe(true)
    expect(isDirectoryIndexPath('Projects/Launch Plan.md')).toBe(false)
  })
})

describe('buildMemoryPathSyncRecord', () => {
  it('derives manifest and index metadata from markdown content', () => {
    const manifest = buildMemoryPathSyncRecord({
      path: 'MEMORY.md',
      pathType: 'file',
      content: '# Kodi Memory\n\nShared durable memory.',
    })

    const index = buildMemoryPathSyncRecord({
      path: 'Projects/PROJECTS.md',
      pathType: 'file',
      content: '# Projects\n\nDirectory index.',
    })

    expect(manifest.isManifest).toBe(true)
    expect(manifest.title).toBe('Kodi Memory')
    expect(index.isIndex).toBe(true)
    expect(index.title).toBe('Projects index')
    expect(index.parentPath).toBe('Projects')
  })
})

describe('collectMemoryPathSyncRecords', () => {
  it('walks the live vault structure and derives sync metadata', async () => {
    const storage = new FakeMemoryStorage(
      new Set([
        'memory/org_123/org',
        'memory/org_123/org/Projects',
        'memory/org_123/org/Current State',
      ]),
      new Map([
        [
          'memory/org_123/org/MEMORY.md',
          '# Kodi Memory\n\nShared org memory.',
        ],
        [
          'memory/org_123/org/Projects/PROJECTS.md',
          '# Projects\n\nDirectory index.',
        ],
        [
          'memory/org_123/org/Projects/Launch Plan.md',
          '# Launch Plan\n\nDurable rollout context.',
        ],
        [
          'memory/org_123/org/Current State/CURRENT-STATE.md',
          '# Current State\n\nWhat is active now.',
        ],
      ])
    )

    const records = await collectMemoryPathSyncRecords(storage, {
      rootPath: 'memory/org_123/org',
      manifestPath: 'memory/org_123/org/MEMORY.md',
    })

    const summarized = records.map((record) => ({
      path: record.path,
      pathType: record.pathType,
      title: record.title,
      isManifest: record.isManifest,
      isIndex: record.isIndex,
    }))

    expect(summarized).toEqual([
      {
        path: 'Current State',
        pathType: 'directory',
        title: 'Current State',
        isManifest: false,
        isIndex: false,
      },
      {
        path: 'Current State/CURRENT-STATE.md',
        pathType: 'file',
        title: 'Current State index',
        isManifest: false,
        isIndex: true,
      },
      {
        path: 'MEMORY.md',
        pathType: 'file',
        title: 'Kodi Memory',
        isManifest: true,
        isIndex: false,
      },
      {
        path: 'Projects',
        pathType: 'directory',
        title: 'Projects',
        isManifest: false,
        isIndex: false,
      },
      {
        path: 'Projects/Launch Plan.md',
        pathType: 'file',
        title: 'Launch Plan',
        isManifest: false,
        isIndex: false,
      },
      {
        path: 'Projects/PROJECTS.md',
        pathType: 'file',
        title: 'Projects index',
        isManifest: false,
        isIndex: true,
      },
    ])
  })
})
