import { randomUUID } from 'node:crypto'
import { decrypt, type Instance } from '@kodi/db'
import { signRequest } from '@kodi/shared/hmac'

/**
 * Kodi → kodi-bridge plugin client.
 *
 * Signs and POSTs to `/plugins/kodi-bridge/<route>` on a given instance,
 * using the instance's plugin HMAC secret. Mirrors what the plugin
 * expects from `verify.ts`: x-kb-timestamp, x-kb-nonce, x-kb-signature.
 *
 * No bearer auth — the plugin's inbound surface verifies by HMAC alone.
 *
 * Used by KOD-379 (push /admin/reload after a subscription update),
 * and any future Kodi-driven plugin operation: agents/provision,
 * agents/update-policy, approvals/:id/resolve, etc.
 */

export type PushResult =
  | { ok: true; status: number; parsedBody?: unknown }
  | {
      ok: false
      reason:
        | 'missing-instance-url'
        | 'missing-plugin-secret'
        | 'decrypt-failed'
        | 'request-failed'
        | 'unauthorized'
        | 'http-error'
      status?: number
      error?: string
    }

export type PushPluginRouteInput = {
  instance: Instance
  /** Sub-path under `/plugins/kodi-bridge/`. e.g. `'admin/reload'`. */
  subPath: string
  /** JSON-serializable body. Defaults to `{}` so an empty POST still has a sigable body. */
  body?: Record<string, unknown> | null
  timeoutMs?: number
  /** Override `Date.now()` and `randomUUID` for tests. */
  now?: () => number
  nonceFactory?: () => string
  fetchImpl?: typeof fetch
}

function resolveInstanceUrl(instance: Instance): string | null {
  if (instance.instanceUrl) return instance.instanceUrl
  if (instance.hostname) return `https://${instance.hostname}`
  if (process.env.OPENCLAW_DEV_URL) return process.env.OPENCLAW_DEV_URL
  return null
}

export async function pushPluginRoute(input: PushPluginRouteInput): Promise<PushResult> {
  const { instance, subPath, body = {}, timeoutMs = 5_000 } = input
  const now = input.now ?? Date.now
  const nonceFactory = input.nonceFactory ?? randomUUID
  const fetchImpl = input.fetchImpl ?? fetch

  const baseUrl = resolveInstanceUrl(instance)
  if (!baseUrl) return { ok: false, reason: 'missing-instance-url' }

  if (!instance.pluginHmacSecretEncrypted) {
    return { ok: false, reason: 'missing-plugin-secret' }
  }

  let secret: string
  try {
    secret = decrypt(instance.pluginHmacSecretEncrypted)
  } catch (err) {
    return {
      ok: false,
      reason: 'decrypt-failed',
      error: err instanceof Error ? err.message : String(err),
    }
  }

  const bodyString = JSON.stringify(body ?? {})
  const timestamp = now()
  const nonce = nonceFactory()
  const signature = signRequest({ body: bodyString, secret, timestamp, nonce })

  const headers: Record<string, string> = {
    'content-type': 'application/json',
    'x-kb-timestamp': String(timestamp),
    'x-kb-nonce': nonce,
    'x-kb-signature': signature,
  }

  const url = `${baseUrl.replace(/\/+$/, '')}/plugins/kodi-bridge/${subPath.replace(/^\/+/, '')}`
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const response = await fetchImpl(url, {
      method: 'POST',
      headers,
      body: bodyString,
      signal: controller.signal,
    })
    clearTimeout(timeoutId)
    if (response.status === 401) {
      return { ok: false, reason: 'unauthorized', status: response.status }
    }
    if (response.status >= 400) {
      const text = await response.text().catch(() => '')
      return {
        ok: false,
        reason: 'http-error',
        status: response.status,
        error: text.slice(0, 200),
      }
    }
    // Best-effort body parse — handlers like /agents/provision return
    // structured JSON, while /admin/reload may return empty. Failing to
    // parse is non-fatal; success without a body is still success.
    let parsedBody: unknown
    const responseText = await response.text().catch(() => '')
    if (responseText.length > 0) {
      try {
        parsedBody = JSON.parse(responseText)
      } catch {
        // ignore — caller treats absence of parsedBody as "no JSON"
      }
    }
    return { ok: true, status: response.status, parsedBody }
  } catch (err) {
    clearTimeout(timeoutId)
    return {
      ok: false,
      reason: 'request-failed',
      error: err instanceof Error ? err.message : String(err),
    }
  }
}

/**
 * Convenience wrapper for the `/admin/reload` push: empty body, short
 * timeout. Used by KOD-379 after a subscription PUT.
 */
export async function pushAdminReload(
  instance: Instance,
  opts: Omit<PushPluginRouteInput, 'instance' | 'subPath' | 'body'> = {},
): Promise<PushResult> {
  return pushPluginRoute({ ...opts, instance, subPath: 'admin/reload', body: {} })
}

/**
 * Body shape for `POST /plugins/kodi-bridge/agents/provision` — see
 * KOD-381 spec § Body. Composio session id and Kodi agent UUID are both
 * optional from the plugin's perspective.
 */
export type AgentProvisionRequestBody = {
  org_id: string
  user_id: string
  composio_session_id?: string | null
  actions: ReadonlyArray<{
    name: string
    description: string
    parameters: unknown
    toolkit: string
    action: string
  }>
  kodi_agent_id?: string
}

export type AgentDeprovisionRequestBody = {
  user_id: string
}

/**
 * Convenience wrapper for `POST /plugins/kodi-bridge/agents/provision`.
 * Used by KOD-383's orchestrator. The response body (when ok=true) is
 * `{ openclaw_agent_id, composio_status, registered_tool_count }`,
 * accessible via `parsedBody`.
 */
export async function pushAgentProvision(
  input: Omit<PushPluginRouteInput, 'subPath' | 'body'> & {
    body: AgentProvisionRequestBody
  },
): Promise<PushResult> {
  return pushPluginRoute({
    ...input,
    subPath: 'agents/provision',
    body: input.body as unknown as Record<string, unknown>,
  })
}

/**
 * Convenience wrapper for `POST /plugins/kodi-bridge/agents/deprovision`.
 */
export async function pushAgentDeprovision(
  input: Omit<PushPluginRouteInput, 'subPath' | 'body'> & {
    body: AgentDeprovisionRequestBody
  },
): Promise<PushResult> {
  return pushPluginRoute({
    ...input,
    subPath: 'agents/deprovision',
    body: input.body as unknown as Record<string, unknown>,
  })
}

export type ApprovalsResolveRequestBody = {
  approved: boolean
  reason?: string
}

/**
 * Convenience wrapper for `POST /plugins/kodi-bridge/approvals/:request_id/resolve`
 * (KOD-391). Plugin-side handler runs the deferred tool, injects the result
 * into the agent's session, and emits `tool.approval_resolved`.
 */
export async function pushApprovalsResolve(
  input: Omit<PushPluginRouteInput, 'subPath' | 'body'> & {
    requestId: string
    body: ApprovalsResolveRequestBody
  },
): Promise<PushResult> {
  return pushPluginRoute({
    ...input,
    subPath: `approvals/${encodeURIComponent(input.requestId)}/resolve`,
    body: input.body as unknown as Record<string, unknown>,
  })
}
