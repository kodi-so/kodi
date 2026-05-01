import { z } from 'zod'
import { openClawChatCompletion, type OpenClawConversationVisibility } from '../openclaw/client'
import type { NormalizedMemoryUpdateEvent } from './events'

export type MemoryUpdateScopeDecision = 'org' | 'member' | 'both' | 'none'

export type MemoryUpdateAction =
  | 'ignore'
  | 'update_existing'
  | 'create_new'
  | 'delete_obsolete'
  | 'trigger_structural_maintenance'

export type MemoryUpdateDurability = 'durable' | 'temporary' | 'unknown'

export type MemoryUpdateKind =
  | 'decision'
  | 'preference'
  | 'responsibility'
  | 'current_state'
  | 'relationship'
  | 'process'
  | 'project'
  | 'customer'
  | 'meeting'
  | 'reference'
  | 'other'

export type MemoryUpdateIgnoreReason =
  | 'temporary-signal'
  | 'low-information'
  | 'guardrail-blocked'
  | 'model-unavailable'
  | 'invalid-model-response'

export type MemoryUpdateEvaluation = {
  scope: MemoryUpdateScopeDecision
  action: MemoryUpdateAction
  durability: MemoryUpdateDurability
  shouldWrite: boolean
  confidence: 'low' | 'medium' | 'high'
  rationale: string[]
  signalTags: string[]
  memoryKind: MemoryUpdateKind
  guardrailsApplied: string[]
  engine: 'openclaw' | 'guardrail-fallback'
  ignoredReason?: MemoryUpdateIgnoreReason
}

type OpenClawChatCompletionFn = typeof openClawChatCompletion

export type MemoryEvaluationDeps = {
  completeChat?: OpenClawChatCompletionFn
}

const MEMORY_EVALUATION_PROTOCOL_VERSION = 'kodi.memory.evaluator.v1'
const MEMORY_EVALUATION_TIMEOUT_MS = 12_000

const memoryEvaluationResponseSchema = z
  .object({
    shouldWrite: z.boolean(),
    scope: z.enum(['org', 'member', 'both', 'none']),
    action: z.enum([
      'ignore',
      'update_existing',
      'create_new',
      'delete_obsolete',
      'trigger_structural_maintenance',
    ]),
    durability: z.enum(['durable', 'temporary']),
    confidence: z.enum(['low', 'medium', 'high']),
    memoryKind: z.enum([
      'decision',
      'preference',
      'responsibility',
      'current_state',
      'relationship',
      'process',
      'project',
      'customer',
      'meeting',
      'reference',
      'other',
    ]),
    rationale: z.array(z.string().trim().min(1)).default([]),
    signalTags: z.array(z.string().trim().min(1)).default([]),
    memberScopeJustification: z.string().trim().min(1).nullish(),
  })
  .strict()

type MemoryEvaluationModelResponse = z.infer<typeof memoryEvaluationResponseSchema>

export async function evaluateMemoryUpdateEvent(
  event: NormalizedMemoryUpdateEvent,
  deps: MemoryEvaluationDeps = {}
): Promise<MemoryUpdateEvaluation> {
  const routing = resolveEvaluationRouting(event)
  if (!routing.ok) {
    return routing.evaluation
  }

  const response = await (deps.completeChat ?? openClawChatCompletion)({
    orgId: event.orgId,
    actorUserId: routing.actorUserId,
    visibility: routing.visibility,
    sessionKey: `memory-eval:${event.dedupeKey}`,
    messageChannel: 'memory',
    messages: buildMemoryEvaluationMessages(event),
    timeoutMs: MEMORY_EVALUATION_TIMEOUT_MS,
    temperature: 0.1,
    maxTokens: 500,
  })

  if (!response.ok) {
    return buildIgnoredEvaluation({
      reason: 'model-unavailable',
      durability: 'unknown',
      rationale: [
        `OpenClaw memory evaluation was unavailable: ${response.error ?? response.reason}.`,
      ],
      signalTags: [],
      memoryKind: 'other',
      engine: 'guardrail-fallback',
    })
  }

  const parsed = parseMemoryEvaluationResponse(response.content)
  if (!parsed) {
    return buildIgnoredEvaluation({
      reason: 'invalid-model-response',
      durability: 'unknown',
      rationale: [
        'OpenClaw memory evaluation did not return valid structured JSON.',
      ],
      signalTags: ['invalid_model_response'],
      memoryKind: 'other',
      engine: 'guardrail-fallback',
    })
  }

  return applyMemoryEvaluationGuardrails(event, parsed)
}

function resolveEvaluationRouting(
  event: NormalizedMemoryUpdateEvent
):
  | {
      ok: true
      visibility: OpenClawConversationVisibility
      actorUserId?: string
    }
  | {
      ok: false
      evaluation: MemoryUpdateEvaluation
    } {
  if (event.visibility === 'private') {
    const actorUserId = event.actor?.userId?.trim()

    if (!actorUserId) {
      return {
        ok: false,
        evaluation: buildIgnoredEvaluation({
          reason: 'guardrail-blocked',
          durability: 'unknown',
          rationale: [
            'Private memory evaluation requires a concrete actor user id so the request can be routed and attributed safely.',
          ],
          signalTags: ['missing_private_actor'],
          memoryKind: 'other',
          guardrailsApplied: ['Blocked evaluation for a private event without an actor user id.'],
          engine: 'guardrail-fallback',
        }),
      }
    }

    return {
      ok: true,
      visibility: 'private',
      actorUserId,
    }
  }

  return {
    ok: true,
    visibility: 'shared',
  }
}

function buildMemoryEvaluationMessages(event: NormalizedMemoryUpdateEvent) {
  return [
    {
      role: 'system' as const,
      content:
        'You decide whether new Kodi events deserve durable memory. Reply with JSON only and no prose. Use this exact shape: {"shouldWrite":true,"scope":"org|member|both|none","action":"ignore|update_existing|create_new|delete_obsolete|trigger_structural_maintenance","durability":"durable|temporary","confidence":"low|medium|high","memoryKind":"decision|preference|responsibility|current_state|relationship|process|project|customer|meeting|reference|other","rationale":["short reason"],"signalTags":["tag"],"memberScopeJustification":"required only when scope includes member for a shared or system event"}. Durable memory means information likely useful later, such as decisions, preferences, responsibilities, current state, relationships, or stable reference facts. Temporary chatter, acknowledgements, and momentary operational noise should usually not be written. Prefer scope "org" for shared team/project/customer/process context, "member" for personal preferences or private commitments, "both" only when both kinds of memory are clearly present, and "none" when nothing durable should be stored. Be conservative with member scope on shared or system events: only choose it when the event contains durable personal context tied to a specific actor.',
    },
    {
      role: 'user' as const,
      content: JSON.stringify(buildMemoryEvaluationPromptContext(event)),
    },
  ]
}

function buildMemoryEvaluationPromptContext(event: NormalizedMemoryUpdateEvent) {
  return {
    protocolVersion: MEMORY_EVALUATION_PROTOCOL_VERSION,
    durableMemoryGoal:
      'Classify whether this event should update durable memory and which scope that memory belongs to.',
    event: {
      id: event.id,
      orgId: event.orgId,
      source: event.source,
      visibility: event.visibility,
      occurredAt: event.occurredAt.toISOString(),
      summary: event.summary,
      dedupeKey: event.dedupeKey,
      actor: {
        userId: event.actor?.userId ?? null,
        orgMemberId: event.actor?.orgMemberId ?? null,
        openclawAgentId: event.actor?.openclawAgentId ?? null,
      },
      payload: sanitizePromptValue(event.payload),
      metadata: sanitizePromptValue(event.metadata ?? {}),
    },
    constraints: {
      memberScopeAllowed: Boolean(event.actor?.userId),
      sharedOrSystemEvent:
        event.visibility === 'shared' || event.visibility === 'system',
      proposalActionsAllowed:
        event.source === 'openclaw_proposal'
          ? ['ignore', 'update_existing', 'create_new', 'delete_obsolete', 'trigger_structural_maintenance']
          : ['ignore', 'update_existing', 'create_new'],
    },
  }
}

function parseMemoryEvaluationResponse(content: string) {
  const normalized = content
    .trim()
    .replace(/^```json\s*/i, '')
    .replace(/^```\s*/i, '')
    .replace(/\s*```$/i, '')

  try {
    return memoryEvaluationResponseSchema.parse(JSON.parse(normalized))
  } catch {
    return null
  }
}

function applyMemoryEvaluationGuardrails(
  event: NormalizedMemoryUpdateEvent,
  modelEvaluation: MemoryEvaluationModelResponse
): MemoryUpdateEvaluation {
  const guardrailsApplied: string[] = []
  const rationale = uniqueStrings(modelEvaluation.rationale)
  const signalTags = normalizeSignalTags(modelEvaluation.signalTags)

  if (
    !modelEvaluation.shouldWrite ||
    modelEvaluation.scope === 'none' ||
    modelEvaluation.action === 'ignore'
  ) {
    return buildIgnoredEvaluation({
      reason:
        modelEvaluation.durability === 'temporary'
          ? 'temporary-signal'
          : 'low-information',
      durability: modelEvaluation.durability,
      rationale:
        rationale.length > 0
          ? rationale
          : ['The model judged this event as not worth durable memory.'],
      signalTags,
      memoryKind: modelEvaluation.memoryKind,
      engine: 'openclaw',
    })
  }

  let scope = modelEvaluation.scope
  let action = modelEvaluation.action

  if (
    event.source !== 'openclaw_proposal' &&
    (action === 'delete_obsolete' ||
      action === 'trigger_structural_maintenance')
  ) {
    guardrailsApplied.push(
      'Downgraded proposal-only action to update_existing for a product event.'
    )
    action = 'update_existing'
  }

  const includesMemberScope = scope === 'member' || scope === 'both'
  if (includesMemberScope && !event.actor?.userId) {
    return buildIgnoredEvaluation({
      reason: 'guardrail-blocked',
      durability: modelEvaluation.durability,
      rationale: uniqueStrings([
        ...rationale,
        'Member-scoped memory requires a concrete actor user id.',
      ]),
      signalTags,
      memoryKind: modelEvaluation.memoryKind,
      guardrailsApplied: [
        ...guardrailsApplied,
        'Blocked member-scoped memory without an actor user id.',
      ],
      engine: 'openclaw',
    })
  }

  const memberScopeJustification =
    modelEvaluation.memberScopeJustification?.trim() || null

  if (
    includesMemberScope &&
    event.visibility !== 'private' &&
    !memberScopeJustification
  ) {
    if (scope === 'both') {
      guardrailsApplied.push(
        'Removed member scope because the model did not justify a personal memory write from a shared or system event.'
      )
      scope = 'org'
    } else {
      return buildIgnoredEvaluation({
        reason: 'guardrail-blocked',
        durability: modelEvaluation.durability,
        rationale: uniqueStrings([
          ...rationale,
          'Shared or system events need an explicit justification before writing member memory.',
        ]),
        signalTags,
        memoryKind: modelEvaluation.memoryKind,
        guardrailsApplied: [
          ...guardrailsApplied,
          'Blocked member-only scope for a shared or system event without explicit justification.',
        ],
        engine: 'openclaw',
      })
    }
  }

  return {
    scope,
    action,
    durability: modelEvaluation.durability,
    shouldWrite: true,
    confidence: modelEvaluation.confidence,
    rationale:
      rationale.length > 0
        ? rationale
        : ['The model found durable information worth writing to memory.'],
    signalTags,
    memoryKind: modelEvaluation.memoryKind,
    guardrailsApplied,
    engine: 'openclaw',
  }
}

function buildIgnoredEvaluation(input: {
  reason: MemoryUpdateIgnoreReason
  durability: MemoryUpdateDurability
  rationale: string[]
  signalTags: string[]
  memoryKind: MemoryUpdateKind
  guardrailsApplied?: string[]
  engine: 'openclaw' | 'guardrail-fallback'
}): MemoryUpdateEvaluation {
  return {
    scope: 'none',
    action: 'ignore',
    durability: input.durability,
    shouldWrite: false,
    confidence: 'low',
    rationale: uniqueStrings(input.rationale),
    signalTags: normalizeSignalTags(input.signalTags),
    memoryKind: input.memoryKind,
    guardrailsApplied: uniqueStrings(input.guardrailsApplied ?? []),
    engine: input.engine,
    ignoredReason: input.reason,
  }
}

function sanitizePromptValue(value: unknown, depth = 0): unknown {
  if (value == null) return value
  if (typeof value === 'string') {
    return value.length > 1_500 ? `${value.slice(0, 1_500)}…` : value
  }

  if (
    typeof value === 'number' ||
    typeof value === 'boolean' ||
    typeof value === 'bigint'
  ) {
    return value
  }

  if (value instanceof Date) {
    return value.toISOString()
  }

  if (depth >= 3) {
    return '[truncated]'
  }

  if (Array.isArray(value)) {
    return value.slice(0, 20).map((item) => sanitizePromptValue(item, depth + 1))
  }

  if (typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>).slice(0, 30)
    return Object.fromEntries(
      entries.map(([key, childValue]) => [
        key,
        sanitizePromptValue(childValue, depth + 1),
      ])
    )
  }

  return String(value)
}

function normalizeSignalTags(tags: string[]) {
  return uniqueStrings(
    tags
      .map((tag) => tag.trim().toLowerCase().replace(/\s+/g, '_'))
      .filter(Boolean)
      .slice(0, 8)
  )
}

function uniqueStrings(values: string[]) {
  return [...new Set(values.filter(Boolean))]
}
