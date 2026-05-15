import { approvalRequests, db } from '@kodi/db'
import { classifyToolCallForPolicy } from '@kodi/shared/action-class'
import type { EventEnvelope } from '@kodi/shared/events'
import type { Instance } from '@kodi/db'

/**
 * Dispatcher handler for `tool.approval_requested` (KOD-391).
 *
 * The bridge plugin emits this when its KOD-390 interceptor decides to
 * defer a tool call for human approval. We persist a row in the existing
 * `approvalRequests` table so the row shows up alongside Kodi's other
 * approvals (meetings, etc.) in the same UI surface.
 *
 * Discriminator: `subjectType: 'plugin_tool_call'`, `subjectId: <request_id>`.
 * Existing approval flows use other subjectType values (`'tool_action_run'`),
 * so the row coexists without colliding. The decide path (KOD-391's tRPC
 * branch) reads subjectType to route to the right resolver.
 *
 * Idempotency: we look up by (orgId, subjectType, subjectId) before
 * inserting. The route layer's pluginEventLog dedup makes this rare,
 * but a cross-region replay or a manual replay still wants to be safe.
 */

export const PLUGIN_TOOL_CALL_SUBJECT_TYPE = 'plugin_tool_call'
export const PLUGIN_TOOL_CALL_APPROVAL_TYPE = 'plugin_tool_call'

/** Plugin-side default expiry. Mirror it on the Kodi row so the UI can
 * show "expires in X" without a follow-up call. The plugin's queue is
 * authoritative; this is a hint. */
const APPROVAL_EXPIRY_MS = 24 * 60 * 60 * 1000

type ToolApprovalRequestedPayload = {
  request_id: string
  tool_name: string
  args: unknown
  session_key: string
  policy_level: 'strict' | 'normal' | 'lenient' | 'yolo'
}

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}

function parseToolApprovalRequestedPayload(
  payload: unknown,
): ToolApprovalRequestedPayload | null {
  if (!isPlainObject(payload)) return null
  const { request_id, tool_name, args, session_key, policy_level } = payload
  if (typeof request_id !== 'string' || request_id.length === 0) return null
  if (typeof tool_name !== 'string' || tool_name.length === 0) return null
  if (typeof session_key !== 'string') return null
  if (
    typeof policy_level !== 'string' ||
    !['strict', 'normal', 'lenient', 'yolo'].includes(policy_level)
  ) {
    return null
  }
  return {
    request_id,
    tool_name,
    args,
    session_key,
    policy_level: policy_level as ToolApprovalRequestedPayload['policy_level'],
  }
}

/**
 * Parse "composio__<agent_id>__<toolkit>__<action>" into toolkit + action.
 * Returns null when the tool isn't a Composio tool (e.g. memory tools).
 * Stored in `toolkitSlug` / `action` columns for filtering, search, and
 * the UI to render a humanish title.
 */
function parseToolkitAction(
  toolName: string,
): { toolkit: string; action: string } | null {
  const parts = toolName.split('__')
  if (parts.length !== 4 || parts[0] !== 'composio') return null
  const [, , toolkit, action] = parts
  if (!toolkit || !action) return null
  return { toolkit, action }
}

export type CreateToolApprovalRequestedHandlerDeps = {
  /** Database handle. Defaults to the imported `db`; tests inject. */
  db?: typeof db
  /** Override the expiry window. Tests use a small value to verify. */
  expiryMs?: number
  /** Override `Date.now()` for deterministic tests. */
  now?: () => number
  logger?: Pick<Console, 'log' | 'warn' | 'error'>
}

export type DispatchContextLite = {
  envelope: EventEnvelope
  instance: Instance
}

export function createToolApprovalRequestedHandler(
  deps: CreateToolApprovalRequestedHandlerDeps = {},
) {
  const dbInstance = deps.db ?? db
  const expiryMs = deps.expiryMs ?? APPROVAL_EXPIRY_MS
  const now = deps.now ?? Date.now
  const logger = deps.logger ?? console

  return async function handle(ctx: DispatchContextLite): Promise<void> {
    const payload = parseToolApprovalRequestedPayload(ctx.envelope.event.payload)
    if (!payload) {
      // Schema layer already validated the envelope; if we hit this it's
      // a contract drift between events.ts and this handler. Don't
      // throw — drop with a structured warn so the audit row in
      // plugin_event_log remains the source of truth.
      logger.warn(
        JSON.stringify({
          msg: 'tool.approval_requested.bad_payload',
          instance_id: ctx.instance.id,
          idempotency_key: ctx.envelope.event.idempotency_key,
        }),
      )
      return
    }

    // Idempotent on (orgId, subjectType, subjectId). The route layer's
    // pluginEventLog dedup makes this rare, but a cross-region replay
    // or manual re-dispatch still needs to be safe.
    const existing = await dbInstance.query.approvalRequests.findFirst({
      where: (fields, ops) =>
        ops.and(
          ops.eq(fields.orgId, ctx.instance.orgId),
          ops.eq(fields.subjectType, PLUGIN_TOOL_CALL_SUBJECT_TYPE),
          ops.eq(fields.subjectId, payload.request_id),
        ),
    })
    if (existing) {
      logger.warn(
        JSON.stringify({
          msg: 'tool.approval_requested.duplicate',
          instance_id: ctx.instance.id,
          request_id: payload.request_id,
          existing_id: existing.id,
        }),
      )
      return
    }

    const toolkitAction = parseToolkitAction(payload.tool_name)
    const actionCategory = classifyToolCallForPolicy(payload.tool_name)
    const expiresAt = new Date(now() + expiryMs)

    const requestPayload = {
      request_id: payload.request_id,
      tool_name: payload.tool_name,
      args: payload.args,
      session_key: payload.session_key,
      policy_level: payload.policy_level,
      instance_id: ctx.instance.id,
      // Echo agent context if present so the resolver can find the
      // plugin to call (instance lookup) and the UI can attribute
      // the approval to a user.
      kodi_agent_id: ctx.envelope.agent?.agent_id ?? null,
      openclaw_agent_id: ctx.envelope.agent?.openclaw_agent_id ?? null,
      user_id: ctx.envelope.agent?.user_id ?? null,
    }

    const previewPayload = {
      tool_name: payload.tool_name,
      toolkit: toolkitAction?.toolkit ?? null,
      action: toolkitAction?.action ?? null,
      action_category: actionCategory,
      policy_level: payload.policy_level,
      // Kept compact — full args live in requestPayload above.
      args_summary: summarizeArgs(payload.args),
    }

    await dbInstance.insert(approvalRequests).values({
      orgId: ctx.instance.orgId,
      requestedByUserId: ctx.envelope.agent?.user_id ?? null,
      // Plugin-originated approvals don't tie to a meeting / tool action run.
      meetingSessionId: null,
      toolSessionRunId: null,
      sourceType: null,
      sourceId: null,
      toolkitSlug: toolkitAction?.toolkit ?? null,
      connectedAccountId: null,
      action: toolkitAction?.action ?? null,
      actionCategory,
      approvalType: PLUGIN_TOOL_CALL_APPROVAL_TYPE,
      subjectType: PLUGIN_TOOL_CALL_SUBJECT_TYPE,
      subjectId: payload.request_id,
      previewPayload,
      requestPayload,
      expiresAt,
    })
  }
}

function summarizeArgs(args: unknown): string {
  if (args === undefined || args === null) return ''
  let s: string
  try {
    s = JSON.stringify(args)
  } catch {
    s = String(args)
  }
  if (s.length <= 200) return s
  return `${s.slice(0, 197)}…`
}
