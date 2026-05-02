import type { OpenClawPluginApi } from 'openclaw/plugin-sdk'
import type { Emitter } from './emitter'

/**
 * Subscribes the plugin to OpenClaw's runtime hooks and translates each
 * fired hook into a typed event via the emitter.
 *
 * The hook string format is `<type>:<action>` per OpenClaw's `registerHook`
 * API; each handler receives an `InternalHookEvent` with
 *   { type, action, sessionKey, context, timestamp, messages }.
 *
 * Five hooks per implementation-spec § 4.1 + KOD-373:
 *   - `message:received`      → emits `message.received`
 *   - `message:sent`          → emits `message.sent`
 *   - `session:compact:after` → emits `session.compact.after`
 *   - `command:new`           → emits `agent.bootstrap` (first command of a
 *                                session is treated as bootstrap)
 *   - `agent:bootstrap`       → emits `agent.bootstrap`
 *
 * Payload extraction is defensive: `context` is `Record<string, unknown>`,
 * so we coerce the few fields we care about and fall back to safe defaults
 * when the runtime version doesn't supply them. `args` and `content` are
 * intentionally omitted at summary verbosity (the envelope's superRefine
 * enforces this — see KOD-372).
 */

type InternalHookEvent = {
  type: string
  action: string
  sessionKey: string
  context: Record<string, unknown>
  timestamp: Date
  messages: string[]
}

type HookHandler = (event: InternalHookEvent) => Promise<void> | void

const HOOK_NAMES = [
  'message:received',
  'message:sent',
  'session:compact:after',
  'command:new',
  'agent:bootstrap',
] as const

export type HookName = (typeof HOOK_NAMES)[number]

function asString(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : fallback
}

function asNumber(value: unknown, fallback = 0): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback
}

function summarize(value: unknown, max = 80): string {
  const str = typeof value === 'string' ? value : ''
  if (str.length <= max) return str
  return `${str.slice(0, max)}…`
}

export function buildMessageReceivedHandler(emitter: Emitter): HookHandler {
  return async (event) => {
    const body = asString(event.context.body ?? event.context.text)
    const speaker = asString(event.context.speaker ?? event.context.role, 'user')
    await emitter.emit('message.received', {
      session_key: event.sessionKey,
      content_summary: summarize(body),
      speaker,
    })
  }
}

export function buildMessageSentHandler(emitter: Emitter): HookHandler {
  return async (event) => {
    const body = asString(event.context.body ?? event.context.text)
    const speaker = asString(event.context.speaker ?? event.context.role, 'assistant')
    await emitter.emit('message.sent', {
      session_key: event.sessionKey,
      content_summary: summarize(body),
      speaker,
    })
  }
}

export function buildSessionCompactAfterHandler(emitter: Emitter): HookHandler {
  return async (event) => {
    await emitter.emit('session.compact.after', {
      session_key: event.sessionKey,
      before_tokens: asNumber(event.context.before_tokens ?? event.context.beforeTokens),
      after_tokens: asNumber(event.context.after_tokens ?? event.context.afterTokens),
    })
  }
}

export function buildCommandNewHandler(emitter: Emitter): HookHandler {
  return async (event) => {
    await emitter.emit('agent.bootstrap', { session_key: event.sessionKey })
  }
}

export function buildAgentBootstrapHandler(emitter: Emitter): HookHandler {
  return async (event) => {
    await emitter.emit('agent.bootstrap', { session_key: event.sessionKey })
  }
}

export type HookBindings = Record<HookName, HookHandler>

export function buildHookBindings(emitter: Emitter): HookBindings {
  return {
    'message:received': buildMessageReceivedHandler(emitter),
    'message:sent': buildMessageSentHandler(emitter),
    'session:compact:after': buildSessionCompactAfterHandler(emitter),
    'command:new': buildCommandNewHandler(emitter),
    'agent:bootstrap': buildAgentBootstrapHandler(emitter),
  }
}

export function registerHookBindings(api: OpenClawPluginApi, emitter: Emitter): HookBindings {
  const bindings = buildHookBindings(emitter)
  for (const [hookName, handler] of Object.entries(bindings) as Array<[HookName, HookHandler]>) {
    api.registerHook(hookName, handler as never)
  }
  return bindings
}

export { HOOK_NAMES }
