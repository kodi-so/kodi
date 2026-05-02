import type {
  ProvisionInput,
  ProvisionResult,
} from '../agent-manager/provision'
import type { DeprovisionInput, DeprovisionResult } from '../agent-manager/deprovision'
import type { ComposioAction } from '../composio'
import type {
  ProvisionHandler,
  DeprovisionHandler,
  ProvisionHandlerResult,
  DeprovisionHandlerResult,
} from './router'

/**
 * Body parsers + adapters that bridge the inbound HTTP envelope (per
 * implementation-spec § 2.4.5 and KOD-381) into the typed
 * `provisionAgent` / `deprovisionAgent` calls owned by agent-manager.
 *
 * Keep this thin: validation only, no business logic. Anything beyond
 * shape-checking lives in agent-manager + composio.
 */

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}

function parseAction(v: unknown): ComposioAction | null {
  if (!isPlainObject(v)) return null
  const { name, description, parameters, toolkit, action } = v
  if (typeof name !== 'string' || name.length === 0) return null
  if (typeof description !== 'string') return null
  if (typeof toolkit !== 'string' || toolkit.length === 0) return null
  if (typeof action !== 'string' || action.length === 0) return null
  return {
    name,
    description,
    parameters: parameters ?? null,
    toolkit,
    action,
  }
}

export type ParsedProvisionBody = {
  org_id: string
  user_id: string
  composio_session_id: string | null
  actions: ComposioAction[]
  kodi_agent_id?: string
}

/**
 * Parse the inbound `/agents/provision` body. Returns the parsed shape on
 * success, or an error string on validation failure (mapped to 400 by the
 * router).
 */
export function parseProvisionBody(
  raw: unknown,
): ParsedProvisionBody | { error: string } {
  if (!isPlainObject(raw)) return { error: 'body must be a JSON object' }

  const { org_id, user_id, composio_session_id, actions, kodi_agent_id } = raw

  if (typeof org_id !== 'string' || !UUID_RE.test(org_id)) {
    return { error: 'org_id must be a UUID string' }
  }
  if (typeof user_id !== 'string' || !UUID_RE.test(user_id)) {
    return { error: 'user_id must be a UUID string' }
  }

  let normalizedSession: string | null
  if (composio_session_id === undefined || composio_session_id === null) {
    normalizedSession = null
  } else if (typeof composio_session_id === 'string') {
    normalizedSession = composio_session_id
  } else {
    return { error: 'composio_session_id must be a string or null' }
  }

  if (!Array.isArray(actions)) {
    return { error: 'actions must be an array' }
  }
  const parsedActions: ComposioAction[] = []
  for (let i = 0; i < actions.length; i++) {
    const a = parseAction(actions[i])
    if (!a) return { error: `actions[${i}] is not a valid ComposioAction` }
    parsedActions.push(a)
  }

  let parsedKodiAgentId: string | undefined
  if (kodi_agent_id !== undefined) {
    if (typeof kodi_agent_id !== 'string' || !UUID_RE.test(kodi_agent_id)) {
      return { error: 'kodi_agent_id must be a UUID string when provided' }
    }
    parsedKodiAgentId = kodi_agent_id
  }

  return {
    org_id,
    user_id,
    composio_session_id: normalizedSession,
    actions: parsedActions,
    kodi_agent_id: parsedKodiAgentId,
  }
}

export type ParsedDeprovisionBody = {
  user_id: string
}

export function parseDeprovisionBody(
  raw: unknown,
): ParsedDeprovisionBody | { error: string } {
  if (!isPlainObject(raw)) return { error: 'body must be a JSON object' }
  const { user_id } = raw
  if (typeof user_id !== 'string' || !UUID_RE.test(user_id)) {
    return { error: 'user_id must be a UUID string' }
  }
  return { user_id }
}

/**
 * Build the `provisionHandler` the inbound router takes. Captures a
 * function reference rather than the agent-manager module so tests can
 * substitute a mock `provision` directly.
 */
export function createProvisionHandler(
  provision: (input: ProvisionInput) => Promise<ProvisionResult>,
): ProvisionHandler {
  return async (rawBody): Promise<ProvisionHandlerResult> => {
    const parsed = parseProvisionBody(rawBody)
    if ('error' in parsed) {
      return { kind: 'badRequest', message: parsed.error }
    }
    // org_id is captured for audit / future cross-checks against
    // bridge-core identity, but provisionAgent already knows its own org
    // via injected identity. We don't enforce parsed.org_id ===
    // identity.org_id here — that's a security/audit concern best handled
    // at HMAC-verification time (the secret is org-scoped by deployment).
    const result = await provision({
      user_id: parsed.user_id,
      composio_session_id: parsed.composio_session_id,
      actions: parsed.actions,
      kodi_agent_id: parsed.kodi_agent_id,
    })
    return {
      kind: 'ok',
      body: {
        openclaw_agent_id: result.openclaw_agent_id,
        composio_status: result.composio_status,
        registered_tool_count: result.registered_tool_count,
      },
    }
  }
}

export function createDeprovisionHandler(
  deprovision: (input: DeprovisionInput) => Promise<DeprovisionResult>,
): DeprovisionHandler {
  return async (rawBody): Promise<DeprovisionHandlerResult> => {
    const parsed = parseDeprovisionBody(rawBody)
    if ('error' in parsed) {
      return { kind: 'badRequest', message: parsed.error }
    }
    await deprovision({ user_id: parsed.user_id })
    // Per the spec, the response is a flat `{ ok: true }` regardless of
    // whether the agent existed — idempotent contract.
    return { kind: 'ok', body: { ok: true } }
  }
}
