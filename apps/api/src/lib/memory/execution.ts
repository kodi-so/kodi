import { db } from '@kodi/db'
import { z } from 'zod'
import { openClawChatCompletion, type OpenClawConversationVisibility } from '../openclaw/client'
import type { MemoryUpdateEvaluation } from './evaluation'
import {
  DEFAULT_MEMORY_MARKDOWN_CONTENT_TYPE,
  syncMemoryVaultMetadata,
  type MemoryPathSyncResult,
} from './paths'
import type { MemoryScopeUpdatePlan, MemoryUpdatePlan } from './resolution'
import type { MemoryStorage } from './storage'

type OpenClawChatCompletionFn = typeof openClawChatCompletion
type MemoryExecutionEvent = {
  id: string
  orgId: string
  source: string
  visibility: 'private' | 'shared' | 'system'
  occurredAt: Date
  summary: string
  dedupeKey: string
  actor?: {
    userId?: string
    orgMemberId?: string
    openclawAgentId?: string
  }
  metadata?: Record<string, unknown>
  payload: unknown
}

export type MemoryExecutionWrite = {
  path: string
  purpose: 'target' | 'directory_index' | 'manifest'
  content: string
}

export type ExecutedMemoryScopeUpdate = {
  scope: MemoryScopeUpdatePlan['scope']
  vaultId: string
  action: Extract<MemoryScopeUpdatePlan['action'], 'update_existing' | 'create_new'>
  writtenPaths: string[]
  rationale: string[]
  syncResult: MemoryPathSyncResult
}

export type DeferredMemoryScopeUpdate = {
  scope: MemoryScopeUpdatePlan['scope']
  vaultId: string
  action: Extract<
    MemoryScopeUpdatePlan['action'],
    'delete_obsolete' | 'trigger_structural_maintenance'
  >
  reason: 'structural-action'
}

export type MemoryUpdateExecutionResult = {
  executedScopes: ExecutedMemoryScopeUpdate[]
  deferredScopes: DeferredMemoryScopeUpdate[]
}

export type MemoryExecutionDeps = {
  storage?: MemoryStorage
  completeExecutionChat?: OpenClawChatCompletionFn
  syncVaultMetadata?: (
    vault: Pick<MemoryScopeUpdatePlan, 'vaultId' | 'rootPath' | 'manifestPath'>,
    storage: MemoryStorage
  ) => Promise<MemoryPathSyncResult>
}

type MemoryScopeExecutionContext = {
  manifestPath: string
  indexPath: string | null
  targetPath: string
  manifestContent: string
  indexContent: string | null
  targetContent: string | null
  supportingDocuments: Array<{
    path: string
    content: string
  }>
}

const MEMORY_EXECUTION_PROTOCOL_VERSION = 'kodi.memory.executor.v1'
const MEMORY_EXECUTION_TIMEOUT_MS = 15_000

const memoryExecutionResponseSchema = z
  .object({
    writes: z
      .array(
        z
          .object({
            path: z.string().trim().min(1),
            purpose: z.enum(['target', 'directory_index', 'manifest']),
            content: z.string().min(1),
          })
          .strict()
      )
      .min(1),
    confidence: z.enum(['low', 'medium', 'high']).default('medium'),
    rationale: z.array(z.string().trim().min(1)).default([]),
  })
  .strict()

type MemoryExecutionModelResponse = z.infer<typeof memoryExecutionResponseSchema>

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

function joinPath(...parts: Array<string | null | undefined>) {
  return parts.map((part) => normalizePath(part)).filter(Boolean).join('/')
}

function basename(path: string) {
  const normalized = normalizePath(path)
  if (!normalized) return ''
  const parts = normalized.split('/')
  return parts[parts.length - 1] ?? ''
}

function toRelativeVaultPath(rootPath: string, path: string) {
  const normalizedRoot = normalizePath(rootPath)
  const normalizedPath = normalizePath(path)

  if (!normalizedPath) return ''
  if (!normalizedRoot) return normalizedPath
  if (normalizedPath === normalizedRoot) return ''
  if (normalizedPath.startsWith(`${normalizedRoot}/`)) {
    return normalizedPath.slice(normalizedRoot.length + 1)
  }

  return normalizedPath
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

function requireMarkdownPath(path: string, label: string) {
  const normalized = normalizeSafeRelativePath(path, label)
  if (!/\.md$/i.test(normalized)) {
    throw new Error(`${label} must point to a markdown file.`)
  }

  return normalized
}

function uniqueStrings(values: Array<string | null | undefined>) {
  return [...new Set(values.filter((value): value is string => Boolean(value)))]
}

function parseExecutionResponse(content: string) {
  const normalized = content
    .trim()
    .replace(/^```json\s*/i, '')
    .replace(/^```\s*/i, '')
    .replace(/\s*```$/i, '')

  try {
    return memoryExecutionResponseSchema.parse(JSON.parse(normalized))
  } catch {
    return null
  }
}

function buildDirectoryIndexPath(directoryPath: string) {
  const normalizedDirectoryPath = normalizePath(directoryPath)
  if (!normalizedDirectoryPath) {
    return null
  }

  const stem = basename(normalizedDirectoryPath)
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')

  if (!stem) {
    throw new Error(
      `Could not derive a directory index filename for ${normalizedDirectoryPath}.`
    )
  }

  return joinPath(normalizedDirectoryPath, `${stem}.md`)
}

function resolveIndexWritePath(plan: MemoryScopeUpdatePlan) {
  if (!plan.requiresIndexRepair) {
    return null
  }

  return plan.indexPath
    ? normalizePath(plan.indexPath)
    : buildDirectoryIndexPath(plan.directoryPath)
}

function buildExecutionRouting(input: {
  scope: MemoryScopeUpdatePlan['scope']
  event: MemoryExecutionEvent
}) {
  if (input.scope === 'member') {
    const actorUserId = input.event.actor?.userId?.trim()
    if (!actorUserId) {
      throw new Error('Member-scoped execution requires an actor user id.')
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

async function readOptionalVaultFile(input: {
  storage: MemoryStorage
  rootPath: string
  path: string
}) {
  const storagePath = joinPath(input.rootPath, input.path)
  const stat = await input.storage.statPath(storagePath)
  if (!stat || stat.type !== 'file') {
    return null
  }

  return (await input.storage.readFile(storagePath)).toString('utf8')
}

async function buildScopeExecutionContext(input: {
  storage: MemoryStorage
  plan: MemoryScopeUpdatePlan
}) {
  const manifestPath =
    toRelativeVaultPath(input.plan.rootPath, input.plan.manifestPath) ||
    'MEMORY.md'
  const indexPath = resolveIndexWritePath(input.plan)
  const targetPath = normalizePath(input.plan.targetPath)

  const manifestContent = await readOptionalVaultFile({
    storage: input.storage,
    rootPath: input.plan.rootPath,
    path: manifestPath,
  })

  if (!manifestContent) {
    throw new Error(
      `Memory execution could not read manifest ${manifestPath} in vault ${input.plan.vaultId}.`
    )
  }

  const [indexContent, targetContent] = await Promise.all([
    indexPath
      ? readOptionalVaultFile({
          storage: input.storage,
          rootPath: input.plan.rootPath,
          path: indexPath,
        })
      : Promise.resolve(null),
    readOptionalVaultFile({
      storage: input.storage,
      rootPath: input.plan.rootPath,
      path: targetPath,
    }),
  ])

  const supportingPaths = uniqueStrings(
    input.plan.requiredReads.map((path) => normalizePath(path))
  )
    .filter(
      (path) =>
        path &&
        path !== manifestPath &&
        path !== indexPath &&
        path !== targetPath
    )
    .slice(0, 6)

  const supportingDocuments = (
    await Promise.all(
      supportingPaths.map(async (path) => {
        const content = await readOptionalVaultFile({
          storage: input.storage,
          rootPath: input.plan.rootPath,
          path,
        })

        return content ? { path, content } : null
      })
    )
  ).filter((document): document is { path: string; content: string } =>
    Boolean(document)
  )

  return {
    manifestPath,
    indexPath,
    targetPath,
    manifestContent,
    indexContent,
    targetContent,
    supportingDocuments,
  } satisfies MemoryScopeExecutionContext
}

function buildExecutionMessages(input: {
  context: MemoryScopeExecutionContext
  plan: MemoryScopeUpdatePlan
  event: MemoryExecutionEvent
  evaluation: MemoryUpdateEvaluation
}) {
  return [
    {
      role: 'system' as const,
      content:
        'You revise Kodi memory files for one already-approved scoped memory update. Reply with JSON only and no prose using this exact shape: {"writes":[{"path":"relative markdown path","purpose":"target|directory_index|manifest","content":"full markdown file content"}],"confidence":"low|medium|high","rationale":["short reason"]}. Only write the approved target file plus directory index or manifest files when the plan explicitly allows them. Keep edits concise, preserve useful existing structure, and avoid rewriting unrelated content. If the target file is new, create a clean markdown document with a clear heading. If directory index repair is required, make sure the index explains what belongs in the directory and references the target file. If manifest repair is required, update MEMORY.md minimally so navigation stays accurate.',
    },
    {
      role: 'user' as const,
      content: JSON.stringify({
        protocolVersion: MEMORY_EXECUTION_PROTOCOL_VERSION,
        scope: input.plan.scope,
        plan: {
          action: input.plan.action,
          directoryPath: input.plan.directoryPath,
          targetPath: input.context.targetPath,
          manifestPath: input.context.manifestPath,
          indexPath: input.context.indexPath,
          requiredReads: input.plan.requiredReads,
          candidatePaths: input.plan.candidatePaths,
          searchQuery: input.plan.searchQuery,
          requiresIndexRepair: input.plan.requiresIndexRepair,
          requiresManifestRepair: input.plan.requiresManifestRepair,
          rationale: input.plan.rationale,
        },
        evaluation: {
          scope: input.evaluation.scope,
          action: input.evaluation.action,
          confidence: input.evaluation.confidence,
          memoryKind: input.evaluation.memoryKind,
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
          metadata: input.event.metadata ?? {},
          payload: input.event.payload,
        },
        allowedWrites: {
          targetPath: input.context.targetPath,
          indexPath: input.context.indexPath,
          manifestPath: input.context.manifestPath,
        },
        currentFiles: {
          target: {
            path: input.context.targetPath,
            content: input.context.targetContent,
          },
          directoryIndex: input.context.indexPath
            ? {
                path: input.context.indexPath,
                content: input.context.indexContent,
              }
            : null,
          manifest: {
            path: input.context.manifestPath,
            content: input.context.manifestContent,
          },
          supportingDocuments: input.context.supportingDocuments,
        },
      }),
    },
  ]
}

function applyExecutionGuardrails(input: {
  plan: MemoryScopeUpdatePlan
  context: MemoryScopeExecutionContext
  modelResponse: MemoryExecutionModelResponse
}) {
  const writesByPath = new Map<string, MemoryExecutionWrite>()
  const targetPath = requireMarkdownPath(input.context.targetPath, 'Target path')
  const manifestPath = requireMarkdownPath(
    input.context.manifestPath,
    'Manifest path'
  )
  const indexPath = input.context.indexPath
    ? requireMarkdownPath(input.context.indexPath, 'Directory index path')
    : null

  for (const write of input.modelResponse.writes) {
    const path = requireMarkdownPath(write.path, 'Write path')
    const content = write.content.trim()

    if (!content) {
      throw new Error(`Memory execution write ${path} cannot be blank.`)
    }

    const allowedPurposes = new Set<MemoryExecutionWrite['purpose']>()
    if (path === targetPath) {
      allowedPurposes.add('target')
    }
    if (indexPath && path === indexPath) {
      allowedPurposes.add('directory_index')
    }
    if (path === manifestPath) {
      allowedPurposes.add('manifest')
    }

    if (allowedPurposes.size === 0) {
      throw new Error(
        `Memory execution attempted to write unapproved path ${path}.`
      )
    }

    if (!allowedPurposes.has(write.purpose)) {
      throw new Error(
        `Memory execution purpose ${write.purpose} is not allowed for path ${path}.`
      )
    }

    if (writesByPath.has(path)) {
      throw new Error(`Memory execution attempted duplicate writes for ${path}.`)
    }

    writesByPath.set(path, {
      path,
      purpose: write.purpose,
      content,
    })
  }

  if (!writesByPath.has(targetPath)) {
    throw new Error('Memory execution must write the planned target file.')
  }

  if (input.plan.requiresIndexRepair && indexPath && !writesByPath.has(indexPath)) {
    throw new Error(
      `Memory execution must repair directory index ${indexPath} for this plan.`
    )
  }

  if (
    input.plan.requiresManifestRepair &&
    !writesByPath.has(manifestPath)
  ) {
    throw new Error(
      `Memory execution must repair manifest ${manifestPath} for this plan.`
    )
  }

  return [...writesByPath.values()].sort((left, right) => {
    const rank = (write: MemoryExecutionWrite) => {
      if (write.path === targetPath) return 0
      if (indexPath && write.path === indexPath) return 1
      if (write.path === manifestPath) return 2
      return 3
    }

    return rank(left) - rank(right)
  })
}

async function defaultSyncVaultMetadata(
  vault: Pick<MemoryScopeUpdatePlan, 'vaultId' | 'rootPath' | 'manifestPath'>,
  storage: MemoryStorage
) {
  return syncMemoryVaultMetadata(
    db,
    {
      id: vault.vaultId,
      rootPath: vault.rootPath,
      manifestPath: vault.manifestPath,
    },
    storage
  )
}

async function executeScopeUpdatePlan(input: {
  storage: MemoryStorage
  plan: MemoryScopeUpdatePlan
  event: MemoryExecutionEvent
  evaluation: MemoryUpdateEvaluation
  completeExecutionChat?: OpenClawChatCompletionFn
  syncVaultMetadata?: MemoryExecutionDeps['syncVaultMetadata']
}): Promise<
  | {
      kind: 'executed'
      result: ExecutedMemoryScopeUpdate
    }
  | {
      kind: 'deferred'
      result: DeferredMemoryScopeUpdate
    }
> {
  if (
    input.plan.action === 'delete_obsolete' ||
    input.plan.action === 'trigger_structural_maintenance'
  ) {
    return {
      kind: 'deferred',
      result: {
        scope: input.plan.scope,
        vaultId: input.plan.vaultId,
        action: input.plan.action,
        reason: 'structural-action',
      },
    }
  }

  const context = await buildScopeExecutionContext({
    storage: input.storage,
    plan: input.plan,
  })
  const routing = buildExecutionRouting({
    scope: input.plan.scope,
    event: input.event,
  })
  const response = await (input.completeExecutionChat ?? openClawChatCompletion)({
    orgId: input.event.orgId,
    actorUserId: routing.actorUserId,
    visibility: routing.visibility,
    sessionKey: `memory-exec:${input.event.dedupeKey}:${input.plan.scope}`,
    messageChannel: 'memory',
    messages: buildExecutionMessages({
      context,
      plan: input.plan,
      event: input.event,
      evaluation: input.evaluation,
    }),
    timeoutMs: MEMORY_EXECUTION_TIMEOUT_MS,
    temperature: 0.1,
    maxTokens: 1_500,
  })

  if (!response.ok) {
    throw new Error(
      `OpenClaw memory execution was unavailable: ${response.error ?? response.reason}.`
    )
  }

  const parsed = parseExecutionResponse(response.content)
  if (!parsed) {
    throw new Error(
      'OpenClaw memory execution did not return valid structured JSON.'
    )
  }

  const writes = applyExecutionGuardrails({
    plan: input.plan,
    context,
    modelResponse: parsed,
  })

  for (const write of writes) {
    await input.storage.writeFile({
      path: joinPath(input.plan.rootPath, write.path),
      body: write.content,
      contentType: DEFAULT_MEMORY_MARKDOWN_CONTENT_TYPE,
    })
  }

  const syncResult = await (
    input.syncVaultMetadata ?? defaultSyncVaultMetadata
  )(
    {
      vaultId: input.plan.vaultId,
      rootPath: input.plan.rootPath,
      manifestPath: input.plan.manifestPath,
    },
    input.storage
  )

  return {
    kind: 'executed',
    result: {
      scope: input.plan.scope,
      vaultId: input.plan.vaultId,
      action: input.plan.action,
      writtenPaths: writes.map((write) => write.path),
      rationale: uniqueStrings([
        ...input.plan.rationale,
        ...parsed.rationale,
      ]),
      syncResult,
    },
  }
}

export async function executeMemoryUpdatePlan(
  event: MemoryExecutionEvent,
  evaluation: MemoryUpdateEvaluation,
  plan: MemoryUpdatePlan,
  deps: MemoryExecutionDeps = {}
) {
  const storage = await resolveStorage(deps.storage)
  const executedScopes: ExecutedMemoryScopeUpdate[] = []
  const deferredScopes: DeferredMemoryScopeUpdate[] = []

  for (const scopePlan of plan.scopes) {
    const result = await executeScopeUpdatePlan({
      storage,
      plan: scopePlan,
      event,
      evaluation,
      completeExecutionChat: deps.completeExecutionChat,
      syncVaultMetadata: deps.syncVaultMetadata,
    })

    if (result.kind === 'executed') {
      executedScopes.push(result.result)
      continue
    }

    deferredScopes.push(result.result)
  }

  return {
    executedScopes,
    deferredScopes,
  } satisfies MemoryUpdateExecutionResult
}
