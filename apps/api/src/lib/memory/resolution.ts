import {
  and,
  db,
  desc,
  eq,
  isNull,
  memoryPaths,
  memoryVaults,
  sql,
  type MemoryPath,
  type MemoryVault,
} from '@kodi/db'
import {
  ensureMemberMemoryVault,
  ensureOrgMemoryVault,
  type MemberVaultIdentity,
} from './bootstrap'
import type { MemoryUpdateEvaluation, MemoryUpdateKind } from './evaluation'
import type { NormalizedMemoryUpdateEvent } from './events'
import {
  parseMemoryDirectoryIndex,
  parseMemoryManifest,
  type ParsedMemoryDirectoryIndex,
  type ParsedMemoryManifest,
} from './parse'
import type { MemoryStorage } from './storage'

type MemoryScope = 'org' | 'member'

export type ResolvedMemoryVault = Pick<
  MemoryVault,
  'id' | 'orgId' | 'scopeType' | 'orgMemberId' | 'rootPath' | 'manifestPath'
>

export type MemoryResolutionPath = Pick<
  MemoryPath,
  'path' | 'pathType' | 'parentPath' | 'title' | 'isManifest' | 'isIndex' | 'lastUpdatedAt'
>

export type MemoryResolutionSearchResult = MemoryResolutionPath & {
  rank: number
}

export type MemoryScopeUpdatePlan = {
  scope: MemoryScope
  vaultId: string
  rootPath: string
  manifestPath: string
  directoryPath: string
  indexPath: string | null
  targetPath: string
  action:
    | 'update_existing'
    | 'create_new'
    | 'delete_obsolete'
    | 'trigger_structural_maintenance'
  requiredReads: string[]
  candidatePaths: string[]
  searchQuery: string
  requiresIndexRepair: boolean
  requiresManifestRepair: boolean
  rationale: string[]
}

export type MemoryUpdatePlan = {
  scopes: MemoryScopeUpdatePlan[]
  requiredReads: string[]
}

export type MemoryResolutionAccess = {
  resolveVault(input: {
    orgId: string
    scope: MemoryScope
    actorUserId?: string | null
    actorOrgMemberId?: string | null
  }): Promise<ResolvedMemoryVault>
  listPaths(input: {
    vaultId: string
    parentPath?: string | null
  }): Promise<MemoryResolutionPath[]>
  getPath(input: {
    vaultId: string
    path: string
  }): Promise<MemoryResolutionPath | null>
  searchPaths(input: {
    vaultId: string
    query: string
    limit: number
  }): Promise<MemoryResolutionSearchResult[]>
  readFile(input: {
    vault: ResolvedMemoryVault
    path: string
  }): Promise<string>
}

export type MemoryResolutionDeps = {
  access?: MemoryResolutionAccess
}

async function resolveStorage(storage?: MemoryStorage) {
  if (storage) return storage
  return (await import('./storage')).createMemoryStorage()
}

function normalizePath(path?: string | null) {
  if (!path) return ''
  return path
    .trim()
    .replace(/^\/+/, '')
    .replace(/\/+$/, '')
}

function joinPath(...parts: Array<string | undefined | null>) {
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
  if (!normalized) return ''
  const segments = normalized.split('/')
  if (segments.length <= 1) return ''
  return segments.slice(0, -1).join('/')
}

function titleCase(value: string) {
  return value
    .split(/\s+/)
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(' ')
}

function slugToWords(value: string) {
  return value.replace(/[-_]+/g, ' ').trim()
}

function normalizeTitleToken(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

function extractTextSources(event: NormalizedMemoryUpdateEvent) {
  const metadata = event.metadata ?? {}
  return [
    stringValue(metadata.userMessage),
    stringValue(metadata.text),
    stringValue(metadata.meetingTitle),
    stringValue(metadata.assistantMessage),
    event.summary,
  ].filter(Boolean)
}

function stringValue(value: unknown) {
  return typeof value === 'string' ? value.trim() : ''
}

function buildSearchQuery(
  event: NormalizedMemoryUpdateEvent,
  evaluation: MemoryUpdateEvaluation
) {
  const text = extractTextSources(event)
    .map((value) => value.replace(/\s+/g, ' ').trim())
    .filter(Boolean)
    .join(' ')

  const tags = evaluation.signalTags
    .slice(0, 4)
    .map((tag) => tag.replace(/_/g, ' '))
    .join(' ')

  return `${text} ${tags}`.replace(/\s+/g, ' ').trim().slice(0, 220)
}

function defaultDirectoryByKind(scope: MemoryScope, memoryKind: MemoryUpdateKind) {
  if (scope === 'org') {
    switch (memoryKind) {
      case 'project':
        return 'Projects'
      case 'customer':
      case 'relationship':
        return 'Customers'
      case 'process':
        return 'Processes'
      default:
        return 'Current State'
    }
  }

  switch (memoryKind) {
    case 'preference':
      return 'Preferences'
    case 'responsibility':
      return 'Responsibilities'
    case 'relationship':
      return 'Relationships'
    default:
      return 'Current Work'
  }
}

function scoreDirectoryCandidate(input: {
  scope: MemoryScope
  memoryKind: MemoryUpdateKind
  directoryPath: string
  directoryTitle: string
  description: string
  event: NormalizedMemoryUpdateEvent
  evaluation: MemoryUpdateEvaluation
}) {
  let score = 0
  const defaultDirectory = defaultDirectoryByKind(input.scope, input.memoryKind)
  if (input.directoryPath === defaultDirectory) {
    score += 20
  }

  const haystack = normalizeTitleToken(
    `${input.directoryTitle} ${input.description} ${input.directoryPath}`
  )
  const terms = new Set(
    [
      input.memoryKind,
      ...input.evaluation.signalTags,
      ...extractTextSources(input.event)
        .flatMap((value) => normalizeTitleToken(value).split(/\s+/))
        .filter((value) => value.length >= 4),
    ]
      .flatMap((value) => normalizeTitleToken(value).split(/\s+/))
      .filter((value) => value.length >= 4)
  )

  for (const term of terms) {
    if (haystack.includes(term)) {
      score += 1
    }
  }

  return score
}

function buildDirectoryChoices(input: {
  manifest: ParsedMemoryManifest
  rootEntries: MemoryResolutionPath[]
  scope: MemoryScope
  event: NormalizedMemoryUpdateEvent
  evaluation: MemoryUpdateEvaluation
}) {
  const fromManifest = input.manifest.directoryGuide.map((reference) => ({
    path: normalizePath(reference.path),
    title: basename(reference.path) || reference.path.replace(/\/$/, ''),
    description: reference.description ?? '',
  }))

  const seen = new Set(fromManifest.map((item) => item.path))
  const fromPaths = input.rootEntries
    .filter((entry) => entry.pathType === 'directory')
    .map((entry) => ({
      path: entry.path,
      title: entry.title || basename(entry.path),
      description: '',
    }))
    .filter((entry) => {
      if (seen.has(entry.path)) return false
      seen.add(entry.path)
      return true
    })

  return [...fromManifest, ...fromPaths]
    .map((choice) => ({
      ...choice,
      score: scoreDirectoryCandidate({
        scope: input.scope,
        memoryKind: input.evaluation.memoryKind,
        directoryPath: choice.path,
        directoryTitle: choice.title,
        description: choice.description,
        event: input.event,
        evaluation: input.evaluation,
      }),
    }))
    .sort((left, right) => {
      if (left.score !== right.score) {
        return right.score - left.score
      }

      return left.path.localeCompare(right.path)
    })
}

function buildPreferredIndexPath(manifest: ParsedMemoryManifest, directoryPath: string) {
  const normalizedDirectoryPath = normalizePath(directoryPath)
  const explicit = manifest.importantEntryPoints.find((reference) => {
    const path = normalizePath(reference.path)
    return reference.pathType === 'file' && dirname(path) === normalizedDirectoryPath
  })

  return explicit ? normalizePath(explicit.path) : null
}

function scoreExistingPath(input: {
  candidate: MemoryResolutionSearchResult
  preferredDirectoryPath: string
  index: ParsedMemoryDirectoryIndex | null
  evaluation: MemoryUpdateEvaluation
  event: NormalizedMemoryUpdateEvent
}) {
  let score = input.candidate.rank * 10

  if (input.candidate.parentPath === input.preferredDirectoryPath) {
    score += 12
  }

  if (
    input.index?.filePurposes.some(
      (reference) => normalizePath(reference.path) === input.candidate.path
    )
  ) {
    score += 8
  }

  const haystack = normalizeTitleToken(
    `${input.candidate.path} ${input.candidate.title ?? ''}`
  )
  const terms = new Set(
    [
      input.evaluation.memoryKind,
      ...input.evaluation.signalTags,
      ...extractTextSources(input.event)
        .flatMap((value) => normalizeTitleToken(value).split(/\s+/))
        .filter((value) => value.length >= 4),
    ]
      .flatMap((value) => normalizeTitleToken(value).split(/\s+/))
      .filter((value) => value.length >= 4)
  )

  for (const term of terms) {
    if (haystack.includes(term)) {
      score += 1
    }
  }

  return score
}

function buildFallbackTitle(memoryKind: MemoryUpdateKind) {
  switch (memoryKind) {
    case 'preference':
      return 'Preference'
    case 'responsibility':
      return 'Responsibility'
    case 'current_state':
      return 'Current State'
    case 'relationship':
      return 'Relationship Notes'
    case 'process':
      return 'Process Notes'
    case 'project':
      return 'Project Notes'
    case 'customer':
      return 'Customer Notes'
    case 'meeting':
      return 'Meeting Notes'
    case 'decision':
      return 'Decision Notes'
    case 'reference':
      return 'Reference Notes'
    default:
      return 'Memory Notes'
  }
}

function buildSuggestedFileTitle(
  event: NormalizedMemoryUpdateEvent,
  evaluation: MemoryUpdateEvaluation
) {
  for (const source of extractTextSources(event)) {
    const cleaned = source
      .replace(/[`"'“”]/g, ' ')
      .replace(/[.!?].*$/, '')
      .replace(/\b(remember|that|i|we|kodi|please|prefer|preferred|decision|decided|assistant|thread|conversation|shared|private|activity|changed|received|turn)\b/gi, ' ')
      .replace(/\s+/g, ' ')
      .trim()

    const words = cleaned
      .split(/\s+/)
      .filter((word) => /^[a-z0-9][a-z0-9'-]*$/i.test(word))
      .filter((word) => word.length >= 3)
      .slice(0, 6)

    if (words.length >= 2) {
      return titleCase(words.join(' '))
    }
  }

  return buildFallbackTitle(evaluation.memoryKind)
}

function sanitizeFileName(title: string) {
  return title
    .replace(/[\\/:*?"<>|]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

async function buildUniqueTargetPath(input: {
  access: MemoryResolutionAccess
  vaultId: string
  directoryPath: string
  title: string
}) {
  const baseName = sanitizeFileName(input.title) || 'Memory Notes'
  let attempt = 1

  while (true) {
    const suffix = attempt === 1 ? '' : ` ${attempt}`
    const path = joinPath(input.directoryPath, `${baseName}${suffix}.md`)
    const existing = await input.access.getPath({
      vaultId: input.vaultId,
      path,
    })

    if (!existing) {
      return path
    }

    attempt += 1
  }
}

function uniqueStrings(values: Array<string | null | undefined>) {
  return [...new Set(values.filter((value): value is string => Boolean(value)))]
}

async function resolveScopeUpdatePlan(input: {
  access: MemoryResolutionAccess
  scope: MemoryScope
  event: NormalizedMemoryUpdateEvent
  evaluation: MemoryUpdateEvaluation
}) {
  const vault = await input.access.resolveVault({
    orgId: input.event.orgId,
    scope: input.scope,
    actorUserId: input.event.actor?.userId,
    actorOrgMemberId: input.event.actor?.orgMemberId,
  })

  const manifestPath = 'MEMORY.md'
  const manifest = parseMemoryManifest(
    await input.access.readFile({ vault, path: manifestPath })
  )
  const rootEntries = await input.access.listPaths({
    vaultId: vault.id,
    parentPath: null,
  })
  const directoryChoices = buildDirectoryChoices({
    manifest,
    rootEntries,
    scope: input.scope,
    event: input.event,
    evaluation: input.evaluation,
  })

  const preferredDirectory =
    directoryChoices[0]?.path ||
    defaultDirectoryByKind(input.scope, input.evaluation.memoryKind)

  const preferredDirectoryEntries = await input.access.listPaths({
    vaultId: vault.id,
    parentPath: preferredDirectory,
  })

  const explicitIndexPath =
    buildPreferredIndexPath(manifest, preferredDirectory) ??
    preferredDirectoryEntries.find((entry) => entry.isIndex)?.path ??
    null

  const index =
    explicitIndexPath
      ? parseMemoryDirectoryIndex(
          await input.access.readFile({
            vault,
            path: explicitIndexPath,
          }),
          { path: explicitIndexPath }
        )
      : null

  const searchQuery = buildSearchQuery(input.event, input.evaluation)
  const searchResults =
    searchQuery.length > 0
      ? await input.access.searchPaths({
          vaultId: vault.id,
          query: searchQuery,
          limit: 6,
        })
      : []

  const bestSearchMatch = searchResults
    .filter((result) => !result.isManifest && !result.isIndex)
    .map((candidate) => ({
      path: candidate.path,
      score: scoreExistingPath({
        candidate,
        preferredDirectoryPath: preferredDirectory,
        index,
        evaluation: input.evaluation,
        event: input.event,
      }),
    }))
    .sort((left, right) => right.score - left.score)[0]

  const directoryFiles = preferredDirectoryEntries.filter(
    (entry) => entry.pathType === 'file' && !entry.isIndex && !entry.isManifest
  )

  const fallbackExistingPath =
    directoryFiles.length === 1 ? directoryFiles[0]?.path ?? null : null

  const existingPath =
    bestSearchMatch && bestSearchMatch.score > 0
      ? bestSearchMatch.path
      : fallbackExistingPath

  const normalizedAction =
    input.evaluation.action === 'delete_obsolete' ||
    input.evaluation.action === 'trigger_structural_maintenance'
      ? input.evaluation.action
      : existingPath
        ? 'update_existing'
        : 'create_new'

  const finalDirectoryPath = existingPath
    ? dirname(existingPath) || preferredDirectory
    : preferredDirectory

  const finalDirectoryEntries =
    finalDirectoryPath === preferredDirectory
      ? preferredDirectoryEntries
      : await input.access.listPaths({
          vaultId: vault.id,
          parentPath: finalDirectoryPath,
        })

  const finalIndexPath =
    finalDirectoryEntries.find((entry) => entry.isIndex)?.path ??
    (finalDirectoryPath === preferredDirectory ? explicitIndexPath : null)

  const targetPath =
    existingPath ??
    (await buildUniqueTargetPath({
      access: input.access,
      vaultId: vault.id,
      directoryPath: finalDirectoryPath,
      title: buildSuggestedFileTitle(input.event, input.evaluation),
    }))

  const scopeRationale = [
    `Resolved ${input.scope} memory against vault ${vault.id}.`,
    existingPath
      ? `Targeted search matched existing file \`${existingPath}\`.`
      : `No existing file clearly owned the topic, so Kodi should create a new file in \`${finalDirectoryPath}\`.`,
    finalIndexPath
      ? `Local navigation will use directory index \`${finalIndexPath}\`.`
      : 'No directory index was available for the chosen directory.',
  ]

  return {
    scope: input.scope,
    vaultId: vault.id,
    rootPath: vault.rootPath,
    manifestPath: vault.manifestPath,
    directoryPath: finalDirectoryPath,
    indexPath: finalIndexPath,
    targetPath,
    action: normalizedAction,
    requiredReads: uniqueStrings([
      manifestPath,
      finalIndexPath,
      existingPath ?? null,
    ]),
    candidatePaths: uniqueStrings([
      ...searchResults.map((result) => result.path),
      ...directoryFiles.map((entry) => entry.path),
    ]),
    searchQuery,
    requiresIndexRepair:
      normalizedAction !== 'update_existing' ||
      (Boolean(finalIndexPath) &&
        !index?.filePurposes.some(
          (reference) => normalizePath(reference.path) === targetPath
        )),
    requiresManifestRepair:
      normalizedAction === 'trigger_structural_maintenance',
    rationale: uniqueStrings(scopeRationale),
  } satisfies MemoryScopeUpdatePlan
}

export async function resolveMemoryUpdatePlan(
  event: NormalizedMemoryUpdateEvent,
  evaluation: MemoryUpdateEvaluation,
  deps: MemoryResolutionDeps = {}
) {
  if (!evaluation.shouldWrite || evaluation.scope === 'none') {
    return {
      scopes: [],
      requiredReads: [],
    } satisfies MemoryUpdatePlan
  }

  const access = deps.access ?? (await createMemoryResolutionAccess())
  const scopes =
    evaluation.scope === 'both'
      ? (['org', 'member'] as const)
      : [evaluation.scope]

  const plans = await Promise.all(
    scopes.map((scope) =>
      resolveScopeUpdatePlan({
        access,
        scope,
        event,
        evaluation,
      })
    )
  )

  return {
    scopes: plans,
    requiredReads: uniqueStrings(
      plans.flatMap((plan) =>
        plan.requiredReads.map((path) => `${plan.scope}:${path}`)
      )
    ),
  } satisfies MemoryUpdatePlan
}

export async function createMemoryResolutionAccess(input?: {
  database?: typeof db
  storage?: MemoryStorage
}): Promise<MemoryResolutionAccess> {
  const database = input?.database ?? db
  const storage = await resolveStorage(input?.storage)

  async function resolveOrgIdentity(orgId: string) {
    const org = await database.query.organizations.findFirst({
      columns: {
        id: true,
        name: true,
        slug: true,
      },
      where: (fields, { eq }) => eq(fields.id, orgId),
    })

    if (!org) {
      throw new Error(`Organization ${orgId} not found for memory resolution.`)
    }

    return org
  }

  async function resolveMemberIdentity(input: {
    orgId: string
    actorUserId?: string | null
    actorOrgMemberId?: string | null
  }) {
    let membership: MemberVaultIdentity['orgMember'] | null = null

    if (input.actorOrgMemberId) {
      const actorOrgMemberId = input.actorOrgMemberId
      membership = await database.query.orgMembers.findFirst({
        columns: {
          id: true,
          orgId: true,
          userId: true,
          role: true,
        },
        where: (fields, { and, eq }) =>
          and(eq(fields.orgId, input.orgId), eq(fields.id, actorOrgMemberId)),
      }) ?? null
    } else if (input.actorUserId) {
      const actorUserId = input.actorUserId
      membership = await database.query.orgMembers.findFirst({
        columns: {
          id: true,
          orgId: true,
          userId: true,
          role: true,
        },
        where: (fields, { and, eq }) =>
          and(eq(fields.orgId, input.orgId), eq(fields.userId, actorUserId)),
      }) ?? null
    }

    if (!membership) {
      throw new Error(
        `Org member could not be resolved for member-scoped memory in org ${input.orgId}.`
      )
    }

    const org = await resolveOrgIdentity(input.orgId)

    return {
      org,
      orgMember: membership,
    } satisfies MemberVaultIdentity
  }

  return {
    async resolveVault(input) {
      if (input.scope === 'org') {
        const org = await resolveOrgIdentity(input.orgId)
        const vault = await ensureOrgMemoryVault(database, org, storage)
        return {
          id: vault.id,
          orgId: vault.orgId,
          scopeType: vault.scopeType,
          orgMemberId: vault.orgMemberId,
          rootPath: vault.rootPath,
          manifestPath: vault.manifestPath,
        } satisfies ResolvedMemoryVault
      }

      const identity = await resolveMemberIdentity(input)
      const vault = await ensureMemberMemoryVault(database, identity, storage)
      return {
        id: vault.id,
        orgId: vault.orgId,
        scopeType: vault.scopeType,
        orgMemberId: vault.orgMemberId,
        rootPath: vault.rootPath,
        manifestPath: vault.manifestPath,
      } satisfies ResolvedMemoryVault
    },

    async listPaths(input) {
      return database.query.memoryPaths.findMany({
        columns: {
          path: true,
          pathType: true,
          parentPath: true,
          title: true,
          isManifest: true,
          isIndex: true,
          lastUpdatedAt: true,
        },
        where:
          input.parentPath === null
            ? and(
                eq(memoryPaths.vaultId, input.vaultId),
                isNull(memoryPaths.parentPath)
              )
            : input.parentPath
              ? and(
                  eq(memoryPaths.vaultId, input.vaultId),
                  eq(memoryPaths.parentPath, normalizePath(input.parentPath))
                )
              : eq(memoryPaths.vaultId, input.vaultId),
      })
    },

    async getPath(input) {
      return (
        (await database.query.memoryPaths.findFirst({
          columns: {
            path: true,
            pathType: true,
            parentPath: true,
            title: true,
            isManifest: true,
            isIndex: true,
            lastUpdatedAt: true,
          },
          where: and(
            eq(memoryPaths.vaultId, input.vaultId),
            eq(memoryPaths.path, normalizePath(input.path))
          ),
        })) ?? null
      )
    },

    async searchPaths(input) {
      const normalizedQuery = input.query.trim()
      if (!normalizedQuery) return []

      const tsQuery = sql`websearch_to_tsquery('english', ${normalizedQuery})`
      return database
        .select({
          path: memoryPaths.path,
          pathType: memoryPaths.pathType,
          parentPath: memoryPaths.parentPath,
          title: memoryPaths.title,
          isManifest: memoryPaths.isManifest,
          isIndex: memoryPaths.isIndex,
          lastUpdatedAt: memoryPaths.lastUpdatedAt,
          rank: sql<number>`ts_rank_cd(${memoryPaths.contentSearchVector}, ${tsQuery})`,
        })
        .from(memoryPaths)
        .where(
          and(
            eq(memoryPaths.vaultId, input.vaultId),
            eq(memoryPaths.pathType, 'file'),
            sql`${memoryPaths.contentSearchVector} @@ ${tsQuery}`
          )
        )
        .orderBy(
          desc(sql<number>`ts_rank_cd(${memoryPaths.contentSearchVector}, ${tsQuery})`),
          desc(memoryPaths.lastUpdatedAt)
        )
        .limit(input.limit)
    },

    async readFile(input) {
      return (
        await storage.readFile(joinPath(input.vault.rootPath, input.path))
      ).toString('utf8')
    },
  }
}
