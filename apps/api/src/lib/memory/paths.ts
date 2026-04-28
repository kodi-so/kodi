import {
  and,
  db,
  eq,
  inArray,
  memoryPaths,
  sql,
  type MemoryVault,
} from '@kodi/db'
import type { MemoryStorage, MemoryStoragePathType } from './storage'

export const DEFAULT_MEMORY_MARKDOWN_CONTENT_TYPE =
  'text/markdown; charset=utf-8'

export type MemoryVaultPathRoot = Pick<MemoryVault, 'rootPath' | 'manifestPath'>
export type MemoryVaultSyncTarget = Pick<
  MemoryVault,
  'id' | 'rootPath' | 'manifestPath'
>

export type MemoryPathSyncRecord = {
  path: string
  pathType: MemoryStoragePathType
  parentPath: string | null
  title: string
  isManifest: boolean
  isIndex: boolean
  content: string | null
  lastUpdatedAt: Date
}

export type MemoryPathSyncResult = {
  upsertedCount: number
  deletedCount: number
}

export type MemoryPathSyncExecutor = Pick<
  typeof db,
  'delete' | 'execute' | 'insert' | 'query'
>

async function resolveStorage(storage?: MemoryStorage) {
  if (storage) {
    return storage
  }

  return (await import('./storage')).createMemoryStorage()
}

function normalizePath(path?: string) {
  if (!path) return ''
  return path
    .trim()
    .replace(/^\/+/, '')
    .replace(/\/+$/, '')
}

function joinPath(...parts: Array<string | undefined>) {
  return parts.map((part) => normalizePath(part)).filter(Boolean).join('/')
}

function basename(path: string) {
  const normalized = normalizePath(path)
  if (!normalized) return ''
  const segments = normalized.split('/')
  return segments[segments.length - 1] ?? ''
}

function dirname(path: string) {
  const normalized = normalizePath(path)
  if (!normalized) return null
  const segments = normalized.split('/')
  if (segments.length <= 1) return null
  return segments.slice(0, -1).join('/')
}

function fileStem(path: string) {
  return basename(path).replace(/\.[^.]+$/, '')
}

function toTitleCase(value: string) {
  return value
    .split(/\s+/)
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(' ')
}

function humanizeFileStem(path: string) {
  const humanized = fileStem(path).replace(/[-_]+/g, ' ').trim()
  return toTitleCase(humanized || 'Untitled')
}

function extractMarkdownHeading(content: string) {
  const match = content.match(/^#{1,6}\s+(.+?)\s*$/m)
  return match?.[1]?.trim() ?? null
}

function isMarkdownPath(path: string) {
  return /\.md$/i.test(path)
}

function isManifestPath(path: string) {
  return normalizePath(path) === 'MEMORY.md'
}

function normalizeIndexStem(value: string) {
  return value
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

export function isDirectoryIndexPath(path: string) {
  const normalizedPath = normalizePath(path)
  if (!isMarkdownPath(normalizedPath)) return false

  const parentDirectory = dirname(normalizedPath)
  if (!parentDirectory) return false

  return (
    normalizeIndexStem(fileStem(normalizedPath)) ===
    normalizeIndexStem(basename(parentDirectory))
  )
}

export function buildMemoryPathSyncRecord(input: {
  path: string
  pathType: MemoryStoragePathType
  content?: string | null
  lastUpdatedAt?: Date | null
}) {
  const path = normalizePath(input.path)
  const isManifest = input.pathType === 'file' && isManifestPath(path)
  const isIndex = input.pathType === 'file' && isDirectoryIndexPath(path)
  const content = input.pathType === 'file' && isMarkdownPath(path)
    ? (input.content ?? null)
    : null
  const heading = content ? extractMarkdownHeading(content) : null

  let title: string
  if (input.pathType === 'directory') {
    title = basename(path)
  } else if (isManifest) {
    title = heading ?? 'Kodi Memory'
  } else if (isIndex) {
    title = heading
      ? `${heading} index`
      : `${humanizeFileStem(dirname(path) ?? '')} index`
  } else {
    title = heading ?? humanizeFileStem(path)
  }

  return {
    path,
    pathType: input.pathType,
    parentPath: dirname(path),
    title,
    isManifest,
    isIndex,
    content,
    lastUpdatedAt: input.lastUpdatedAt ?? new Date(),
  } satisfies MemoryPathSyncRecord
}

function requireRelativePath(path: string, label: string) {
  const normalized = normalizePath(path)
  if (!normalized) {
    throw new Error(`${label} is required`)
  }

  return normalized
}

function buildVaultStoragePath(vault: MemoryVaultPathRoot, relativePath = '') {
  return joinPath(vault.rootPath, relativePath)
}

function toVaultRelativePath(vault: MemoryVaultPathRoot, storagePath: string) {
  const normalizedRootPath = normalizePath(vault.rootPath)
  const normalizedStoragePath = normalizePath(storagePath)

  if (normalizedStoragePath === normalizedRootPath) {
    return ''
  }

  if (!normalizedStoragePath.startsWith(`${normalizedRootPath}/`)) {
    throw new Error(
      `Storage path ${normalizedStoragePath} does not belong to vault root ${normalizedRootPath}`
    )
  }

  return normalizedStoragePath.slice(normalizedRootPath.length + 1)
}

async function collectDirectoryRecords(
  storage: MemoryStorage,
  vault: MemoryVaultPathRoot,
  relativeDirectoryPath = ''
) {
  const entries = await storage.listDirectory(
    buildVaultStoragePath(vault, relativeDirectoryPath)
  )

  const records: MemoryPathSyncRecord[] = []

  for (const entry of entries) {
    const relativePath = toVaultRelativePath(vault, entry.path)
    if (!relativePath) continue

    if (entry.type === 'directory') {
      records.push(
        buildMemoryPathSyncRecord({
          path: relativePath,
          pathType: 'directory',
          lastUpdatedAt: entry.lastModified,
        })
      )
      records.push(...(await collectDirectoryRecords(storage, vault, relativePath)))
      continue
    }

    const content = isMarkdownPath(relativePath)
      ? (await storage.readFile(entry.path)).toString('utf8')
      : null

    records.push(
      buildMemoryPathSyncRecord({
        path: relativePath,
        pathType: 'file',
        content,
        lastUpdatedAt: entry.lastModified,
      })
    )
  }

  return records.sort((left, right) => left.path.localeCompare(right.path))
}

function buildContentSearchVectorSql(record: MemoryPathSyncRecord) {
  if (record.content === null) {
    return sql`null`
  }

  return sql`to_tsvector('english', ${record.content})`
}

export async function collectMemoryPathSyncRecords(
  storage: MemoryStorage,
  vault: MemoryVaultPathRoot
) {
  return collectDirectoryRecords(storage, vault)
}

export async function applyMemoryPathSyncRecords(
  executor: MemoryPathSyncExecutor,
  vaultId: string,
  records: MemoryPathSyncRecord[]
) {
  const existingRows = await executor.query.memoryPaths.findMany({
    columns: {
      path: true,
    },
    where: eq(memoryPaths.vaultId, vaultId),
  })

  const recordPaths = new Set(records.map((record) => record.path))
  const stalePaths = existingRows
    .map((row) => row.path)
    .filter((path) => !recordPaths.has(path))

  if (stalePaths.length > 0) {
    await executor
      .delete(memoryPaths)
      .where(
        and(
          eq(memoryPaths.vaultId, vaultId),
          inArray(memoryPaths.path, stalePaths)
        )
      )
  }

  for (const record of records) {
    const contentSearchVector = buildContentSearchVectorSql(record)

    await executor
      .insert(memoryPaths)
      .values({
        vaultId,
        path: record.path,
        pathType: record.pathType,
        parentPath: record.parentPath,
        title: record.title,
        isManifest: record.isManifest,
        isIndex: record.isIndex,
        contentSearchVector: contentSearchVector as never,
        lastUpdatedAt: record.lastUpdatedAt,
      })
      .onConflictDoUpdate({
        target: [memoryPaths.vaultId, memoryPaths.path],
        set: {
          pathType: record.pathType,
          parentPath: record.parentPath,
          title: record.title,
          isManifest: record.isManifest,
          isIndex: record.isIndex,
          contentSearchVector: contentSearchVector as never,
          lastUpdatedAt: record.lastUpdatedAt,
          updatedAt: sql`now()`,
        },
      })
  }

  return {
    upsertedCount: records.length,
    deletedCount: stalePaths.length,
  } satisfies MemoryPathSyncResult
}

export async function syncMemoryVaultMetadata(
  database: typeof db,
  vault: MemoryVaultSyncTarget,
  storage?: MemoryStorage
) {
  const resolvedStorage = await resolveStorage(storage)
  const records = await collectMemoryPathSyncRecords(resolvedStorage, vault)

  return database.transaction(async (tx) => {
    await tx.execute(
      sql`select pg_advisory_xact_lock(hashtext(${`memory-path-sync:${vault.id}`}))`
    )

    return applyMemoryPathSyncRecords(
      tx as MemoryPathSyncExecutor,
      vault.id,
      records
    )
  })
}

export async function createMemoryDirectory(input: {
  database: typeof db
  vault: MemoryVaultSyncTarget
  path: string
  storage?: MemoryStorage
}) {
  const resolvedStorage = await resolveStorage(input.storage)
  const path = requireRelativePath(input.path, 'Directory path')

  await resolvedStorage.createDirectory(buildVaultStoragePath(input.vault, path))

  return syncMemoryVaultMetadata(input.database, input.vault, resolvedStorage)
}

export async function writeMemoryFile(input: {
  database: typeof db
  vault: MemoryVaultSyncTarget
  path: string
  body: Buffer | string
  contentType?: string
  storage?: MemoryStorage
}) {
  const resolvedStorage = await resolveStorage(input.storage)
  const path = requireRelativePath(input.path, 'File path')

  await resolvedStorage.writeFile({
    path: buildVaultStoragePath(input.vault, path),
    body: input.body,
    contentType: input.contentType ?? DEFAULT_MEMORY_MARKDOWN_CONTENT_TYPE,
  })

  return syncMemoryVaultMetadata(input.database, input.vault, resolvedStorage)
}

export async function moveMemoryPath(input: {
  database: typeof db
  vault: MemoryVaultSyncTarget
  fromPath: string
  toPath: string
  storage?: MemoryStorage
}) {
  const resolvedStorage = await resolveStorage(input.storage)
  const fromPath = requireRelativePath(input.fromPath, 'Source path')
  const toPath = requireRelativePath(input.toPath, 'Destination path')

  await resolvedStorage.movePath(
    buildVaultStoragePath(input.vault, fromPath),
    buildVaultStoragePath(input.vault, toPath)
  )

  return syncMemoryVaultMetadata(input.database, input.vault, resolvedStorage)
}

export async function deleteMemoryPath(input: {
  database: typeof db
  vault: MemoryVaultSyncTarget
  path: string
  storage?: MemoryStorage
}) {
  const resolvedStorage = await resolveStorage(input.storage)
  const path = requireRelativePath(input.path, 'Path')

  await resolvedStorage.deletePath(buildVaultStoragePath(input.vault, path))

  return syncMemoryVaultMetadata(input.database, input.vault, resolvedStorage)
}
