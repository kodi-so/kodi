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
 * Per-kind payload schemas. KOD-371 ships placeholders that accept any
 * object so the envelope round-trips end-to-end while we wire up the
 * remaining M3 work. KOD-372 replaces each placeholder with the concrete
 * shape from the catalog.
 */
const placeholderPayload = z.object({}).passthrough()

export const PayloadByKind: Record<EventKind, z.ZodTypeAny> = EVENT_KINDS.reduce(
  (acc, kind) => {
    acc[kind] = placeholderPayload
    return acc
  },
  {} as Record<EventKind, z.ZodTypeAny>,
)

export const EventInnerSchema = z.object({
  kind: EventKindSchema,
  verbosity: VerbositySchema,
  occurred_at: z.string().datetime({ offset: true }),
  idempotency_key: z.string().uuid(),
  payload: placeholderPayload,
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
