import { db, type MemoryVault } from '@kodi/db'
import {
  ensureMemberMemoryVault,
  ensureOrgMemoryVault,
  type MemberVaultIdentity,
} from './bootstrap'
import {
  DEFAULT_MEMORY_MARKDOWN_CONTENT_TYPE,
  syncMemoryVaultMetadata,
  type MemoryPathSyncResult,
  type MemoryVaultSyncTarget,
} from './paths'
import type { MemoryStorage } from './storage'
import { repairStructuralNavigation } from './structure-repair'

export type MemoryStructureScope = 'org' | 'member'

export type ResolvedStructureVault = Pick<
  MemoryVault,
  'id' | 'orgId' | 'scopeType' | 'orgMemberId' | 'rootPath' | 'manifestPath'
>

type MemoryStructureResolvedPath = {
  vault: ResolvedStructureVault
  relativePath: string
  storagePath: string
}

export type MemoryStructureDeps = {
  database?: typeof db
  storage?: MemoryStorage
  resolveVault?: (
    input: MemoryStructureTargetInput,
    storage: MemoryStorage,
    database: typeof db
  ) => Promise<ResolvedStructureVault>
  syncVaultMetadata?: (
    vault: MemoryVaultSyncTarget,
    storage: MemoryStorage
  ) => Promise<MemoryPathSyncResult>
}

export type MemoryStructureTargetInput = {
  orgId: string
  scope: MemoryStructureScope
  actorUserId?: string | null
  actorOrgMemberId?: string | null
}

export type MemoryStructureMutationResult = {
  vaultId: string
  scope: MemoryStructureScope
  path: string
  syncResult: MemoryPathSyncResult
}

export type MemoryStructureMoveResult = MemoryStructureMutationResult & {
  fromPath: string
  toPath: string
}

export type MemoryStructureSplitTarget = {
  path: string
  content: string
  contentType?: string
}

export type MemoryStructureSplitResult = {
  vaultId: string
  scope: MemoryStructureScope
  sourcePath: string
  createdPaths: string[]
  syncResult: MemoryPathSyncResult
}

export type MemoryStructureMergeResult = {
  vaultId: string
  scope: MemoryStructureScope
  sourcePaths: string[]
  targetPath: string
  syncResult: MemoryPathSyncResult
}

function normalizePath(path?: string | null) {
  if (!path) return ''
  return path
    .trim()
    .replace(/^\/+/, '')
    .replace(/\/+$/, '')
}

function joinPath(...parts: Array<string | null | undefined>) {
  return parts.map((part) => normalizePath(part)).filter(Boolean).join('/')
}

function dirname(path: string) {
  const normalized = normalizePath(path)
  if (!normalized) return ''
  const parts = normalized.split('/')
  if (parts.length <= 1) return ''
  return parts.slice(0, -1).join('/')
}

function basename(path: string) {
  const normalized = normalizePath(path)
  if (!normalized) return ''
  const parts = normalized.split('/')
  return parts[parts.length - 1] ?? ''
}

function normalizeSafeRelativePath(path: string, label: string) {
  const normalized = normalizePath(path)
  if (!normalized) {
    throw new Error(`${label} is required.`)
  }

  if (
    normalized.includes('..') ||
    normalized.split('/').some((segment) => segment === '.' || segment === '..')
  ) {
    throw new Error(`${label} must stay inside the vault.`)
  }

  return normalized
}

async function resolveStorage(storage?: MemoryStorage) {
  if (storage) return storage
  return (await import('./storage')).createMemoryStorage()
}

async function resolveOrgIdentity(database: typeof db, orgId: string) {
  const org = await database.query.organizations.findFirst({
    columns: {
      id: true,
      name: true,
      slug: true,
    },
    where: (fields, { eq }) => eq(fields.id, orgId),
  })

  if (!org) {
    throw new Error(`Organization ${orgId} not found for memory structure ops.`)
  }

  return org
}

async function resolveMemberIdentity(
  database: typeof db,
  input: {
    orgId: string
    actorUserId?: string | null
    actorOrgMemberId?: string | null
  }
) {
  let membership: MemberVaultIdentity['orgMember'] | null = null

  if (input.actorOrgMemberId) {
    membership =
      (await database.query.orgMembers.findFirst({
        columns: {
          id: true,
          orgId: true,
          userId: true,
          role: true,
        },
        where: (fields, { and, eq }) =>
          and(eq(fields.orgId, input.orgId), eq(fields.id, input.actorOrgMemberId!)),
      })) ?? null
  } else if (input.actorUserId) {
    membership =
      (await database.query.orgMembers.findFirst({
        columns: {
          id: true,
          orgId: true,
          userId: true,
          role: true,
        },
        where: (fields, { and, eq }) =>
          and(eq(fields.orgId, input.orgId), eq(fields.userId, input.actorUserId!)),
      })) ?? null
  }

  if (!membership) {
    throw new Error(
      `Org member could not be resolved for member-scoped structure ops in org ${input.orgId}.`
    )
  }

  return {
    org: await resolveOrgIdentity(database, input.orgId),
    orgMember: membership,
  } satisfies MemberVaultIdentity
}

async function resolveScopedVaultInternal(
  database: typeof db,
  storage: MemoryStorage,
  input: MemoryStructureTargetInput
) {
  if (input.scope === 'org') {
    const vault = await ensureOrgMemoryVault(
      database,
      await resolveOrgIdentity(database, input.orgId),
      storage
    )

    return {
      id: vault.id,
      orgId: vault.orgId,
      scopeType: vault.scopeType,
      orgMemberId: vault.orgMemberId,
      rootPath: vault.rootPath,
      manifestPath: vault.manifestPath,
    } satisfies ResolvedStructureVault
  }

  const vault = await ensureMemberMemoryVault(
    database,
    await resolveMemberIdentity(database, input),
    storage
  )

  return {
    id: vault.id,
    orgId: vault.orgId,
    scopeType: vault.scopeType,
    orgMemberId: vault.orgMemberId,
    rootPath: vault.rootPath,
    manifestPath: vault.manifestPath,
  } satisfies ResolvedStructureVault
}

async function resolveScopedVault(
  input: MemoryStructureTargetInput,
  storage: MemoryStorage,
  database: typeof db
) {
  return resolveScopedVaultInternal(database, storage, input)
}

async function defaultSyncVaultMetadata(
  database: typeof db,
  vault: MemoryVaultSyncTarget,
  storage: MemoryStorage
) {
  return syncMemoryVaultMetadata(database, vault, storage)
}

async function resolveScopedPath(
  input: MemoryStructureTargetInput & {
    path: string
    database: typeof db
    storage: MemoryStorage
    resolveVault?: MemoryStructureDeps['resolveVault']
  }
) {
  const vault = await (input.resolveVault ?? resolveScopedVault)(
    input,
    input.storage,
    input.database
  )
  const relativePath = normalizeSafeRelativePath(input.path, 'Path')

  return {
    vault,
    relativePath,
    storagePath: joinPath(vault.rootPath, relativePath),
  } satisfies MemoryStructureResolvedPath
}

async function assertPathExists(storage: MemoryStorage, path: string, label: string) {
  const stat = await storage.statPath(path)
  if (!stat) {
    throw new Error(`${label} does not exist: ${path}`)
  }

  return stat
}

async function assertPathMissing(
  storage: MemoryStorage,
  path: string,
  label: string
) {
  const stat = await storage.statPath(path)
  if (stat) {
    throw new Error(`${label} already exists: ${path}`)
  }
}

function buildSyncVaultMutation(
  database: typeof db,
  storage: MemoryStorage,
  deps?: MemoryStructureDeps
) {
  return async (vault: ResolvedStructureVault) => {
    await repairStructuralNavigation({
      vault: {
        rootPath: vault.rootPath,
        manifestPath: vault.manifestPath,
      },
      storage,
    })

    return (deps?.syncVaultMetadata ?? ((syncVault, syncStorage) =>
      defaultSyncVaultMetadata(database, syncVault, syncStorage)))(
      {
        id: vault.id,
        rootPath: vault.rootPath,
        manifestPath: vault.manifestPath,
      },
      storage
    )
  }
}

export async function createScopedMemoryDirectory(
  input: MemoryStructureTargetInput & {
    path: string
    deps?: MemoryStructureDeps
  }
) {
  const database = input.deps?.database ?? db
  const storage = await resolveStorage(input.deps?.storage)
  const target = await resolveScopedPath({
    ...input,
    database,
    storage,
    resolveVault: input.deps?.resolveVault,
  })
  const syncVaultMutation = buildSyncVaultMutation(database, storage, input.deps)

  await assertPathMissing(storage, target.storagePath, 'Directory')
  await storage.createDirectory(target.storagePath)

  const syncResult = await syncVaultMutation(target.vault)

  return {
    vaultId: target.vault.id,
    scope: target.vault.scopeType,
    path: target.relativePath,
    syncResult,
  } satisfies MemoryStructureMutationResult
}

export async function createScopedMemoryFile(
  input: MemoryStructureTargetInput & {
    path: string
    content: string
    contentType?: string
    deps?: MemoryStructureDeps
  }
) {
  const database = input.deps?.database ?? db
  const storage = await resolveStorage(input.deps?.storage)
  const target = await resolveScopedPath({
    ...input,
    database,
    storage,
    resolveVault: input.deps?.resolveVault,
  })
  const syncVaultMutation = buildSyncVaultMutation(database, storage, input.deps)

  await assertPathMissing(storage, target.storagePath, 'File')
  await storage.writeFile({
    path: target.storagePath,
    body: input.content,
    contentType: input.contentType ?? DEFAULT_MEMORY_MARKDOWN_CONTENT_TYPE,
  })

  const syncResult = await syncVaultMutation(target.vault)

  return {
    vaultId: target.vault.id,
    scope: target.vault.scopeType,
    path: target.relativePath,
    syncResult,
  } satisfies MemoryStructureMutationResult
}

export async function moveScopedMemoryPath(
  input: MemoryStructureTargetInput & {
    fromPath: string
    toPath: string
    deps?: MemoryStructureDeps
  }
) {
  const database = input.deps?.database ?? db
  const storage = await resolveStorage(input.deps?.storage)
  const fromTarget = await resolveScopedPath({
    ...input,
    path: input.fromPath,
    database,
    storage,
    resolveVault: input.deps?.resolveVault,
  })
  const syncVaultMutation = buildSyncVaultMutation(database, storage, input.deps)
  const toRelativePath = normalizeSafeRelativePath(input.toPath, 'Destination path')
  const toStoragePath = joinPath(fromTarget.vault.rootPath, toRelativePath)

  await assertPathExists(storage, fromTarget.storagePath, 'Source path')
  await assertPathMissing(storage, toStoragePath, 'Destination path')
  await storage.movePath(fromTarget.storagePath, toStoragePath)

  const syncResult = await syncVaultMutation(fromTarget.vault)

  return {
    vaultId: fromTarget.vault.id,
    scope: fromTarget.vault.scopeType,
    path: toRelativePath,
    fromPath: fromTarget.relativePath,
    toPath: toRelativePath,
    syncResult,
  } satisfies MemoryStructureMoveResult
}

export async function renameScopedMemoryPath(
  input: MemoryStructureTargetInput & {
    path: string
    newName: string
    deps?: MemoryStructureDeps
  }
) {
  const currentPath = normalizeSafeRelativePath(input.path, 'Path')
  const normalizedName = normalizePath(input.newName)

  if (!normalizedName || normalizedName.includes('/')) {
    throw new Error('New name must be a single path segment.')
  }

  const targetDirectory = dirname(currentPath)
  const nextPath = joinPath(targetDirectory, normalizedName)

  return moveScopedMemoryPath({
    ...input,
    fromPath: currentPath,
    toPath: nextPath,
  })
}

export async function deleteScopedMemoryPath(
  input: MemoryStructureTargetInput & {
    path: string
    deps?: MemoryStructureDeps
  }
) {
  const database = input.deps?.database ?? db
  const storage = await resolveStorage(input.deps?.storage)
  const target = await resolveScopedPath({
    ...input,
    database,
    storage,
    resolveVault: input.deps?.resolveVault,
  })
  const syncVaultMutation = buildSyncVaultMutation(database, storage, input.deps)

  await assertPathExists(storage, target.storagePath, 'Path')
  await storage.deletePath(target.storagePath)

  const syncResult = await syncVaultMutation(target.vault)

  return {
    vaultId: target.vault.id,
    scope: target.vault.scopeType,
    path: target.relativePath,
    syncResult,
  } satisfies MemoryStructureMutationResult
}

export async function splitScopedMemoryFile(
  input: MemoryStructureTargetInput & {
    sourcePath: string
    targets: MemoryStructureSplitTarget[]
    deps?: MemoryStructureDeps
  }
) {
  if (input.targets.length < 2) {
    throw new Error('File split operations require at least two target files.')
  }

  const database = input.deps?.database ?? db
  const storage = await resolveStorage(input.deps?.storage)
  const source = await resolveScopedPath({
    ...input,
    path: input.sourcePath,
    database,
    storage,
    resolveVault: input.deps?.resolveVault,
  })
  const syncVaultMutation = buildSyncVaultMutation(database, storage, input.deps)

  const sourceStat = await assertPathExists(storage, source.storagePath, 'Source file')
  if (sourceStat.type !== 'file') {
    throw new Error(`Source file must be a file: ${source.relativePath}`)
  }

  const normalizedTargets = input.targets.map((target) => ({
    ...target,
    path: normalizeSafeRelativePath(target.path, 'Split target path'),
  }))
  const uniqueTargetPaths = new Set(normalizedTargets.map((target) => target.path))

  if (uniqueTargetPaths.size !== normalizedTargets.length) {
    throw new Error('Split target paths must be unique.')
  }

  if (uniqueTargetPaths.has(source.relativePath)) {
    throw new Error('Split target paths must not reuse the source path.')
  }

  for (const target of normalizedTargets) {
    await assertPathMissing(
      storage,
      joinPath(source.vault.rootPath, target.path),
      'Split target path'
    )
  }

  for (const target of normalizedTargets) {
    await storage.writeFile({
      path: joinPath(source.vault.rootPath, target.path),
      body: target.content,
      contentType: target.contentType ?? DEFAULT_MEMORY_MARKDOWN_CONTENT_TYPE,
    })
  }

  await storage.deletePath(source.storagePath)
  const syncResult = await syncVaultMutation(source.vault)

  return {
    vaultId: source.vault.id,
    scope: source.vault.scopeType,
    sourcePath: source.relativePath,
    createdPaths: normalizedTargets.map((target) => target.path),
    syncResult,
  } satisfies MemoryStructureSplitResult
}

export async function mergeScopedMemoryFiles(
  input: MemoryStructureTargetInput & {
    sourcePaths: string[]
    targetPath: string
    content: string
    contentType?: string
    deps?: MemoryStructureDeps
  }
) {
  if (input.sourcePaths.length < 2) {
    throw new Error('File merge operations require at least two source files.')
  }

  const database = input.deps?.database ?? db
  const storage = await resolveStorage(input.deps?.storage)
  const firstSource = await resolveScopedPath({
    ...input,
    path: input.sourcePaths[0]!,
    database,
    storage,
    resolveVault: input.deps?.resolveVault,
  })
  const syncVaultMutation = buildSyncVaultMutation(database, storage, input.deps)
  const normalizedSourcePaths = input.sourcePaths.map((path) =>
    normalizeSafeRelativePath(path, 'Merge source path')
  )
  const uniqueSourcePaths = new Set(normalizedSourcePaths)

  if (uniqueSourcePaths.size !== normalizedSourcePaths.length) {
    throw new Error('Merge source paths must be unique.')
  }

  for (const sourcePath of normalizedSourcePaths) {
    const stat = await assertPathExists(
      storage,
      joinPath(firstSource.vault.rootPath, sourcePath),
      'Merge source file'
    )
    if (stat.type !== 'file') {
      throw new Error(`Merge source must be a file: ${sourcePath}`)
    }
  }

  const targetPath = normalizeSafeRelativePath(input.targetPath, 'Merge target path')
  const targetStoragePath = joinPath(firstSource.vault.rootPath, targetPath)
  const targetAlreadyASource = uniqueSourcePaths.has(targetPath)
  const targetStat = await storage.statPath(targetStoragePath)

  if (targetStat && !targetAlreadyASource) {
    throw new Error(
      `Merge target path already exists and is not one of the merge sources: ${targetPath}`
    )
  }

  await storage.writeFile({
    path: targetStoragePath,
    body: input.content,
    contentType: input.contentType ?? DEFAULT_MEMORY_MARKDOWN_CONTENT_TYPE,
  })

  for (const sourcePath of normalizedSourcePaths) {
    if (sourcePath === targetPath) continue
    await storage.deletePath(joinPath(firstSource.vault.rootPath, sourcePath))
  }

  const syncResult = await syncVaultMutation(firstSource.vault)

  return {
    vaultId: firstSource.vault.id,
    scope: firstSource.vault.scopeType,
    sourcePaths: normalizedSourcePaths,
    targetPath,
    syncResult,
  } satisfies MemoryStructureMergeResult
}
