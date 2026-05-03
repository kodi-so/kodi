import { randomUUID } from 'node:crypto'
import {
  classifyToolCallForPolicy,
  type ToolActionClass,
} from '@kodi/shared/action-class'
import type { ApprovalQueue } from './approval-queue'
import type {
  AutonomyLevel,
  AutonomyOverrideAction,
  AutonomyOverrides,
  AutonomyPolicy,
  PolicyLoader,
} from './policy'

/**
 * Autonomy enforcement interceptor (KOD-390 / M5-T2).
 *
 * Wires the four pieces from the M5 prereqs into the OpenClaw
 * `before_tool_call` hook:
 *
 *   - KOD-389: `PolicyLoader.getPolicy(agent_id)` → cached policy
 *   - KOD-394: `classifyToolCallForPolicy(toolName)` → action class
 *   - KOD-415: `ApprovalQueue.enqueue(...)` → durable pending row
 *   - KOD-416: resume primitive — separate code path. The interceptor
 *     never awaits the user's decision; it returns `{ block: true }`
 *     immediately and the resume API injects a follow-up message into
 *     the session when the decision lands hours/days later.
 *
 * The hook must always make a synchronous-looking decision and return.
 * Any await inside this handler holds up the agent's turn and competes
 * with a 30s gateway timeout, so the contract is: do the policy work,
 * fire the network calls (audit event, durable enqueue) without waiting
 * on retries, and return.
 *
 * # Decision flow
 *
 *   1. Resolve the agent. If `ctx.agentId` is missing or unknown, fail
 *      closed (deny). The hook is registered globally; an unknown agent
 *      means we have no policy authority.
 *   2. `loader.getPolicy(kodi_agent_id)` — never throws (KOD-389
 *      contract). Returns the default `normal` policy if Kodi is
 *      unreachable.
 *   3. `classifyToolCallForPolicy(toolName)` — `read` | `draft` |
 *      `write` | `admin`. Unknown verbs fall back to `write`.
 *   4. `evaluatePolicy(policy, toolName, actionClass)` — pure:
 *        a. most-specific override wins (exact > longest prefix glob)
 *        b. else level-rule matrix (spec § 5.2)
 *      → 'allow' | 'deny' | 'ask'
 *   5. Branch:
 *        allow → return (no result; SDK proceeds with the call)
 *        deny  → emit `tool.denied`; return `{ block: true, blockReason }`
 *        ask   → enqueue (durable), emit `tool.approval_requested`;
 *                return `{ block: true, blockReason }` with a
 *                "queued for approval" message that the agent surfaces
 *                back to the user.
 *
 * # Why not the SDK's built-in `requireApproval`?
 *
 * The SDK supports `{ requireApproval: { ... } }` which awaits the
 * decision in-process with a `timeoutMs`. That contradicts our
 * deferred-approval design (the whole point of M5-T8 / KOD-415):
 * decisions can land hours later, after plugin restarts. The SDK's
 * approval loop holds the agent turn open, which would be torn down on
 * restart — losing the action and breaking the user transcript.
 * Instead we use plain `block: true` + the durable queue + the resume
 * primitive (KOD-416).
 */

const DEFAULT_APPROVAL_TTL_MS = 24 * 60 * 60 * 1000 // 24h

export type Decision = 'allow' | 'deny' | 'ask'

/** Match an override pattern against a tool name. Exact > longest glob. */
export function resolveOverride(
  overrides: AutonomyOverrides | null,
  toolName: string,
): AutonomyOverrideAction | null {
  if (!overrides) return null

  // Exact match always wins.
  const exact = overrides[toolName]
  if (exact) return exact

  // Glob: trailing `*` matches any suffix. Longer prefix beats shorter.
  let best: { action: AutonomyOverrideAction; specificity: number } | null = null
  for (const [pattern, action] of Object.entries(overrides)) {
    if (!pattern.endsWith('*')) continue
    const prefix = pattern.slice(0, -1)
    if (prefix.length === 0 || toolName.startsWith(prefix)) {
      if (!best || prefix.length > best.specificity) {
        best = { action, specificity: prefix.length }
      }
    }
  }
  return best?.action ?? null
}

const LEVEL_MATRIX: Record<AutonomyLevel, Record<ToolActionClass, Decision>> = {
  strict: { read: 'ask', draft: 'ask', write: 'ask', admin: 'ask' },
  normal: { read: 'allow', draft: 'allow', write: 'ask', admin: 'ask' },
  lenient: { read: 'allow', draft: 'allow', write: 'allow', admin: 'ask' },
  yolo: { read: 'allow', draft: 'allow', write: 'allow', admin: 'allow' },
}

function overrideToDecision(action: AutonomyOverrideAction): Decision {
  // Names line up — keep an explicit map so a future override-action
  // value (e.g. 'log-only') has to be considered here, not silently
  // proceeding through.
  switch (action) {
    case 'allow':
      return 'allow'
    case 'deny':
      return 'deny'
    case 'ask':
      return 'ask'
  }
}

export function evaluatePolicy(
  policy: AutonomyPolicy,
  toolName: string,
  actionClass: ToolActionClass,
): Decision {
  const override = resolveOverride(policy.overrides, toolName)
  if (override) return overrideToDecision(override)
  return LEVEL_MATRIX[policy.autonomy_level][actionClass]
}

/**
 * Minimal subset of the agent registry the interceptor depends on.
 * Defined here so tests don't need to construct a full registry.
 */
export type InterceptorAgentLookup = {
  getByAgentId: (
    openclawAgentId: string,
  ) => { user_id: string; kodi_agent_id?: string } | undefined
}

export type InterceptorEmitFn = (
  kind: 'tool.denied' | 'tool.approval_requested' | 'tool.invoke.before',
  payload: Record<string, unknown>,
  opts?: {
    agent?: { agent_id: string; openclaw_agent_id: string; user_id: string }
  },
) => Promise<void> | void

export type CreateInterceptorOptions = {
  loader: PolicyLoader
  queue: ApprovalQueue
  registry: InterceptorAgentLookup
  emit: InterceptorEmitFn
  /** Test seam: inject a deterministic uuid for request_id. */
  idGenerator?: () => string
  /** Test seam: override `Date.now()` for timestamps + expiry math. */
  now?: () => number
  /** TTL for an enqueued approval before it auto-expires. Default 24h. */
  approvalTtlMs?: number
  logger?: Pick<Console, 'log' | 'warn' | 'error'>
}

export type BeforeToolCallEvent = {
  toolName: string
  params: Record<string, unknown>
  toolCallId?: string
  runId?: string
}

export type BeforeToolCallContext = {
  agentId?: string
  sessionKey?: string
  toolName: string
  toolCallId?: string
}

export type BeforeToolCallResult =
  | { block: true; blockReason: string }
  | undefined // proceed

export type Interceptor = {
  handleBeforeToolCall: (
    event: BeforeToolCallEvent,
    ctx: BeforeToolCallContext,
  ) => Promise<BeforeToolCallResult>
  /** Exposed for direct unit tests; not used at runtime. */
  evaluate: typeof evaluatePolicy
}

function safeJsonStringify(value: unknown): string {
  try {
    return JSON.stringify(value)
  } catch {
    return '{}'
  }
}

/**
 * Build a compact `args_summary` for `tool.invoke.before` payloads at
 * `summary` verbosity. Capped at 200 chars so high-volume agents don't
 * blow up the event log on a single call. Full args ride alongside at
 * `full` verbosity (the spec's default for tool.invoke.after).
 */
function previewArgsSummary(args: unknown): string {
  const s = safeJsonStringify(args ?? {})
  if (s.length <= 200) return s
  return `${s.slice(0, 197)}…`
}

export function createInterceptor(opts: CreateInterceptorOptions): Interceptor {
  const {
    loader,
    queue,
    registry,
    emit,
    idGenerator = randomUUID,
    now = Date.now,
    approvalTtlMs = DEFAULT_APPROVAL_TTL_MS,
    logger = console,
  } = opts

  async function handleBeforeToolCall(
    event: BeforeToolCallEvent,
    ctx: BeforeToolCallContext,
  ): Promise<BeforeToolCallResult> {
    const toolName = event.toolName
    const sessionKey = ctx.sessionKey ?? ''
    const openclawAgentId = ctx.agentId

    // No agent context → fail closed. Should never happen for a real
    // turn (the runtime always knows whose turn it is), but if it does
    // we cannot evaluate policy and must not let the call through.
    if (!openclawAgentId) {
      logger.warn(
        JSON.stringify({
          msg: 'autonomy.interceptor.no_agent_context',
          tool_name: toolName,
        }),
      )
      return { block: true, blockReason: blockReasonForDeny(toolName, 'no_agent_context') }
    }

    const entry = registry.getByAgentId(openclawAgentId)
    if (!entry) {
      logger.warn(
        JSON.stringify({
          msg: 'autonomy.interceptor.unknown_agent',
          openclaw_agent_id: openclawAgentId,
          tool_name: toolName,
        }),
      )
      return { block: true, blockReason: blockReasonForDeny(toolName, 'unknown_agent') }
    }

    // The policy loader is keyed by the Kodi DB agent UUID. If the
    // bootstrap path hasn't filled it in yet (kodi_agent_id is set by
    // KOD-381's inbound provision route), fall back to the default
    // policy by passing the openclaw runtime ID — the loader will 404
    // and apply the default. This degrades to `normal` until Kodi
    // catches up, which is the right safety stance.
    const policyKey = entry.kodi_agent_id ?? openclawAgentId
    const policy = await loader.getPolicy(policyKey)

    const actionClass = classifyToolCallForPolicy(toolName)
    let decision: Decision
    try {
      decision = evaluatePolicy(policy, toolName, actionClass)
    } catch (err) {
      // Defensive: matrix lookup or override map is malformed.
      logger.error(
        JSON.stringify({
          msg: 'autonomy.interceptor.evaluate_failed',
          tool_name: toolName,
          error: err instanceof Error ? err.message : String(err),
        }),
      )
      return { block: true, blockReason: blockReasonForDeny(toolName, 'evaluate_failed') }
    }

    const agentEnvelope = entry.kodi_agent_id
      ? {
          agent_id: entry.kodi_agent_id,
          openclaw_agent_id: openclawAgentId,
          user_id: entry.user_id,
        }
      : undefined

    if (decision === 'allow') {
      // Audit the call (KOD-393): every allowed invocation produces a
      // `tool.invoke.before` row in plugin_event_log. The `after_tool_call`
      // typed hook fires `tool.invoke.after` once execution completes.
      // Fire-and-forget — failure to emit must not stall the agent's turn.
      void emit(
        'tool.invoke.before',
        {
          tool_name: toolName,
          args_summary: previewArgsSummary(event.params),
          args: event.params,
          session_key: sessionKey,
        },
        agentEnvelope ? { agent: agentEnvelope } : undefined,
      )
      return undefined
    }

    if (decision === 'deny') {
      void emit(
        'tool.denied',
        {
          tool_name: toolName,
          reason: `autonomy ${policy.autonomy_level}`,
          policy_level: policy.autonomy_level,
        },
        agentEnvelope ? { agent: agentEnvelope } : undefined,
      )
      return {
        block: true,
        blockReason: blockReasonForDeny(toolName, `autonomy_${policy.autonomy_level}`),
      }
    }

    // decision === 'ask' — defer.
    const requestId = idGenerator()
    const created = new Date(now()).toISOString()
    const expires = new Date(now() + approvalTtlMs).toISOString()
    try {
      await queue.enqueue({
        request_id: requestId,
        agent_id: entry.kodi_agent_id ?? openclawAgentId,
        session_key: sessionKey,
        tool_name: toolName,
        args_json: safeJsonStringify(event.params),
        created_at: created,
        expires_at: expires,
      })
    } catch (err) {
      // Disk full / queue write failure. Fail closed — don't let the
      // tool run when we couldn't persist a record of asking.
      logger.error(
        JSON.stringify({
          msg: 'autonomy.interceptor.enqueue_failed',
          request_id: requestId,
          tool_name: toolName,
          error: err instanceof Error ? err.message : String(err),
        }),
      )
      return {
        block: true,
        blockReason: blockReasonForDeny(toolName, 'enqueue_failed'),
      }
    }

    void emit(
      'tool.approval_requested',
      {
        request_id: requestId,
        tool_name: toolName,
        args: event.params,
        session_key: sessionKey,
        policy_level: policy.autonomy_level,
      },
      agentEnvelope ? { agent: agentEnvelope } : undefined,
    )

    return {
      block: true,
      blockReason: blockReasonForAsk(toolName, requestId),
    }
  }

  return { handleBeforeToolCall, evaluate: evaluatePolicy }
}

function blockReasonForDeny(toolName: string, code: string): string {
  return `[Kodi · Action denied] ${toolName} blocked by autonomy policy (${code}).`
}

function blockReasonForAsk(toolName: string, requestId: string): string {
  return `[Kodi · Approval required] ${toolName} queued for approval. request_id=${requestId}. The user will see your request and respond — you'll get a follow-up message with the result when they decide.`
}
