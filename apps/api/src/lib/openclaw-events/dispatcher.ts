import { db, eq, instances, type Instance } from '@kodi/db'
import {
  EVENT_KINDS,
  type EventEnvelope,
  type EventKind,
} from '@kodi/shared/events'

/**
 * Per-kind dispatch for events arriving on `/api/openclaw/events`.
 *
 * The route persists every event to `plugin_event_log` first (the audit
 * trail is the source of truth and never depends on the dispatcher
 * succeeding). The dispatcher then runs the side-effect handler — usually
 * a single instances-table update — and any handler throw bubbles to the
 * route as a 500 so the plugin will retry.
 *
 * Per implementation-spec § 4.1 + KOD-377:
 *   - plugin.started     → instances.plugin_version_installed = envelope.plugin_version
 *   - heartbeat          → instances.last_plugin_heartbeat_at = event.occurred_at
 *   - plugin.update_*    → log only (the row in plugin_event_log is the record)
 *   - agent.*            → forwarded to a stub handler (real handler in M4)
 *   - tool.*             → forwarded to a stub handler (real handler in M5)
 *   - message.*, session.*, composio.* → log only
 *
 * Unknown kinds throw `UnknownEventKindError` so the route returns 400
 * (per the ticket: "not silent-drop").
 */

export class UnknownEventKindError extends Error {
  readonly receivedKind: string

  constructor(receivedKind: string) {
    super(`Unknown event kind: ${receivedKind}`)
    this.name = 'UnknownEventKindError'
    this.receivedKind = receivedKind
  }
}

export type DispatchContext = {
  envelope: EventEnvelope
  instance: Instance
  /** Override `Date.now()` for tests. */
  now?: () => number
}

export type EventHandler = (ctx: DispatchContext) => Promise<void>

async function handlePluginStarted({ envelope, instance }: DispatchContext): Promise<void> {
  await db
    .update(instances)
    .set({ pluginVersionInstalled: envelope.plugin_version })
    .where(eq(instances.id, instance.id))
}

async function handleHeartbeat({ envelope, instance }: DispatchContext): Promise<void> {
  // Last-write-wins on the timestamp column. Concurrent heartbeats from the
  // same instance are fine; whichever update completes last is what the read
  // path sees, which is always within seconds of "now" anyway.
  await db
    .update(instances)
    .set({ lastPluginHeartbeatAt: new Date(envelope.event.occurred_at) })
    .where(eq(instances.id, instance.id))
}

/**
 * Stub handlers — the canonical row in `plugin_event_log` is already the
 * record for these events; the M4/M5 work will replace these no-ops with
 * the real lifecycle / audit logic without changing the route.
 */
async function noop(): Promise<void> {
  /* intentional no-op — the event is in plugin_event_log */
}

// KOD-386 reauth recovery: NOT auto-firing rotation from this event.
// The plugin currently emits `composio.session_failed` from
// `registerToolsForAgent` failures (api.registerTool throwing) — auto-
// rotating in response would loop tightly: rotate → re-call provision →
// plugin registration fails again → emits session_failed → rotate → ...
// Bounded only by HTTP latency, so a persistent failure spams the event
// log within seconds.
//
// The intended reauth path: user reauths in Kodi UI → Composio webhook
// fires → existing webhook handler calls triggerAgentRotation. That
// covers the spec's reauth-recovery requirement without an auto-loop.
//
// When the plugin gains explicit `auth_error` reporting from
// `dispatcher.execute` (likely KOD-388), this handler can fire rotation
// for that specific case with a debounce. Until then, the canonical
// row in plugin_event_log is the audit record.

const HANDLERS: Record<EventKind, EventHandler> = {
  'plugin.started': handlePluginStarted,
  'plugin.degraded': noop,
  'plugin.recovered': noop,
  'plugin.update_check': noop,
  'plugin.update_attempted': noop,
  'plugin.update_succeeded': noop,
  'plugin.update_failed': noop,
  'plugin.update_rolled_back': noop,
  heartbeat: handleHeartbeat,
  'agent.provisioned': noop,
  'agent.deprovisioned': noop,
  'agent.failed': noop,
  'agent.bootstrap': noop,
  'message.received': noop,
  'message.sent': noop,
  'session.compact.after': noop,
  'session.ended': noop,
  'tool.invoke.before': noop,
  'tool.invoke.after': noop,
  'tool.denied': noop,
  'tool.approval_requested': noop,
  'tool.approval_resolved': noop,
  'tool.approval_timeout': noop,
  'composio.session_failed': noop,
  'composio.session_rotated': noop,
}

export function isKnownEventKind(kind: string): kind is EventKind {
  return (EVENT_KINDS as readonly string[]).includes(kind)
}

/**
 * Look up and run the handler for an event. Throws
 * `UnknownEventKindError` if the kind isn't in the v1 catalog. Other
 * throws bubble to the caller; the route translates them to 500.
 *
 * Tests can pass `handlers` to override the production map.
 */
export async function dispatchEvent(
  ctx: DispatchContext,
  handlers: Record<EventKind, EventHandler> = HANDLERS,
): Promise<void> {
  const kind = ctx.envelope.event.kind
  if (!isKnownEventKind(kind)) {
    throw new UnknownEventKindError(kind)
  }
  const handler = handlers[kind]
  await handler(ctx)
}

export const eventHandlers = HANDLERS
