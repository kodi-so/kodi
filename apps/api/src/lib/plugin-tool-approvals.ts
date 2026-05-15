import { approvalRequests, db, eq } from '@kodi/db'
import { pushApprovalsResolve, type PushResult } from './openclaw/plugin-client'
import {
  PLUGIN_TOOL_CALL_APPROVAL_TYPE,
  PLUGIN_TOOL_CALL_SUBJECT_TYPE,
} from './openclaw-events/tool-approval-handlers'

/**
 * Decide a plugin-originated approval (KOD-391 / M5-T3, Kodi side).
 *
 * This is the counterpart to `decideToolApprovalRequest` in
 * `tool-access-approvals.ts`. Existing tool-access approvals run the
 * tool from Kodi (Composio session created Kodi-side). Plugin-originated
 * approvals run the tool *inside the plugin* — the plugin already holds
 * the per-agent Composio session and the registered-tool surface. So
 * we forward the user's decision to the plugin via signed POST and let
 * it do the work.
 *
 * Decide flow:
 *   1. Load the approvalRequests row by id; verify it's the plugin
 *      type and still pending.
 *   2. Resolve the originating instance via the requestPayload's
 *      `instance_id`.
 *   3. POST `/plugins/kodi-bridge/approvals/:request_id/resolve` with
 *      `{ approved, reason? }`.
 *   4. On 200: mark the row `approved`/`rejected` accordingly. The
 *      plugin owns the actual tool execution and the resume; we just
 *      record the decision.
 *   5. On 410 from plugin (queue expired): mark the row `expired`.
 *      On 404 from plugin (request_id unknown to plugin): mark the
 *      row `expired` too — there's nothing to act on.
 *   6. On other plugin failures: throw so the caller surfaces a 5xx
 *      and the user can retry.
 *
 * Idempotent on duplicate decide calls — second call hits the
 * status check at step 1 and returns the existing row's resolution
 * without re-calling the plugin.
 */

export type DecidePluginToolApprovalInput = {
  approvalRequestId: string
  orgId: string
  decidedByUserId: string
  decision: 'approved' | 'rejected'
  reason?: string
  /** Test seam — defaults to the imported `db`. */
  db?: typeof db
  /** Test seam — defaults to the production `pushApprovalsResolve`. */
  pushFn?: typeof pushApprovalsResolve
  now?: () => number
  logger?: Pick<Console, 'log' | 'warn' | 'error'>
}

export type DecidePluginToolApprovalResult = {
  approvalRequestId: string
  status: 'approved' | 'rejected' | 'expired' | 'already_decided'
  message: string
}

export class PluginToolApprovalError extends Error {
  readonly code: string
  readonly httpStatus: number
  constructor(code: string, message: string, httpStatus = 400) {
    super(message)
    this.name = 'PluginToolApprovalError'
    this.code = code
    this.httpStatus = httpStatus
  }
}

function asRecord(v: unknown): Record<string, unknown> | null {
  if (typeof v === 'object' && v !== null && !Array.isArray(v)) {
    return v as Record<string, unknown>
  }
  return null
}

export async function decidePluginToolApproval(
  input: DecidePluginToolApprovalInput,
): Promise<DecidePluginToolApprovalResult> {
  const dbInstance = input.db ?? db
  const pushFn = input.pushFn ?? pushApprovalsResolve
  const now = input.now ?? Date.now
  const logger = input.logger ?? console

  const row = await dbInstance.query.approvalRequests.findFirst({
    where: (fields, ops) =>
      ops.and(
        ops.eq(fields.id, input.approvalRequestId),
        ops.eq(fields.orgId, input.orgId),
      ),
  })
  if (!row) {
    throw new PluginToolApprovalError(
      'NOT_FOUND',
      'Approval request not found.',
      404,
    )
  }
  if (
    row.approvalType !== PLUGIN_TOOL_CALL_APPROVAL_TYPE ||
    row.subjectType !== PLUGIN_TOOL_CALL_SUBJECT_TYPE
  ) {
    throw new PluginToolApprovalError(
      'WRONG_TYPE',
      'This approval is not a plugin-originated tool call.',
    )
  }
  if (row.status !== 'pending') {
    return {
      approvalRequestId: row.id,
      status: 'already_decided',
      message: `Already decided (${row.status}).`,
    }
  }
  if (row.expiresAt && row.expiresAt.getTime() < now()) {
    await dbInstance
      .update(approvalRequests)
      .set({
        status: 'expired',
        decidedAt: new Date(now()),
        decidedByUserId: input.decidedByUserId,
      })
      .where(eq(approvalRequests.id, row.id))
    return {
      approvalRequestId: row.id,
      status: 'expired',
      message: 'This approval expired before it was decided.',
    }
  }

  const requestPayload = asRecord(row.requestPayload)
  const requestIdRaw = requestPayload?.request_id
  const instanceIdRaw = requestPayload?.instance_id
  const requestId = typeof requestIdRaw === 'string' ? requestIdRaw : null
  const instanceId = typeof instanceIdRaw === 'string' ? instanceIdRaw : null
  if (!requestId || !instanceId) {
    throw new PluginToolApprovalError(
      'INVALID_PAYLOAD',
      'Approval row is missing the original request_id or instance_id.',
    )
  }

  const instance = await dbInstance.query.instances.findFirst({
    where: (fields, ops) => ops.eq(fields.id, instanceId),
  })
  if (!instance) {
    throw new PluginToolApprovalError(
      'INSTANCE_GONE',
      'The originating Kodi instance is no longer registered.',
    )
  }

  const result: PushResult = await pushFn({
    instance,
    requestId,
    body: {
      approved: input.decision === 'approved',
      ...(input.reason ? { reason: input.reason } : {}),
    },
  })

  if (!result.ok) {
    if (result.status === 404 || result.status === 410) {
      // Plugin says: request_id unknown or expired. The plugin's queue
      // is the source of truth — mark our row expired and stop retrying.
      await dbInstance
        .update(approvalRequests)
        .set({
          status: 'expired',
          decidedAt: new Date(now()),
          decidedByUserId: input.decidedByUserId,
        })
        .where(eq(approvalRequests.id, row.id))
      return {
        approvalRequestId: row.id,
        status: 'expired',
        message:
          result.status === 410
            ? 'The plugin has already expired this approval.'
            : 'The plugin no longer has a record of this approval.',
      }
    }
    logger.warn(
      JSON.stringify({
        msg: 'plugin_tool_approval.push_failed',
        approval_request_id: row.id,
        request_id: requestId,
        instance_id: instanceId,
        status: result.status,
        reason: result.reason,
        error: result.error,
      }),
    )
    throw new PluginToolApprovalError(
      'PLUGIN_CALL_FAILED',
      `Plugin rejected the resolve request: ${result.reason}${result.error ? ` (${result.error})` : ''}`,
      result.status === 401 ? 401 : 502,
    )
  }

  // Plugin accepted. Mark the row resolved with the user's decision.
  // The plugin owns the actual side effects (tool run + agent resume);
  // we just record the decision in our audit table.
  const finalStatus = input.decision === 'approved' ? 'approved' : 'rejected'
  await dbInstance
    .update(approvalRequests)
    .set({
      status: finalStatus,
      decidedAt: new Date(now()),
      decidedByUserId: input.decidedByUserId,
    })
    .where(eq(approvalRequests.id, row.id))

  return {
    approvalRequestId: row.id,
    status: finalStatus,
    message:
      input.decision === 'approved'
        ? 'Approval granted; the plugin will run the action and reply in the agent session.'
        : 'Approval denied; the plugin will tell the agent.',
  }
}

export type PluginToolApprovalLookup = {
  id: string
  isPluginToolCall: boolean
}

/**
 * Lightweight check used by the tRPC `approval.decide` branch — given an
 * approvalRequestId, tell the caller whether to route to
 * `decidePluginToolApproval` or `decideToolApprovalRequest`.
 *
 * Decoupled from the full row so the caller can keep the row hidden
 * behind its existing access path without re-querying.
 */
export function isPluginToolCallApproval(row: {
  approvalType: string
  subjectType: string
}): boolean {
  return (
    row.approvalType === PLUGIN_TOOL_CALL_APPROVAL_TYPE &&
    row.subjectType === PLUGIN_TOOL_CALL_SUBJECT_TYPE
  )
}

// Re-export the discriminator constants so callers can route by them
// without importing two files.
export { PLUGIN_TOOL_CALL_APPROVAL_TYPE, PLUGIN_TOOL_CALL_SUBJECT_TYPE } from './openclaw-events/tool-approval-handlers'
