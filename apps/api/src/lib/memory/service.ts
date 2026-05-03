import { TRPCError } from '@trpc/server'
import {
  and,
  db,
  desc,
  eq,
  isNull,
  memoryPaths,
  memoryVaults,
  sql,
  type OrgMember,
  type Organization,
  type MemoryPath,
  type MemoryVault,
} from '@kodi/db'
import {
  ensureMemberMemoryVault,
  ensureOrgMemoryVault,
} from './bootstrap'
import { parseMemoryDocument, parseMemoryManifest } from './parse'
import type { MemoryStorage } from './storage'

export type MemoryScope = 'org' | 'member'
export type MemorySearchScope = MemoryScope | 'all'

type ResolvedMemoryVault = Pick<
  MemoryVault,
  'id' | 'orgId' | 'scopeType' | 'orgMemberId' | 'rootPath' | 'manifestPath'
>

type MemoryVaultBootstrapContext = {
  org?: Pick<Organization, 'id' | 'name' | 'slug'>
  orgMember?: Pick<OrgMember, 'id' | 'orgId' | 'userId' | 'role'>
  storage?: MemoryStorage
}

export type MemoryDirectoryEntry = Pick<
  MemoryPath,
  'path' | 'title' | 'pathType' | 'isManifest' | 'isIndex' | 'lastUpdatedAt'
> & {
  name: string
}

export type MemorySearchResult = {
  scopeType: MemoryScope
  path: string
  title: string | null
  isManifest: boolean
  isIndex: boolean
  lastUpdatedAt: Date
  preview: string
  rank: number
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

async function resolveStorage(storage?: MemoryStorage) {
  if (storage) return storage
  return (await import('./storage')).createMemoryStorage()
}

async function resolveMemoryVault(
  database: typeof db,
  input: {
    orgId: string
    orgMemberId: string
    scope: MemoryScope
  } & MemoryVaultBootstrapContext
) {
  const where =
    input.scope === 'org'
      ? and(
          eq(memoryVaults.orgId, input.orgId),
          eq(memoryVaults.scopeType, 'org')
        )
      : and(
          eq(memoryVaults.orgId, input.orgId),
          eq(memoryVaults.scopeType, 'member'),
          eq(memoryVaults.orgMemberId, input.orgMemberId)
        )

  const vault = await database.query.memoryVaults.findFirst({
    columns: {
      id: true,
      orgId: true,
      scopeType: true,
      orgMemberId: true,
      rootPath: true,
      manifestPath: true,
    },
    where,
  })

  if (!vault && input.org && input.scope === 'org') {
    return ensureOrgMemoryVault(
      database,
      input.org,
      input.storage
    ) as Promise<ResolvedMemoryVault>
  }

  if (!vault && input.org && input.orgMember && input.scope === 'member') {
    return ensureMemberMemoryVault(
      database,
      {
        org: input.org,
        orgMember: input.orgMember,
      },
      input.storage
    ) as Promise<ResolvedMemoryVault>
  }

  if (!vault) {
    throw new TRPCError({
      code: 'NOT_FOUND',
      message:
        input.scope === 'org'
          ? 'Org memory vault not found.'
          : 'Member memory vault not found.',
    })
  }

  return vault satisfies ResolvedMemoryVault
}

async function resolveSearchVaults(
  database: typeof db,
  input: {
    orgId: string
    orgMemberId: string
    scope: MemorySearchScope
  } & MemoryVaultBootstrapContext
) {
  if (input.scope === 'org' || input.scope === 'member') {
    return [
      await resolveMemoryVault(database, {
        orgId: input.orgId,
        orgMemberId: input.orgMemberId,
        scope: input.scope,
      }),
    ]
  }

  const [orgVault, memberVault] = await Promise.all([
    resolveMemoryVault(database, { ...input, scope: 'org' }),
    resolveMemoryVault(database, { ...input, scope: 'member' }),
  ])

  return [orgVault, memberVault]
}

function buildStoragePath(vault: ResolvedMemoryVault, path?: string) {
  return joinPath(vault.rootPath, path)
}

export function buildMemorySearchPreview(content: string, query: string) {
  const normalizedQuery = query.trim()
  if (!normalizedQuery) return content.slice(0, 160).trim()

  const lowerContent = content.toLowerCase()
  const lowerQuery = normalizedQuery.toLowerCase()
  const matchIndex = lowerContent.indexOf(lowerQuery)

  if (matchIndex === -1) {
    return content.slice(0, 160).trim()
  }

  const start = Math.max(0, matchIndex - 60)
  const end = Math.min(content.length, matchIndex + normalizedQuery.length + 100)
  return content.slice(start, end).trim()
}

export async function getMemoryManifest(
  database: typeof db,
  input: {
    orgId: string
    orgMemberId: string
    scope: MemoryScope
    storage?: MemoryStorage
  } & MemoryVaultBootstrapContext
) {
  const storage = await resolveStorage(input.storage)
  const vault = await resolveMemoryVault(database, { ...input, storage })
  const content = (
    await storage.readFile(buildStoragePath(vault, 'MEMORY.md'))
  ).toString('utf8')

  return {
    scopeType: vault.scopeType as MemoryScope,
    path: 'MEMORY.md',
    content,
    parsed: parseMemoryManifest(content),
  }
}

export async function listMemoryDirectory(
  database: typeof db,
  input: {
    orgId: string
    orgMemberId: string
    scope: MemoryScope
    path?: string
    storage?: MemoryStorage
  } & MemoryVaultBootstrapContext
) {
  const vault = await resolveMemoryVault(database, input)
  const normalizedPath = normalizePath(input.path)

  const entries = await database.query.memoryPaths.findMany({
    columns: {
      path: true,
      title: true,
      pathType: true,
      isManifest: true,
      isIndex: true,
      lastUpdatedAt: true,
    },
    where: normalizedPath
      ? and(
          eq(memoryPaths.vaultId, vault.id),
          eq(memoryPaths.parentPath, normalizedPath)
        )
      : and(eq(memoryPaths.vaultId, vault.id), isNull(memoryPaths.parentPath)),
  })

  return {
    scopeType: vault.scopeType as MemoryScope,
    path: normalizedPath,
    entries: entries
      .map((entry) => ({
        ...entry,
        name: basename(entry.path),
      }))
      .sort((left, right) => {
        if (left.pathType !== right.pathType) {
          return left.pathType === 'directory' ? -1 : 1
        }

        return left.path.localeCompare(right.path)
      }) satisfies MemoryDirectoryEntry[],
  }
}

export async function readMemoryPath(
  database: typeof db,
  input: {
    orgId: string
    orgMemberId: string
    scope: MemoryScope
    path: string
    storage?: MemoryStorage
  } & MemoryVaultBootstrapContext
) {
  const storage = await resolveStorage(input.storage)
  const vault = await resolveMemoryVault(database, { ...input, storage })
  const normalizedPath = normalizePath(input.path)

  const metadata = await database.query.memoryPaths.findFirst({
    columns: {
      path: true,
      title: true,
      pathType: true,
      isManifest: true,
      isIndex: true,
      lastUpdatedAt: true,
    },
    where: and(
      eq(memoryPaths.vaultId, vault.id),
      eq(memoryPaths.path, normalizedPath)
    ),
  })

  if (!metadata) {
    throw new TRPCError({ code: 'NOT_FOUND', message: 'Memory path not found.' })
  }

  if (metadata.pathType !== 'file') {
    throw new TRPCError({
      code: 'BAD_REQUEST',
      message: 'Only file paths can be opened directly.',
    })
  }

  const content = (
    await storage.readFile(buildStoragePath(vault, normalizedPath))
  ).toString('utf8')

  return {
    scopeType: vault.scopeType as MemoryScope,
    ...metadata,
    content,
    parsed: parseMemoryDocument(normalizedPath, content),
  }
}

export async function searchMemory(
  database: typeof db,
  input: {
    orgId: string
    orgMemberId: string
    scope: MemorySearchScope
    query: string
    limit?: number
    storage?: MemoryStorage
  } & MemoryVaultBootstrapContext
) {
  const normalizedQuery = input.query.trim()
  if (!normalizedQuery) {
    return {
      scope: input.scope,
      results: [] as MemorySearchResult[],
    }
  }

  const storage = await resolveStorage(input.storage)
  const vaults = await resolveSearchVaults(database, input)
  const tsQuery = sql`websearch_to_tsquery('english', ${normalizedQuery})`
  const perVaultLimit = Math.max(input.limit ?? 10, 1)
  const results: MemorySearchResult[] = []

  for (const vault of vaults) {
    const rows = await database
      .select({
        path: memoryPaths.path,
        title: memoryPaths.title,
        isManifest: memoryPaths.isManifest,
        isIndex: memoryPaths.isIndex,
        lastUpdatedAt: memoryPaths.lastUpdatedAt,
        rank: sql<number>`ts_rank_cd(${memoryPaths.contentSearchVector}, ${tsQuery})`,
      })
      .from(memoryPaths)
      .where(
        and(
          eq(memoryPaths.vaultId, vault.id),
          eq(memoryPaths.pathType, 'file'),
          sql`${memoryPaths.contentSearchVector} @@ ${tsQuery}`
        )
      )
      .orderBy(
        desc(sql<number>`ts_rank_cd(${memoryPaths.contentSearchVector}, ${tsQuery})`),
        desc(memoryPaths.lastUpdatedAt)
      )
      .limit(perVaultLimit)

    for (const row of rows) {
      const content = (
        await storage.readFile(buildStoragePath(vault, row.path))
      ).toString('utf8')

      results.push({
        scopeType: vault.scopeType as MemoryScope,
        path: row.path,
        title: row.title,
        isManifest: row.isManifest,
        isIndex: row.isIndex,
        lastUpdatedAt: row.lastUpdatedAt,
        preview: buildMemorySearchPreview(content, normalizedQuery),
        rank: row.rank,
      })
    }
  }

  return {
    scope: input.scope,
    results: results
      .sort((left, right) => {
        if (left.rank !== right.rank) {
          return right.rank - left.rank
        }

        return right.lastUpdatedAt.getTime() - left.lastUpdatedAt.getTime()
      })
      .slice(0, input.limit ?? 10),
  }
}
