import { z } from 'zod'
import {
  evaluateMemoryUpdateEvent,
  type MemoryEvaluationDeps,
  type MemoryUpdateEvaluation,
  type MemoryUpdateIgnoreReason,
} from './evaluation'
import {
  resolveMemoryUpdatePlan,
  type MemoryResolutionDeps,
  type MemoryUpdatePlan,
} from './resolution'

export const memoryUpdateSourceSchema = z.enum([
  'meeting',
  'app_chat',
  'dashboard_assistant',
  'slack',
  'work_item',
  'integration_sync',
  'user_request',
  'openclaw_proposal',
])

export const memoryUpdateVisibilitySchema = z.enum([
  'private',
  'shared',
  'system',
])

const memoryUpdateActorSchema = z
  .object({
    userId: z.string().trim().min(1).optional(),
    orgMemberId: z.string().trim().min(1).optional(),
    openclawAgentId: z.string().trim().min(1).optional(),
  })
  .strict()

const baseMemoryUpdateEventSchema = {
  id: z
    .string()
    .trim()
    .min(1)
    .optional()
    .default(() => crypto.randomUUID()),
  orgId: z.string().trim().min(1),
  occurredAt: z.coerce.date(),
  visibility: memoryUpdateVisibilitySchema.default('system'),
  summary: z.string().trim().min(1),
  actor: memoryUpdateActorSchema.optional(),
  metadata: z.record(z.unknown()).optional(),
  dedupeKey: z.string().trim().min(1).optional(),
} as const

const meetingMemoryUpdateEventSchema = z.object({
  ...baseMemoryUpdateEventSchema,
  source: z.literal('meeting'),
  payload: z
    .object({
      meetingSessionId: z.string().trim().min(1),
      eventId: z.string().trim().min(1).optional(),
      lastEventSequence: z.number().int().nonnegative().optional(),
      trigger: z
        .enum(['completed', 'state_changed', 'transcript_updated'])
        .default('state_changed'),
    })
    .strict(),
})

const appChatMemoryUpdateEventSchema = z.object({
  ...baseMemoryUpdateEventSchema,
  source: z.literal('app_chat'),
  payload: z
    .object({
      threadId: z.string().trim().min(1),
      messageId: z.string().trim().min(1).optional(),
    })
    .strict(),
})

const dashboardAssistantMemoryUpdateEventSchema = z.object({
  ...baseMemoryUpdateEventSchema,
  source: z.literal('dashboard_assistant'),
  payload: z
    .object({
      threadId: z.string().trim().min(1),
      messageId: z.string().trim().min(1).optional(),
    })
    .strict(),
})

const slackMemoryUpdateEventSchema = z.object({
  ...baseMemoryUpdateEventSchema,
  source: z.literal('slack'),
  payload: z
    .object({
      channelId: z.string().trim().min(1),
      threadTs: z.string().trim().min(1).optional(),
      messageTs: z.string().trim().min(1).optional(),
      isDirectMessage: z.boolean().default(false),
    })
    .strict(),
})

const workItemMemoryUpdateEventSchema = z.object({
  ...baseMemoryUpdateEventSchema,
  source: z.literal('work_item'),
  payload: z
    .object({
      workItemId: z.string().trim().min(1),
      changeType: z.string().trim().min(1),
    })
    .strict(),
})

const integrationSyncMemoryUpdateEventSchema = z.object({
  ...baseMemoryUpdateEventSchema,
  source: z.literal('integration_sync'),
  payload: z
    .object({
      integration: z.string().trim().min(1),
      externalEntityId: z.string().trim().min(1).optional(),
      eventType: z.string().trim().min(1),
    })
    .strict(),
})

const userRequestMemoryUpdateEventSchema = z.object({
  ...baseMemoryUpdateEventSchema,
  source: z.literal('user_request'),
  payload: z
    .object({
      requestId: z.string().trim().min(1),
      surface: z.enum([
        'memory_ui',
        'app_chat',
        'dashboard_assistant',
        'slack',
        'api',
      ]),
      path: z.string().trim().min(1).optional(),
    })
    .strict(),
})

const openClawProposalMemoryUpdateEventSchema = z.object({
  ...baseMemoryUpdateEventSchema,
  source: z.literal('openclaw_proposal'),
  payload: z
    .object({
      proposalId: z.string().trim().min(1),
      toolCallId: z.string().trim().min(1),
      sessionKey: z.string().trim().min(1).optional(),
      operation: z.enum([
        'update',
        'create',
        'delete',
        'rename',
        'move',
      ]),
    })
    .strict(),
})

export const memoryUpdateEventSchema = z.discriminatedUnion('source', [
  meetingMemoryUpdateEventSchema,
  appChatMemoryUpdateEventSchema,
  dashboardAssistantMemoryUpdateEventSchema,
  slackMemoryUpdateEventSchema,
  workItemMemoryUpdateEventSchema,
  integrationSyncMemoryUpdateEventSchema,
  userRequestMemoryUpdateEventSchema,
  openClawProposalMemoryUpdateEventSchema,
])

export type MemoryUpdateEvent = z.infer<typeof memoryUpdateEventSchema>
export type NormalizedMemoryUpdateEvent = MemoryUpdateEvent & {
  dedupeKey: string
}

export type MemoryUpdateWorkerResult =
  | {
      status: 'ignored'
      reason: MemoryUpdateIgnoreReason
      event: NormalizedMemoryUpdateEvent
      evaluation: MemoryUpdateEvaluation
    }
  | {
      status: 'planned'
      event: NormalizedMemoryUpdateEvent
      evaluation: MemoryUpdateEvaluation
      plan: MemoryUpdatePlan
    }

export type MemoryUpdateWorkerDeps = MemoryEvaluationDeps & MemoryResolutionDeps

type MemoryUpdateJob = {
  dedupeKey: string
  occurredAtMs: number
  event: NormalizedMemoryUpdateEvent
}

export function normalizeMemoryUpdateEvent(
  input: MemoryUpdateEvent
): NormalizedMemoryUpdateEvent
export function normalizeMemoryUpdateEvent(
  input: unknown
): NormalizedMemoryUpdateEvent
export function normalizeMemoryUpdateEvent(input: unknown) {
  const event = memoryUpdateEventSchema.parse(input)

  return {
    ...event,
    dedupeKey: event.dedupeKey ?? buildDefaultMemoryUpdateDedupeKey(event),
  }
}

export function createLatestOnlyMemoryUpdateScheduler(
  runner: (job: MemoryUpdateJob) => Promise<MemoryUpdateWorkerResult>
) {
  const queues = new Map<
    string,
    {
      latestJob: MemoryUpdateJob
      promise: Promise<MemoryUpdateWorkerResult>
      latestResult: MemoryUpdateWorkerResult | null
    }
  >()

  return function schedule(
    input: MemoryUpdateEvent | NormalizedMemoryUpdateEvent | unknown
  ) {
    const event = normalizeMemoryUpdateEvent(input)
    const job: MemoryUpdateJob = {
      dedupeKey: event.dedupeKey,
      occurredAtMs: event.occurredAt.getTime(),
      event,
    }
    const existing = queues.get(job.dedupeKey)

    if (existing) {
      if (job.occurredAtMs >= existing.latestJob.occurredAtMs) {
        existing.latestJob = job
      }

      return existing.promise
    }

    const state = {
      latestJob: job,
      latestResult: null as MemoryUpdateWorkerResult | null,
      promise: Promise.resolve<MemoryUpdateWorkerResult>({
        status: 'ignored',
        reason: 'low-information',
        event,
        evaluation: {
          scope: 'none',
          action: 'ignore',
          durability: 'unknown',
          shouldWrite: false,
          confidence: 'low',
          rationale: ['Memory evaluation has not run yet.'],
          signalTags: [],
          memoryKind: 'other',
          guardrailsApplied: [],
          engine: 'guardrail-fallback',
          ignoredReason: 'low-information',
        },
      }),
    }

    state.promise = (async () => {
      let processedAtMs = -1

      while (true) {
        const current = state.latestJob
        state.latestResult = await runner(current)
        processedAtMs = current.occurredAtMs

        if (state.latestJob.occurredAtMs <= processedAtMs) {
          break
        }
      }

      return state.latestResult ?? (await runner(job))
    })().finally(() => {
      const active = queues.get(job.dedupeKey)
      if (active === state) {
        queues.delete(job.dedupeKey)
      }
    })

    queues.set(job.dedupeKey, state)
    return state.promise
  }
}

export async function runMemoryUpdateWorker(
  input: MemoryUpdateEvent | NormalizedMemoryUpdateEvent | unknown,
  deps: MemoryUpdateWorkerDeps = {}
): Promise<MemoryUpdateWorkerResult> {
  const event = normalizeMemoryUpdateEvent(input)
  const evaluation = await evaluateMemoryUpdateEvent(event, deps)

  if (!evaluation.shouldWrite) {
    return {
      status: 'ignored',
      reason:
        evaluation.ignoredReason ??
        (evaluation.signalTags.length === 0
          ? 'low-information'
          : 'temporary-signal'),
      event,
      evaluation,
    }
  }

  const plan = await resolveMemoryUpdatePlan(event, evaluation, deps)

  return {
    status: 'planned',
    event,
    evaluation,
    plan,
  }
}

export async function dispatchProductMemoryEvent(
  input: Exclude<MemoryUpdateEvent, { source: 'openclaw_proposal' }> | unknown,
  deps: MemoryUpdateWorkerDeps = {}
) {
  const event = normalizeMemoryUpdateEvent(input)

  if (event.source === 'openclaw_proposal') {
    throw new Error(
      'OpenClaw memory proposals must be dispatched through dispatchOpenClawMemoryProposal.'
    )
  }

  return runMemoryUpdateWorker(event, deps)
}

export async function dispatchOpenClawMemoryProposal(
  input: Extract<MemoryUpdateEvent, { source: 'openclaw_proposal' }> | unknown,
  deps: MemoryUpdateWorkerDeps = {}
) {
  const event = normalizeMemoryUpdateEvent(input)

  if (event.source !== 'openclaw_proposal') {
    throw new Error(
      'Only OpenClaw memory proposals can be dispatched through dispatchOpenClawMemoryProposal.'
    )
  }

  return runMemoryUpdateWorker(event, deps)
}

export const scheduleMemoryUpdateEvent =
  createLatestOnlyMemoryUpdateScheduler(async (job) => {
    try {
      return await runMemoryUpdateWorker(job.event)
    } catch (error) {
      console.warn('[memory] worker crashed', {
        orgId: job.event.orgId,
        source: job.event.source,
        dedupeKey: job.event.dedupeKey,
        error: error instanceof Error ? error.message : String(error),
      })

      throw error
    }
  })

function buildDefaultMemoryUpdateDedupeKey(event: MemoryUpdateEvent) {
  switch (event.source) {
    case 'meeting':
      return `meeting:${event.orgId}:${event.payload.meetingSessionId}`
    case 'app_chat':
      return `app-chat:${event.orgId}:${event.payload.threadId}`
    case 'dashboard_assistant':
      return `dashboard-assistant:${event.orgId}:${event.payload.threadId}`
    case 'slack':
      return `slack:${event.orgId}:${event.payload.channelId}:${event.payload.threadTs ?? event.payload.messageTs ?? 'root'}`
    case 'work_item':
      return `work-item:${event.orgId}:${event.payload.workItemId}`
    case 'integration_sync':
      return `integration-sync:${event.orgId}:${event.payload.integration}:${event.payload.externalEntityId ?? event.payload.eventType}`
    case 'user_request':
      return `user-request:${event.orgId}:${event.payload.requestId}`
    case 'openclaw_proposal':
      return `openclaw-proposal:${event.orgId}:${event.payload.proposalId}`
  }
}
