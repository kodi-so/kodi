import { z } from 'zod'
import { type EventKind } from '@kodi/shared/events'

/**
 * Per-instance subscription configuration shared between Kodi and the
 * kodi-bridge plugin. The plugin holds an in-memory copy in
 * `event-bus.setSubscriptions(...)`; Kodi persists the source of truth
 * in `plugin_event_subscriptions.subscriptions` (jsonb).
 *
 * Shape per implementation-spec § 4.2:
 *   {
 *     "<glob-or-kind>": { "enabled": boolean, "verbosity": "summary" | "full" }
 *   }
 *
 * Glob match precedence is owned by the plugin's emitter
 * (`resolveSubscription`): exact > longer prefix > shorter prefix.
 *
 * Kept here (not in @kodi/shared) on purpose — the canonical envelope
 * lives in shared so the wire format is single-sourced; subscriptions
 * are configuration about that envelope and can evolve independently.
 */

export type Verbosity = 'summary' | 'full'
export type SubscriptionEntry = { enabled: boolean; verbosity: Verbosity }
export type Subscriptions = Record<string, SubscriptionEntry>

const FULL_VERBOSITY_KINDS: ReadonlySet<EventKind> = new Set([
  'tool.invoke.after',
  'tool.approval_requested',
])

/**
 * Spec § 4.2 default — used when `plugin_event_subscriptions` has no row
 * for an instance. Every kind enabled at `summary`; the two tool events
 * we always want full verbosity for are explicit.
 */
export function buildDefaultSubscriptions(): Subscriptions {
  return {
    'plugin.*': { enabled: true, verbosity: 'summary' },
    heartbeat: { enabled: true, verbosity: 'summary' },
    'agent.*': { enabled: true, verbosity: 'summary' },
    'message.*': { enabled: true, verbosity: 'summary' },
    'session.*': { enabled: true, verbosity: 'summary' },
    'tool.*': { enabled: true, verbosity: 'summary' },
    'composio.*': { enabled: true, verbosity: 'summary' },
    ...Object.fromEntries(
      Array.from(FULL_VERBOSITY_KINDS).map((kind) => [
        kind,
        { enabled: true, verbosity: 'full' as const },
      ]),
    ),
  }
}

export const SubscriptionEntrySchema = z.object({
  enabled: z.boolean(),
  verbosity: z.enum(['summary', 'full']),
})

export const SubscriptionsSchema = z.record(
  z.string().min(1),
  SubscriptionEntrySchema,
)
