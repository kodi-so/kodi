import {
  and,
  db,
  desc,
  eq,
  isNull,
  memoryPaths,
  sql,
  type MemoryPath,
  type MemoryVault,
} from '@kodi/db'
import { z } from 'zod'
import {
  openClawChatCompletion,
  type OpenClawConversationVisibility,
} from '../openclaw/client'
import {
  ensureMemberMemoryVault,
  ensureOrgMemoryVault,
  type MemberVaultIdentity,
} from './bootstrap'
import type { MemoryUpdateEvaluation } from './evaluation'
import type { NormalizedMemoryUpdateEvent } from './events'
import {
  parseMemoryDirectoryIndex,
  parseMemoryManifest,
  type ParsedMemoryDirectoryIndex,
  type ParsedMemoryManifest,
} from './parse'
import type { MemoryStorage } from './storage'

type MemoryScope = 'org' | 'member'
type OpenClawChatCompletionFn = typeof openClawChatCompletion

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
  completeResolutionChat?: OpenClawChatCompletionFn
}

type MemoryDirectoryContext = {
  path: string
  title: string
  description: string | null
  indexPath: string | null
  parsedIndex: ParsedMemoryDirectoryIndex | null
  knownChildPaths: string[]
}

type MemoryScopeResolutionContext = {
  scope: MemoryScope
  vault: ResolvedMemoryVault
  manifest: ParsedMemoryManifest
  manifestPath: string
  directories: MemoryDirectoryContext[]
  searchQuery: string
  searchCandidates: MemoryResolutionSearchResult[]
}

const MEMORY_RESOLUTION_PROTOCOL_VERSION = 'kodi.memory.resolver.v1'
const MEMORY_RESOLUTION_TIMEOUT_MS = 12_000

const memoryResolutionResponseSchema = z
  .object({
    action: z.enum([
      'update_existing',
      'create_new',
      'delete_obsolete',
      'trigger_structural_maintenance',
    ]),
    targetDirectoryPath: z.string().trim().default(''),
    targetFilePath: z.string().trim().min(1),
    requiredReads: z.array(z.string().trim().min(1)).default([]),
    requiresIndexRepair: z.boolean().default(false),
    requiresManifestRepair: z.boolean().default(false),
    confidence: z.enum(['low', 'medium', 'high']).default('medium'),
    rationale: z.array(z.string().trim().min(1)).default([]),
  })
  .strict()

type MemoryResolutionModelResponse = z.infer<
  typeof memoryResolutionResponseSchema
>

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

function dirname(path: string) {
  const normalized = normalizePath(path)
  if (!normalized) return ''
  const segments = normalized.split('/')
  if (segments.length <= 1) return ''
  return segments.slice(0, -1).join('/')
}

function basename(path: string) {
  const normalized = normalizePath(path)
  if (!normalized) return ''
  const segments = normalized.split('/')
  return segments[segments.length - 1] ?? ''
}

function stringValue(value: unknown) {
  return typeof value === 'string' ? value.trim() : ''
}

function normalizeToken(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function extractEventTextSources(event: NormalizedMemoryUpdateEvent) {
  const metadata = event.metadata ?? {}

  return [
    event.summary,
    stringValue(metadata.userMessage),
    stringValue(metadata.assistantMessage),
    stringValue(metadata.text),
    stringValue(metadata.meetingTitle),
  ].filter(Boolean)
}

function buildSearchQuery(
  event: NormalizedMemoryUpdateEvent,
  evaluation: MemoryUpdateEvaluation
) {
  const semanticHints = [
    evaluation.topicLabel,
    evaluation.topicSummary,
    ...evaluation.topicKeywords,
    ...evaluation.signalTags.map((tag) => tag.replace(/_/g, ' ')),
  ].filter(Boolean)

  return [...semanticHints, ...extractEventTextSources(event)]
    .map((value) => normalizeToken(String(value)))
    .filter(Boolean)
    .join(' ')
    .slice(0, 220)
}

function uniqueStrings(values: Array<string | null | undefined>) {
  return [...new Set(values.filter((value): value is string => Boolean(value)))]
}

function parseResolutionResponse(content: string) {
  const normalized = content
    .trim()
    .replace(/^```json\s*/i, '')
    .replace(/^```\s*/i, '')
    .replace(/\s*```$/i, '')

  try {
    return memoryResolutionResponseSchema.parse(JSON.parse(normalized))
  } catch {
    return null
  }
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

function normalizeSafeDirectoryPath(path?: string | null) {
  if (!path) return ''

  const normalized = normalizePath(path)
  if (!normalized) return ''

  if (
    normalized.includes('..') ||
    normalized.split('/').some((segment) => segment === '.' || segment === '..')
  ) {
    throw new Error('Target directory path must stay inside the vault.')
  }

  return normalized
}

function requireMarkdownPath(path: string) {
  const normalized = normalizeSafeRelativePath(path, 'Target file path')
  if (!/\.md$/i.test(normalized)) {
    throw new Error('Target file path must point to a markdown file.')
  }

  return normalized
}

function buildResolutionRouting(input: {
  scope: MemoryScope
  event: NormalizedMemoryUpdateEvent
}) {
  if (input.scope === 'member') {
    const actorUserId = input.event.actor?.userId?.trim()
    if (!actorUserId) {
      throw new Error(
        'Member-scoped path resolution requires an actor user id.'
      )
    }

    return {
      visibility: 'private' as OpenClawConversationVisibility,
      actorUserId,
    }
  }

  return {
    visibility: 'shared' as OpenClawConversationVisibility,
    actorUserId: undefined,
  }
}

async function buildDirectoryContexts(input: {
  access: MemoryResolutionAccess
  vault: ResolvedMemoryVault
  manifest: ParsedMemoryManifest
}) {
  const rootEntries = await input.access.listPaths({
    vaultId: input.vault.id,
    parentPath: null,
  })

  const manifestGuide = new Map(
    input.manifest.directoryGuide.map((reference) => [
      normalizePath(reference.path),
      reference,
    ])
  )

  const directoryPaths = uniqueStrings([
    ...input.manifest.directoryGuide
      .filter((reference) => reference.pathType === 'directory')
      .map((reference) => normalizePath(reference.path)),
    ...rootEntries
      .filter((entry) => entry.pathType === 'directory')
      .map((entry) => entry.path),
  ])

  return Promise.all(
    directoryPaths.map(async (directoryPath) => {
      const children = await input.access.listPaths({
        vaultId: input.vault.id,
        parentPath: directoryPath,
      })
      const indexPath = children.find((entry) => entry.isIndex)?.path ?? null
      const parsedIndex =
        indexPath
          ? parseMemoryDirectoryIndex(
              await input.access.readFile({
                vault: input.vault,
                path: indexPath,
              }),
              { path: indexPath }
            )
          : null

      return {
        path: directoryPath,
        title:
          manifestGuide.get(directoryPath)?.description
            ? basename(directoryPath) || directoryPath
            : rootEntries.find((entry) => entry.path === directoryPath)?.title ||
              basename(directoryPath) ||
              directoryPath,
        description: manifestGuide.get(directoryPath)?.description ?? null,
        indexPath,
        parsedIndex,
        knownChildPaths: children.map((entry) => entry.path),
      } satisfies MemoryDirectoryContext
    })
  )
}

async function buildScopeResolutionContext(input: {
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
    await input.access.readFile({
      vault,
      path: manifestPath,
    })
  )
  const directories = await buildDirectoryContexts({
    access: input.access,
    vault,
    manifest,
  })
  const searchQuery = buildSearchQuery(input.event, input.evaluation)
  const searchCandidates =
    searchQuery.length > 0
      ? await input.access.searchPaths({
          vaultId: vault.id,
          query: searchQuery,
          limit: 8,
        })
      : []

  return {
    scope: input.scope,
    vault,
    manifest,
    manifestPath,
    directories,
    searchQuery,
    searchCandidates,
  } satisfies MemoryScopeResolutionContext
}

function buildResolutionMessages(input: {
  context: MemoryScopeResolutionContext
  event: NormalizedMemoryUpdateEvent
  evaluation: MemoryUpdateEvaluation
}) {
  return [
    {
      role: 'system' as const,
      content:
        'You choose where a durable Kodi memory update belongs inside one scoped vault. The memory-worthiness decision is already made. Use the manifest, directory indexes, targeted search candidates, and current known paths to decide whether to update an existing file, create a new file, delete obsolete memory, or trigger structural maintenance. Prefer updating an existing file when it clearly owns the topic. You may place a new file in an existing directory or propose a new directory when the current structure does not fit. Return JSON only and no prose using this exact shape: {"action":"update_existing|create_new|delete_obsolete|trigger_structural_maintenance","targetDirectoryPath":"relative directory path or empty string for root","targetFilePath":"relative markdown file path","requiredReads":["relative path"],"requiresIndexRepair":true,"requiresManifestRepair":false,"confidence":"low|medium|high","rationale":["short reason"]}. Keep all returned paths inside the vault and never use absolute paths.',
    },
    {
      role: 'user' as const,
      content: JSON.stringify({
        protocolVersion: MEMORY_RESOLUTION_PROTOCOL_VERSION,
        scope: input.context.scope,
        evaluation: {
          scope: input.evaluation.scope,
          action: input.evaluation.action,
          confidence: input.evaluation.confidence,
          topicLabel: input.evaluation.topicLabel,
          topicSummary: input.evaluation.topicSummary,
          topicKeywords: input.evaluation.topicKeywords,
          signalTags: input.evaluation.signalTags,
          rationale: input.evaluation.rationale,
        },
        event: {
          id: input.event.id,
          source: input.event.source,
          visibility: input.event.visibility,
          occurredAt: input.event.occurredAt.toISOString(),
          summary: input.event.summary,
          actor: {
            userId: input.event.actor?.userId ?? null,
            orgMemberId: input.event.actor?.orgMemberId ?? null,
            openclawAgentId: input.event.actor?.openclawAgentId ?? null,
          },
          textSources: extractEventTextSources(input.event),
          metadata: input.event.metadata ?? {},
          payload: input.event.payload,
        },
        vault: {
          manifestPath: input.context.manifestPath,
          importantEntryPoints: input.context.manifest.importantEntryPoints,
          directoryGuide: input.context.manifest.directoryGuide,
          structuralRules: input.context.manifest.structuralRules,
          updateRules: input.context.manifest.updateRules,
        },
        directories: input.context.directories.map((directory) => ({
          path: directory.path,
          title: directory.title,
          description: directory.description,
          indexPath: directory.indexPath,
          whatBelongsHere: directory.parsedIndex?.whatBelongsHere ?? null,
          filePurposes: directory.parsedIndex?.filePurposes ?? [],
          namingConventions: directory.parsedIndex?.namingConventions ?? [],
          knownChildPaths: directory.knownChildPaths,
        })),
        targetedSearch: {
          query: input.context.searchQuery,
          candidates: input.context.searchCandidates.map((candidate) => ({
            path: candidate.path,
            title: candidate.title,
            parentPath: candidate.parentPath,
            isIndex: candidate.isIndex,
            isManifest: candidate.isManifest,
            rank: candidate.rank,
          })),
        },
      }),
    },
  ]
}

async function applyResolutionGuardrails(input: {
  access: MemoryResolutionAccess
  context: MemoryScopeResolutionContext
  modelResponse: MemoryResolutionModelResponse
}) {
  const targetPath = requireMarkdownPath(input.modelResponse.targetFilePath)
  const normalizedDirectoryFromModel = normalizeSafeDirectoryPath(
    input.modelResponse.targetDirectoryPath
  )
  const directoryPath = dirname(targetPath) || normalizedDirectoryFromModel

  const directoryMetadata = directoryPath
    ? await input.access.getPath({
        vaultId: input.context.vault.id,
        path: directoryPath,
      })
    : null

  if (directoryMetadata && directoryMetadata.pathType !== 'directory') {
    throw new Error(`Target directory path ${directoryPath} is not a directory.`)
  }

  const existingTarget = await input.access.getPath({
    vaultId: input.context.vault.id,
    path: targetPath,
  })

  let action = input.modelResponse.action
  if (
    action === 'update_existing' ||
    action === 'delete_obsolete' ||
    action === 'trigger_structural_maintenance'
  ) {
    if (!existingTarget || existingTarget.pathType !== 'file') {
      throw new Error(
        `Resolution action ${action} requires an existing target file.`
      )
    }
  } else if (action === 'create_new' && existingTarget?.pathType === 'file') {
    action = 'update_existing'
  }

  const directoryContext = input.context.directories.find(
    (directory) => directory.path === directoryPath
  )

  const targetDirectoryEntries = directoryMetadata
    ? await input.access.listPaths({
        vaultId: input.context.vault.id,
        parentPath: directoryPath,
      })
    : []

  const indexPath =
    targetDirectoryEntries.find((entry) => entry.isIndex)?.path ??
    directoryContext?.indexPath ??
    null

  const parsedIndex =
    directoryContext?.parsedIndex ??
    (indexPath
      ? parseMemoryDirectoryIndex(
          await input.access.readFile({
            vault: input.context.vault,
            path: indexPath,
          }),
          { path: indexPath }
        )
      : null)

  const safeRequiredReads = uniqueStrings(
    input.modelResponse.requiredReads
      .map((path) => {
        try {
          return normalizeSafeRelativePath(path, 'Required read path')
        } catch {
          return null
        }
      })
      .map((path) =>
        path
          ? path
          : null
      )
  ).filter((path) =>
    path === targetPath ||
    path === input.context.manifestPath ||
    path === indexPath ||
    Boolean(
      path &&
        input.context.searchCandidates.some((candidate) => candidate.path === path)
    ) ||
    Boolean(
      path &&
        directoryContext?.knownChildPaths.includes(path)
    )
  )

  const isTopLevelDirectory = directoryPath.length > 0 && !directoryPath.includes('/')
  const topLevelDirectoryExists = input.context.directories.some(
    (directory) => directory.path === directoryPath
  )
  const targetListedInIndex = parsedIndex?.filePurposes.some(
    (reference) => normalizePath(reference.path) === targetPath
  ) ?? false

  return {
    scope: input.context.scope,
    vaultId: input.context.vault.id,
    rootPath: input.context.vault.rootPath,
    manifestPath: input.context.vault.manifestPath,
    directoryPath,
    indexPath,
    targetPath,
    action,
    requiredReads: uniqueStrings([
      input.context.manifestPath,
      indexPath,
      existingTarget?.path ?? null,
      ...safeRequiredReads,
    ]),
    candidatePaths: uniqueStrings([
      ...input.context.searchCandidates.map((candidate) => candidate.path),
      ...targetDirectoryEntries
        .filter((entry) => entry.pathType === 'file' && !entry.isIndex)
        .map((entry) => entry.path),
      targetPath,
    ]),
    searchQuery: input.context.searchQuery,
    requiresIndexRepair:
      input.modelResponse.requiresIndexRepair ||
      action !== 'update_existing' ||
      !directoryMetadata ||
      (Boolean(indexPath) && !targetListedInIndex),
    requiresManifestRepair:
      input.modelResponse.requiresManifestRepair ||
      action === 'trigger_structural_maintenance' ||
      (isTopLevelDirectory && !topLevelDirectoryExists),
    rationale: uniqueStrings([
      ...input.modelResponse.rationale,
      `Resolved ${input.context.scope} memory inside vault ${input.context.vault.id}.`,
    ]),
  } satisfies MemoryScopeUpdatePlan
}

async function resolveScopeUpdatePlan(input: {
  access: MemoryResolutionAccess
  scope: MemoryScope
  event: NormalizedMemoryUpdateEvent
  evaluation: MemoryUpdateEvaluation
  completeResolutionChat?: OpenClawChatCompletionFn
}) {
  const context = await buildScopeResolutionContext({
    access: input.access,
    scope: input.scope,
    event: input.event,
    evaluation: input.evaluation,
  })
  const routing = buildResolutionRouting({
    scope: input.scope,
    event: input.event,
  })
  const response = await (input.completeResolutionChat ?? openClawChatCompletion)(
    {
      orgId: input.event.orgId,
      actorUserId: routing.actorUserId,
      visibility: routing.visibility,
      sessionKey: `memory-resolve:${input.event.dedupeKey}:${input.scope}`,
      messageChannel: 'memory',
      messages: buildResolutionMessages({
        context,
        event: input.event,
        evaluation: input.evaluation,
      }),
      timeoutMs: MEMORY_RESOLUTION_TIMEOUT_MS,
      temperature: 0.1,
      maxTokens: 700,
    }
  )

  if (!response.ok) {
    throw new Error(
      `OpenClaw memory resolution was unavailable: ${response.error ?? response.reason}.`
    )
  }

  const parsed = parseResolutionResponse(response.content)
  if (!parsed) {
    throw new Error(
      'OpenClaw memory resolution did not return valid structured JSON.'
    )
  }

  return applyResolutionGuardrails({
    access: input.access,
    context,
    modelResponse: parsed,
  })
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
        completeResolutionChat: deps.completeResolutionChat,
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
      membership =
        (await database.query.orgMembers.findFirst({
          columns: {
            id: true,
            orgId: true,
            userId: true,
            role: true,
          },
          where: (fields, { and, eq }) =>
            and(eq(fields.orgId, input.orgId), eq(fields.id, actorOrgMemberId)),
        })) ?? null
    } else if (input.actorUserId) {
      const actorUserId = input.actorUserId
      membership =
        (await database.query.orgMembers.findFirst({
          columns: {
            id: true,
            orgId: true,
            userId: true,
            role: true,
          },
          where: (fields, { and, eq }) =>
            and(eq(fields.orgId, input.orgId), eq(fields.userId, actorUserId)),
        })) ?? null
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
          desc(
            sql<number>`ts_rank_cd(${memoryPaths.contentSearchVector}, ${tsQuery})`
          ),
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
