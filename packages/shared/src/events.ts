import { z } from 'zod'

/**
 * Canonical event envelope shared between the kodi-bridge OpenClaw plugin
 * and the Kodi API (`/api/openclaw/events`). Both sides MUST agree on the
 * exact wire format — this file is the single source of truth.
 *
 * Per implementation-spec § 4:
 *
 *   {
 *     "protocol": "kodi-bridge.v1",
 *     "plugin_version": "2026-04-21-abc1234",
 *     "instance": { "instance_id": "...", "org_id": "..." },
 *     "agent":    { "agent_id": "...", "openclaw_agent_id": "...", "user_id": "..." },
 *     "event": {
 *       "kind": "tool.invoke.after",
 *       "verbosity": "full",
 *       "occurred_at": "2026-04-21T10:23:41.123Z",
 *       "idempotency_key": "<uuid v4>",
 *       "payload": { ...kind-specific }
 *     }
 *   }
 *
 * KOD-371 defines the envelope structure and the `EventKind` literal union
 * for every v1 kind. KOD-372 will tighten the per-kind payload schemas in
 * `PayloadByKind`; for now each entry accepts any object so the envelope
 * itself can be parsed and routed without payloads being final.
 */

export const KODI_BRIDGE_PROTOCOL = 'kodi-bridge.v1' as const
export type KodiBridgeProtocol = typeof KODI_BRIDGE_PROTOCOL

/**
 * Every v1 event kind. Order is documentation-only — the spec groups them
 * by domain (lifecycle, agent, session/message, tool, composio) and we
 * preserve that here so the catalog stays scannable.
 */
export const EVENT_KINDS = [
  // Plugin lifecycle
  'plugin.started',
  'plugin.degraded',
  'plugin.recovered',
  'plugin.update_check',
  'plugin.update_attempted',
  'plugin.update_succeeded',
  'plugin.update_failed',
  'plugin.update_rolled_back',
  'heartbeat',

  // Agent lifecycle
  'agent.provisioned',
  'agent.deprovisioned',
  'agent.failed',
  'agent.bootstrap',

  // Session and message
  'message.received',
  'message.sent',
  'session.compact.after',
  'session.ended',

  // Tool
  'tool.invoke.before',
  'tool.invoke.after',
  'tool.denied',
  'tool.approval_requested',
  'tool.approval_resolved',
  'tool.approval_timeout',

  // Composio
  'composio.session_failed',
  'composio.session_rotated',
] as const

export type EventKind = (typeof EVENT_KINDS)[number]

export const EventKindSchema = z.enum(EVENT_KINDS)

export const VerbositySchema = z.enum(['summary', 'full'])
export type Verbosity = z.infer<typeof VerbositySchema>

export const InstanceContextSchema = z.object({
  instance_id: z.string().uuid(),
  org_id: z.string().uuid(),
})
export type InstanceContext = z.infer<typeof InstanceContextSchema>

/**
 * Optional on the envelope: lifecycle events like `plugin.started` and
 * `heartbeat` have no agent context. Agent / session / message / tool events
 * all carry one.
 */
export const AgentContextSchema = z.object({
  agent_id: z.string().uuid(),
  openclaw_agent_id: z.string().min(1),
  user_id: z.string().uuid(),
})
export type AgentContext = z.infer<typeof AgentContextSchema>

/**
 * Per-kind payload schemas, sourced from implementation-spec § 4.1.
 *
 * Verbosity coupling (enforced by `EventInnerSchema.superRefine` below):
 *   - `message.received` / `message.sent`: `content` is required when
 *     `verbosity === 'full'` and forbidden otherwise.
 *   - `tool.invoke.before`: `args` is required when `verbosity === 'full'`
 *     and forbidden otherwise.
 * Both `content_summary` and `args_summary` are always present so the
 * dispatcher can emit something useful at summary verbosity.
 */

const IsoDateTime = z.string().datetime({ offset: true })

const VersionString = z.string().min(1)

const PolicyLevelSchema = z.enum(['strict', 'normal', 'lenient', 'yolo'])

const PluginStartedPayload = z.object({
  pid: z.number().int().nonnegative(),
  started_at: IsoDateTime,
})

const PluginDegradedPayload = z.object({
  reason: z.string().min(1),
  since: IsoDateTime,
})

const PluginRecoveredPayload = z.object({
  since: IsoDateTime,
})

const PluginUpdateCheckPayload = z.object({
  current_version: VersionString,
  latest_version: VersionString,
})

const PluginUpdateTransitionPayload = z.object({
  from_version: VersionString,
  to_version: VersionString,
})

const PluginUpdateFailedPayload = PluginUpdateTransitionPayload.extend({
  error: z.string().min(1),
})

const HeartbeatPayload = z.object({
  uptime_s: z.number().nonnegative(),
  agent_count: z.number().int().nonnegative(),
})

const AgentProvisionedPayload = z.object({
  user_id: z.string().uuid(),
  openclaw_agent_id: z.string().min(1),
  composio_status: z.string().min(1),
})

const AgentDeprovisionedPayload = z.object({
  user_id: z.string().uuid(),
  openclaw_agent_id: z.string().min(1),
})

const AgentFailedPayload = z.object({
  user_id: z.string().uuid(),
  error: z.string().min(1),
})

const AgentBootstrapPayload = z.object({
  session_key: z.string().min(1),
})

const MessagePayload = z.object({
  session_key: z.string().min(1),
  content_summary: z.string(),
  content: z.string().optional(),
  speaker: z.string().min(1),
})

const SessionCompactAfterPayload = z.object({
  session_key: z.string().min(1),
  before_tokens: z.number().int().nonnegative(),
  after_tokens: z.number().int().nonnegative(),
})

const SessionEndedPayload = z.object({
  session_key: z.string().min(1),
  duration_s: z.number().nonnegative(),
})

const ToolInvokeBeforePayload = z.object({
  tool_name: z.string().min(1),
  args_summary: z.string(),
  args: z.unknown().optional(),
  session_key: z.string().min(1),
})

const ToolInvokeAfterPayload = z.object({
  tool_name: z.string().min(1),
  duration_ms: z.number().nonnegative(),
  outcome: z.enum(['ok', 'error']),
  error: z.string().optional(),
})

const ToolDeniedPayload = z.object({
  tool_name: z.string().min(1),
  reason: z.string().min(1),
  policy_level: PolicyLevelSchema,
})

const ToolApprovalRequestedPayload = z.object({
  request_id: z.string().uuid(),
  tool_name: z.string().min(1),
  args: z.unknown(),
  session_key: z.string().min(1),
  policy_level: PolicyLevelSchema,
})

const ToolApprovalResolvedPayload = z.object({
  request_id: z.string().uuid(),
  approved: z.boolean(),
  reason: z.string().optional(),
})

const ToolApprovalTimeoutPayload = z.object({
  request_id: z.string().uuid(),
})

const ComposioSessionFailedPayload = z.object({
  user_id: z.string().uuid(),
  error: z.string().min(1),
})

const ComposioSessionRotatedPayload = z.object({
  user_id: z.string().uuid(),
})

export const PayloadByKind: Record<EventKind, z.ZodTypeAny> = {
  'plugin.started': PluginStartedPayload,
  'plugin.degraded': PluginDegradedPayload,
  'plugin.recovered': PluginRecoveredPayload,
  'plugin.update_check': PluginUpdateCheckPayload,
  'plugin.update_attempted': PluginUpdateTransitionPayload,
  'plugin.update_succeeded': PluginUpdateTransitionPayload,
  'plugin.update_failed': PluginUpdateFailedPayload,
  'plugin.update_rolled_back': PluginUpdateFailedPayload,
  heartbeat: HeartbeatPayload,
  'agent.provisioned': AgentProvisionedPayload,
  'agent.deprovisioned': AgentDeprovisionedPayload,
  'agent.failed': AgentFailedPayload,
  'agent.bootstrap': AgentBootstrapPayload,
  'message.received': MessagePayload,
  'message.sent': MessagePayload,
  'session.compact.after': SessionCompactAfterPayload,
  'session.ended': SessionEndedPayload,
  'tool.invoke.before': ToolInvokeBeforePayload,
  'tool.invoke.after': ToolInvokeAfterPayload,
  'tool.denied': ToolDeniedPayload,
  'tool.approval_requested': ToolApprovalRequestedPayload,
  'tool.approval_resolved': ToolApprovalResolvedPayload,
  'tool.approval_timeout': ToolApprovalTimeoutPayload,
  'composio.session_failed': ComposioSessionFailedPayload,
  'composio.session_rotated': ComposioSessionRotatedPayload,
}

const VERBOSITY_FULL_FIELD: Partial<Record<EventKind, 'content' | 'args'>> = {
  'message.received': 'content',
  'message.sent': 'content',
  'tool.invoke.before': 'args',
}

export const EventInnerSchema = z
  .object({
    kind: EventKindSchema,
    verbosity: VerbositySchema,
    occurred_at: IsoDateTime,
    idempotency_key: z.string().uuid(),
    payload: z.unknown(),
  })
  .superRefine((event, ctx) => {
    const payloadSchema = PayloadByKind[event.kind]
    const parsed = payloadSchema.safeParse(event.payload)
    if (!parsed.success) {
      for (const issue of parsed.error.issues) {
        ctx.addIssue({ ...issue, path: ['payload', ...issue.path] })
      }
      return
    }

    const verbosityField = VERBOSITY_FULL_FIELD[event.kind]
    if (!verbosityField) return

    const payload = parsed.data as Record<string, unknown>
    const fieldPresent = verbosityField in payload && payload[verbosityField] !== undefined

    if (event.verbosity === 'full' && !fieldPresent) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['payload', verbosityField],
        message: `${verbosityField} is required when verbosity is "full"`,
      })
    }
    if (event.verbosity === 'summary' && fieldPresent) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['payload', verbosityField],
        message: `${verbosityField} must be omitted when verbosity is "summary"`,
      })
    }
  })
export type EventInner = z.infer<typeof EventInnerSchema>

export const EventEnvelopeSchema = z.object({
  protocol: z.literal(KODI_BRIDGE_PROTOCOL),
  plugin_version: z.string().min(1),
  instance: InstanceContextSchema,
  agent: AgentContextSchema.optional(),
  event: EventInnerSchema,
})
export type EventEnvelope = z.infer<typeof EventEnvelopeSchema>

export class EventEnvelopeParseError extends Error {
  readonly issues: z.ZodIssue[]

  constructor(zodError: z.ZodError) {
    super(`Invalid event envelope: ${zodError.message}`)
    this.name = 'EventEnvelopeParseError'
    this.issues = zodError.issues
  }
}

/**
 * Parses and validates an event envelope. Throws `EventEnvelopeParseError`
 * on failure with the original zod issues attached for diagnostics.
 */
export function parseEnvelope(json: unknown): EventEnvelope {
  const result = EventEnvelopeSchema.safeParse(json)
  if (!result.success) {
    throw new EventEnvelopeParseError(result.error)
  }
  return result.data
}
