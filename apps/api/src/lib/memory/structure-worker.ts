import { z } from 'zod'
import {
  openClawChatCompletion,
  type OpenClawConversationVisibility,
} from '../openclaw/client'
import type { MemoryUpdateEvaluation } from './evaluation'
import type { ResolvedStructureVault, MemoryStructureDeps } from './structure'
import {
  deleteScopedMemoryPath,
  mergeScopedMemoryFiles,
  moveScopedMemoryPath,
  renameScopedMemoryPath,
  splitScopedMemoryFile,
} from './structure'
import type { MemoryPathSyncResult } from './paths'
import type { MemoryScopeUpdatePlan } from './resolution'
import type { MemoryStorage } from './storage'

type OpenClawChatCompletionFn = typeof openClawChatCompletion

export type StructuralWorkerDeps = MemoryStructureDeps & {
  completeStructureChat?: OpenClawChatCompletionFn
}

export type StructuralWorkerResult = {
  operation:
    | 'delete_path'
    | 'rename_path'
    | 'move_path'
    | 'split_file'
    | 'merge_files'
    | 'noop'
  touchedPaths: string[]
  rationale: string[]
  syncResult: MemoryPathSyncResult | null
}

type MemoryStructureWorkerEvent = {
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
}

const MEMORY_STRUCTURE_PROTOCOL_VERSION = 'kodi.memory.structure-worker.v1'
const MEMORY_STRUCTURE_TIMEOUT_MS = 15_000

const structuralResponseSchema = z
  .discriminatedUnion('operation', [
    z
      .object({
        operation: z.literal('noop'),
        rationale: z.array(z.string().trim().min(1)).default([]),
      })
      .strict(),
    z
      .object({
        operation: z.literal('delete_path'),
        path: z.string().trim().min(1),
        rationale: z.array(z.string().trim().min(1)).default([]),
      })
      .strict(),
    z
      .object({
        operation: z.literal('rename_path'),
        path: z.string().trim().min(1),
        newName: z.string().trim().min(1),
        rationale: z.array(z.string().trim().min(1)).default([]),
      })
      .strict(),
    z
      .object({
        operation: z.literal('move_path'),
        fromPath: z.string().trim().min(1),
        toPath: z.string().trim().min(1),
        rationale: z.array(z.string().trim().min(1)).default([]),
      })
      .strict(),
    z
      .object({
        operation: z.literal('split_file'),
        sourcePath: z.string().trim().min(1),
        targets: z
          .array(
            z
              .object({
                path: z.string().trim().min(1),
                content: z.string().min(1),
              })
              .strict()
          )
          .min(2),
        rationale: z.array(z.string().trim().min(1)).default([]),
      })
      .strict(),
    z
      .object({
        operation: z.literal('merge_files'),
        sourcePaths: z.array(z.string().trim().min(1)).min(2),
        targetPath: z.string().trim().min(1),
        content: z.string().min(1),
        rationale: z.array(z.string().trim().min(1)).default([]),
      })
      .strict(),
  ])

type StructuralModelResponse = z.infer<typeof structuralResponseSchema>

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

function requireSafeRelativePath(path: string, label: string) {
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

function parseStructureResponse(content: string) {
  const normalized = content
    .trim()
    .replace(/^```json\s*/i, '')
    .replace(/^```\s*/i, '')
    .replace(/\s*```$/i, '')

  try {
    return structuralResponseSchema.parse(JSON.parse(normalized))
  } catch {
    return null
  }
}

function buildRouting(input: {
  scope: MemoryScopeUpdatePlan['scope']
  event: MemoryStructureWorkerEvent
}) {
  if (input.scope === 'member') {
    const actorUserId = input.event.actor?.userId?.trim()
    if (!actorUserId) {
      throw new Error('Member-scoped structure maintenance requires an actor user id.')
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

async function readOptionalFile(
  storage: MemoryStorage,
  rootPath: string,
  relativePath: string
) {
  const storagePath = joinPath(rootPath, relativePath)
  const stat = await storage.statPath(storagePath)
  if (!stat || stat.type !== 'file') return null
  return (await storage.readFile(storagePath)).toString('utf8')
}

async function buildStructuralContext(input: {
  storage: MemoryStorage
  plan: MemoryScopeUpdatePlan
}) {
  const manifestPath = 'MEMORY.md'
  const readPaths = [...new Set([
    manifestPath,
    input.plan.indexPath,
    input.plan.targetPath,
    ...input.plan.requiredReads,
    ...input.plan.candidatePaths,
  ].filter(Boolean).map((path) => normalizePath(path)))]

  const documents = (
    await Promise.all(
      readPaths.map(async (path) => {
        const content = await readOptionalFile(input.storage, input.plan.rootPath, path)
        return content ? { path, content } : null
      })
    )
  ).filter((value): value is { path: string; content: string } => Boolean(value))

  return {
    manifestPath,
    documents,
    mutablePaths: [...new Set([input.plan.targetPath, ...input.plan.candidatePaths].map((path) => normalizePath(path)))],
  }
}

function buildMessages(input: {
  context: Awaited<ReturnType<typeof buildStructuralContext>>
  event: MemoryStructureWorkerEvent
  evaluation: MemoryUpdateEvaluation
  plan: MemoryScopeUpdatePlan
}) {
  const allowedOperations =
    input.plan.action === 'delete_obsolete'
      ? ['delete_path', 'merge_files', 'noop']
      : ['rename_path', 'move_path', 'split_file', 'merge_files', 'delete_path', 'noop']

  return [
    {
      role: 'system' as const,
      content:
        'You decide which supported structural maintenance operation Kodi should execute inside one scoped memory vault. Reply with JSON only and no prose. Choose exactly one operation from the allowed set. Use these exact shapes: {"operation":"noop","rationale":["reason"]}, {"operation":"delete_path","path":"relative path","rationale":["reason"]}, {"operation":"rename_path","path":"relative path","newName":"single path segment","rationale":["reason"]}, {"operation":"move_path","fromPath":"relative path","toPath":"relative path","rationale":["reason"]}, {"operation":"split_file","sourcePath":"relative markdown path","targets":[{"path":"relative markdown path","content":"full markdown content"}],"rationale":["reason"]}, {"operation":"merge_files","sourcePaths":["relative markdown path"],"targetPath":"relative markdown path","content":"full markdown content","rationale":["reason"]}. Stay inside the vault, operate only on the candidate mutable paths unless creating new split/merge targets, and preserve concise durable memory.',
    },
    {
      role: 'user' as const,
      content: JSON.stringify({
        protocolVersion: MEMORY_STRUCTURE_PROTOCOL_VERSION,
        allowedOperations,
        event: {
          id: input.event.id,
          source: input.event.source,
          visibility: input.event.visibility,
          summary: input.event.summary,
          occurredAt: input.event.occurredAt.toISOString(),
        },
        evaluation: {
          action: input.evaluation.action,
          topicLabel: input.evaluation.topicLabel,
          topicSummary: input.evaluation.topicSummary,
          topicKeywords: input.evaluation.topicKeywords,
          rationale: input.evaluation.rationale,
        },
        plan: {
          scope: input.plan.scope,
          action: input.plan.action,
          directoryPath: input.plan.directoryPath,
          targetPath: input.plan.targetPath,
          candidatePaths: input.plan.candidatePaths,
          requiredReads: input.plan.requiredReads,
          rationale: input.plan.rationale,
        },
        mutablePaths: input.context.mutablePaths,
        documents: input.context.documents,
      }),
    },
  ]
}

function buildResolveVaultFromEvent(
  plan: MemoryScopeUpdatePlan,
  event: MemoryStructureWorkerEvent
) {
  return async () =>
    ({
      id: plan.vaultId,
      orgId: event.orgId,
      scopeType: plan.scope,
      orgMemberId: plan.scope === 'member' ? (event.actor?.orgMemberId ?? null) : null,
      rootPath: plan.rootPath,
      manifestPath: plan.manifestPath,
    }) satisfies ResolvedStructureVault
}

function uniqueStrings(values: Array<string | null | undefined>) {
  return [...new Set(values.filter((value): value is string => Boolean(value)))]
}

function applyGuardrails(input: {
  modelResponse: StructuralModelResponse
  plan: MemoryScopeUpdatePlan
  mutablePaths: string[]
}) {
  const mutablePathSet = new Set(input.mutablePaths.map((path) => normalizePath(path)))
  const validateExistingPath = (path: string, label: string) => {
    const normalized = requireSafeRelativePath(path, label)
    if (!mutablePathSet.has(normalized)) {
      throw new Error(`${label} must be one of the mutable plan paths.`)
    }
    return normalized
  }

  switch (input.modelResponse.operation) {
    case 'noop':
      return input.modelResponse
    case 'delete_path':
      return {
        ...input.modelResponse,
        path: validateExistingPath(input.modelResponse.path, 'Delete path'),
      }
    case 'rename_path':
      return {
        ...input.modelResponse,
        path: validateExistingPath(input.modelResponse.path, 'Rename path'),
        newName: requireSafeRelativePath(input.modelResponse.newName, 'New name'),
      }
    case 'move_path':
      return {
        ...input.modelResponse,
        fromPath: validateExistingPath(input.modelResponse.fromPath, 'Move source path'),
        toPath: requireSafeRelativePath(input.modelResponse.toPath, 'Move destination path'),
      }
    case 'split_file': {
      const sourcePath = validateExistingPath(
        input.modelResponse.sourcePath,
        'Split source path'
      )
      const targets = input.modelResponse.targets.map((target) => ({
        ...target,
        path: requireSafeRelativePath(target.path, 'Split target path'),
      }))
      return {
        ...input.modelResponse,
        sourcePath,
        targets,
      }
    }
    case 'merge_files': {
      const sourcePaths = input.modelResponse.sourcePaths.map((path) =>
        validateExistingPath(path, 'Merge source path')
      )
      return {
        ...input.modelResponse,
        sourcePaths,
        targetPath: requireSafeRelativePath(
          input.modelResponse.targetPath,
          'Merge target path'
        ),
      }
    }
  }
}

export async function runStructureMaintenanceWorker(input: {
  event: MemoryStructureWorkerEvent
  evaluation: MemoryUpdateEvaluation
  plan: MemoryScopeUpdatePlan
  deps?: StructuralWorkerDeps
}) {
  const storage = await resolveStorage(input.deps?.storage)
  const context = await buildStructuralContext({
    storage,
    plan: input.plan,
  })
  const routing = buildRouting({
    scope: input.plan.scope,
    event: input.event,
  })
  const response = await (input.deps?.completeStructureChat ?? openClawChatCompletion)(
    {
      orgId: input.event.orgId,
      actorUserId: routing.actorUserId,
      visibility: routing.visibility,
      sessionKey: `memory-structure:${input.event.dedupeKey}:${input.plan.scope}`,
      messageChannel: 'memory',
      messages: buildMessages({
        context,
        event: input.event,
        evaluation: input.evaluation,
        plan: input.plan,
      }),
      timeoutMs: MEMORY_STRUCTURE_TIMEOUT_MS,
      temperature: 0.1,
      maxTokens: 2_000,
    }
  )

  if (!response.ok) {
    throw new Error(
      `OpenClaw structure maintenance was unavailable: ${response.error ?? response.reason}.`
    )
  }

  const parsed = parseStructureResponse(response.content)
  if (!parsed) {
    throw new Error(
      'OpenClaw structure maintenance did not return valid structured JSON.'
    )
  }

  const operation = applyGuardrails({
    modelResponse: parsed,
    plan: input.plan,
    mutablePaths: context.mutablePaths,
  })

  const structureDeps: MemoryStructureDeps = {
    storage,
    resolveVault: buildResolveVaultFromEvent(input.plan, input.event),
    syncVaultMetadata: input.deps?.syncVaultMetadata,
  }

  switch (operation.operation) {
    case 'noop':
      return {
        operation: 'noop',
        touchedPaths: [],
        rationale: uniqueStrings(operation.rationale),
        syncResult: null,
      } satisfies StructuralWorkerResult
    case 'delete_path': {
      const result = await deleteScopedMemoryPath({
        orgId: input.event.orgId,
        scope: input.plan.scope,
        actorUserId: input.event.actor?.userId,
        actorOrgMemberId: input.event.actor?.orgMemberId,
        path: operation.path,
        deps: {
          ...structureDeps,
          resolveVault: buildResolveVaultFromEvent(input.plan, input.event),
        },
      })
      return {
        operation: 'delete_path',
        touchedPaths: [result.path],
        rationale: uniqueStrings(operation.rationale),
        syncResult: result.syncResult,
      } satisfies StructuralWorkerResult
    }
    case 'rename_path': {
      const result = await renameScopedMemoryPath({
        orgId: input.event.orgId,
        scope: input.plan.scope,
        actorUserId: input.event.actor?.userId,
        actorOrgMemberId: input.event.actor?.orgMemberId,
        path: operation.path,
        newName: operation.newName,
        deps: {
          ...structureDeps,
          resolveVault: buildResolveVaultFromEvent(input.plan, input.event),
        },
      })
      return {
        operation: 'rename_path',
        touchedPaths: [result.fromPath, result.toPath],
        rationale: uniqueStrings(operation.rationale),
        syncResult: result.syncResult,
      } satisfies StructuralWorkerResult
    }
    case 'move_path': {
      const result = await moveScopedMemoryPath({
        orgId: input.event.orgId,
        scope: input.plan.scope,
        actorUserId: input.event.actor?.userId,
        actorOrgMemberId: input.event.actor?.orgMemberId,
        fromPath: operation.fromPath,
        toPath: operation.toPath,
        deps: {
          ...structureDeps,
          resolveVault: buildResolveVaultFromEvent(input.plan, input.event),
        },
      })
      return {
        operation: 'move_path',
        touchedPaths: [result.fromPath, result.toPath],
        rationale: uniqueStrings(operation.rationale),
        syncResult: result.syncResult,
      } satisfies StructuralWorkerResult
    }
    case 'split_file': {
      const result = await splitScopedMemoryFile({
        orgId: input.event.orgId,
        scope: input.plan.scope,
        actorUserId: input.event.actor?.userId,
        actorOrgMemberId: input.event.actor?.orgMemberId,
        sourcePath: operation.sourcePath,
        targets: operation.targets,
        deps: {
          ...structureDeps,
          resolveVault: buildResolveVaultFromEvent(input.plan, input.event),
        },
      })
      return {
        operation: 'split_file',
        touchedPaths: [result.sourcePath, ...result.createdPaths],
        rationale: uniqueStrings(operation.rationale),
        syncResult: result.syncResult,
      } satisfies StructuralWorkerResult
    }
    case 'merge_files': {
      const result = await mergeScopedMemoryFiles({
        orgId: input.event.orgId,
        scope: input.plan.scope,
        actorUserId: input.event.actor?.userId,
        actorOrgMemberId: input.event.actor?.orgMemberId,
        sourcePaths: operation.sourcePaths,
        targetPath: operation.targetPath,
        content: operation.content,
        deps: {
          ...structureDeps,
          resolveVault: buildResolveVaultFromEvent(input.plan, input.event),
        },
      })
      return {
        operation: 'merge_files',
        touchedPaths: [...result.sourcePaths, result.targetPath],
        rationale: uniqueStrings(operation.rationale),
        syncResult: result.syncResult,
      } satisfies StructuralWorkerResult
    }
  }
}
