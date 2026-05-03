import type { ApprovalQueue, PendingApproval } from '../autonomy/approval-queue'
import type { ResumeApi, ResumeOutcome } from '../autonomy/resume'
import type { AgentRegistry } from '../agent-manager/registry'
import type {
  ComposioModuleApi,
  RunActionResult,
} from '../composio'

/**
 * Inbound `POST /plugins/kodi-bridge/approvals/:request_id/resolve`.
 *
 * Kodi calls this after the user resolves the approval row in the
 * approvals UI. The body is `{ approved: bool, reason?: string }`.
 *
 * Flow when `approved: true`:
 *   1. Look up the persisted approval in the durable queue (KOD-415).
 *   2. Re-run the original Composio action (KOD-391's runActionForAgent).
 *      The interceptor blocked the agent's tool call so the action
 *      didn't actually execute — we replay it now with the persisted
 *      args.
 *   3. Inject a follow-up message into the agent's session via the
 *      resume primitive (KOD-416). The message describes the result.
 *      Resume marks the queue entry resolved + fires the orphan event
 *      if the session is unreachable.
 *   4. Emit `tool.approval_resolved` to Kodi for the audit trail.
 *
 * Flow when `approved: false`:
 *   1. Look up the persisted approval.
 *   2. Skip execution.
 *   3. Resume.resumeAgentAfterApproval with `{ approved: false, reason }`
 *      to inject a denial message and mark the queue entry `denied`.
 *   4. Emit `tool.approval_resolved` with `approved: false`.
 *
 * Idempotency / status-aware short-circuits:
 *   - request_id unknown                → 404
 *   - already-resolved (any non-pending status) → 200 with `status: 'already_resolved'`,
 *     no side effects (queue + tool already settled)
 *   - expired                            → 410 Gone, ops-relevant signal
 *     to Kodi that the user resolved a stale row (Kodi marks the row
 *     `expired` in the audit table)
 *
 * Even if tool execution fails after approval, we still resume + emit
 * with the failure description so the agent can tell the user "I tried
 * to send that email but Composio said: <error>". Silent drops would
 * leave the user staring at a never-completing approval.
 */

export type ApprovalsResolveBody = {
  approved: boolean
  reason?: string
}

export type ApprovalsResolveResult =
  | {
      kind: 'ok'
      body: {
        status: 'resumed' | 'orphaned' | 'already_resolved'
        run_id?: string
        execution?: {
          status: 'ok' | 'failed' | 'skipped'
          reason?: string
        }
      }
    }
  | { kind: 'badRequest'; message: string }
  | { kind: 'notFound' }
  | { kind: 'gone' }

export type ApprovalsEmitFn = (
  kind: 'tool.approval_resolved',
  payload: { request_id: string; approved: boolean; reason?: string },
  opts?: {
    agent?: { agent_id: string; openclaw_agent_id: string; user_id: string }
  },
) => Promise<void> | void

export type ApprovalsResolveHandler = (
  requestId: string,
  rawBody: unknown,
) => Promise<ApprovalsResolveResult>

export type CreateApprovalsResolveHandlerDeps = {
  queue: ApprovalQueue
  resume: ResumeApi
  composio: ComposioModuleApi
  registry: AgentRegistry
  emit: ApprovalsEmitFn
  logger?: Pick<Console, 'log' | 'warn' | 'error'>
}

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}

export function parseApprovalsResolveBody(
  rawBody: unknown,
): { ok: true; value: ApprovalsResolveBody } | { ok: false; message: string } {
  if (!isPlainObject(rawBody)) {
    return { ok: false, message: 'body must be a JSON object' }
  }
  const { approved, reason } = rawBody
  if (typeof approved !== 'boolean') {
    return { ok: false, message: 'approved must be a boolean' }
  }
  if (reason !== undefined && typeof reason !== 'string') {
    return { ok: false, message: 'reason must be a string when present' }
  }
  return { ok: true, value: { approved, reason } }
}

function safeParseArgs(args_json: string): Record<string, unknown> {
  try {
    const parsed = JSON.parse(args_json)
    if (isPlainObject(parsed)) return parsed
    return {}
  } catch {
    return {}
  }
}

function describeRunFailure(result: RunActionResult & { kind: 'failed' }): string {
  return `${result.reason}: ${result.message}`
}

export function createApprovalsResolveHandler(
  deps: CreateApprovalsResolveHandlerDeps,
): ApprovalsResolveHandler {
  const { queue, resume, composio, registry, emit, logger = console } = deps

  function agentEnvelopeFor(approval: PendingApproval) {
    // The interceptor stores `kodi_agent_id` (or falls back to the
    // openclaw runtime id) in `agent_id`. We need both to populate the
    // event envelope; look up the registry by parsing tool_name.
    // tool_name format: composio__<openclaw_agent_id>__<toolkit>__<action>
    const parts = approval.tool_name.split('__')
    if (parts.length !== 4 || parts[0] !== 'composio') return undefined
    const openclawAgentId = parts[1]!
    const entry = registry.getByAgentId(openclawAgentId)
    if (!entry || !entry.kodi_agent_id) return undefined
    return {
      agent_id: entry.kodi_agent_id,
      openclaw_agent_id: openclawAgentId,
      user_id: entry.user_id,
    }
  }

  async function handle(
    requestId: string,
    rawBody: unknown,
  ): Promise<ApprovalsResolveResult> {
    const parsedBody = parseApprovalsResolveBody(rawBody)
    if (!parsedBody.ok) {
      return { kind: 'badRequest', message: parsedBody.message }
    }
    const { approved, reason } = parsedBody.value

    const approval = await queue.get(requestId)
    if (!approval) {
      return { kind: 'notFound' }
    }

    if (approval.status === 'expired') {
      return { kind: 'gone' }
    }

    if (approval.status !== 'pending') {
      // Idempotent. Kodi has the canonical decision in its DB, plugin
      // has already done the work — return 200 so Kodi treats this as
      // success and stops retrying.
      logger.warn(
        JSON.stringify({
          msg: 'approvals.resolve.duplicate',
          request_id: requestId,
          existing_status: approval.status,
        }),
      )
      return { kind: 'ok', body: { status: 'already_resolved' } }
    }

    // Run the tool if approved. We intentionally do this BEFORE calling
    // resume so the result message is grounded in actual outcome — the
    // user shouldn't be told "approval granted, action ran" when in
    // fact Composio returned an OAuth error.
    let executionStatus: 'ok' | 'failed' | 'skipped' = 'skipped'
    let executionReason: string | undefined
    let resultPayload: unknown = undefined

    if (approved) {
      const params = safeParseArgs(approval.args_json)
      // Look up user_id from the registry via the openclaw_agent_id
      // encoded in tool_name. Without it we can't dispatch — fall back
      // to "could not resolve user, skipping execution" so the agent
      // hears about it.
      const parts = approval.tool_name.split('__')
      const openclawAgentId =
        parts.length === 4 && parts[0] === 'composio' ? parts[1]! : ''
      const entry = openclawAgentId
        ? registry.getByAgentId(openclawAgentId)
        : undefined
      if (!entry) {
        executionStatus = 'failed'
        executionReason =
          'Could not resolve the agent registry entry for this approval.'
      } else {
        const runOutcome = await composio.runActionForAgent({
          tool_name: approval.tool_name,
          params,
          user_id: entry.user_id,
        })
        if (runOutcome.kind === 'ok') {
          executionStatus = 'ok'
          resultPayload = runOutcome.payload
        } else {
          executionStatus = 'failed'
          executionReason = describeRunFailure(runOutcome)
        }
      }
    }

    // Compose the resume input. On a successful run, send the payload as
    // result; on a failed run, the message becomes "Approval granted but
    // the action failed: <reason>" via the result string.
    const resumeOutcome: ResumeOutcome = approved
      ? await resume.resumeAgentAfterApproval({
          request_id: requestId,
          approved: true,
          result:
            executionStatus === 'ok'
              ? resultPayload
              : `Approval granted but the action could not run: ${executionReason ?? 'unknown error'}`,
        })
      : await resume.resumeAgentAfterApproval({
          request_id: requestId,
          approved: false,
          reason,
        })

    // Emit the audit event regardless of resume outcome. Kodi gets the
    // record even if the agent session was unreachable.
    void emit(
      'tool.approval_resolved',
      { request_id: requestId, approved, reason },
      agentEnvelopeFor(approval) ? { agent: agentEnvelopeFor(approval)! } : undefined,
    )

    if (resumeOutcome.kind === 'orphaned') {
      return {
        kind: 'ok',
        body: {
          status: 'orphaned',
          execution: {
            status: executionStatus,
            ...(executionReason ? { reason: executionReason } : {}),
          },
        },
      }
    }

    return {
      kind: 'ok',
      body: {
        status: 'resumed',
        run_id: resumeOutcome.runId,
        execution: {
          status: executionStatus,
          ...(executionReason ? { reason: executionReason } : {}),
        },
      },
    }
  }

  return handle
}
