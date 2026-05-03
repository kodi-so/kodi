import type { IncomingMessage, ServerResponse } from 'node:http'
import { verifyInbound } from './verify'
import type { NonceDedupe } from './dedupe'

/**
 * HTTP router for the kodi-bridge plugin's inbound surface.
 *
 * One Node-HTTP handler is registered with OpenClaw at the prefix
 * `/plugins/kodi-bridge/`; we run our own dispatch so we can verify
 * HMAC + dedupe nonces uniformly across every route, and so dynamic
 * segments (`:agentId`, `:approvalId`) work without leaning on a heavy
 * web framework.
 *
 * Routes per implementation-spec § 2.4.5:
 *   - POST /agents/provision          (KOD-381)
 *   - POST /agents/deprovision        (KOD-381)
 *   - POST /agents/update-policy      (KOD-389)
 *   - POST /agents/:agentId/inject    (501 stub)
 *   - POST /agents/:agentId/push-event (501 stub)
 *   - POST /approvals/:id/resolve     (KOD-391)
 *   - POST /config/subscriptions      (KOD-375)
 *   - POST /admin/update              (501 stub — M6)
 *   - POST /admin/reload              (real — runs reload callbacks)
 *
 * Modules register their handlers via the inbound-api factory, which
 * passes them to `createInboundRouter`. Routes without a handler return
 * 501.
 */

export const PLUGIN_PREFIX = '/plugins/kodi-bridge/'

const STUB_ROUTES_EXACT = new Set<string>([
  'admin/update',
])

const PROVISION_ROUTE = 'agents/provision'
const DEPROVISION_ROUTE = 'agents/deprovision'
const UPDATE_POLICY_ROUTE = 'agents/update-policy'
const SUBSCRIPTIONS_ROUTE = 'config/subscriptions'

const STUB_ROUTES_PATTERNED: Array<RegExp> = [
  /^agents\/[^/]+\/inject$/,
  /^agents\/[^/]+\/push-event$/,
]

const APPROVALS_RESOLVE_PATTERN = /^approvals\/([^/]+)\/resolve$/

const RELOAD_ROUTE = 'admin/reload'

export type InboundLogger = Pick<Console, 'log' | 'warn'>

export type ReloadCallback = () => void | Promise<void>

export type SubscriptionsHandler = (rawBody: unknown) => void | Promise<void>

/**
 * Handler shape for `POST /plugins/kodi-bridge/agents/provision`. Returns
 * either a parsed result to be JSON-encoded back to Kodi, or a structured
 * `{ status, body }` to signal a non-200 response (e.g. 400 on bad input).
 * Throwing is reserved for unexpected internal failures (→ 500).
 */
export type ProvisionHandlerResult =
  | { kind: 'ok'; body: Record<string, unknown> }
  | { kind: 'badRequest'; message: string }

export type ProvisionHandler = (
  rawBody: unknown,
) => Promise<ProvisionHandlerResult>

export type DeprovisionHandlerResult =
  | { kind: 'ok'; body: Record<string, unknown> }
  | { kind: 'badRequest'; message: string }

export type DeprovisionHandler = (
  rawBody: unknown,
) => Promise<DeprovisionHandlerResult>

export type UpdatePolicyHandlerResult =
  | { kind: 'ok'; body: Record<string, unknown> }
  | { kind: 'badRequest'; message: string }

export type UpdatePolicyHandler = (
  rawBody: unknown,
) => Promise<UpdatePolicyHandlerResult>

export type ApprovalsResolveRouterResult =
  | { kind: 'ok'; body: Record<string, unknown> }
  | { kind: 'badRequest'; message: string }
  | { kind: 'notFound' }
  | { kind: 'gone' }

/** Handler signature: receives the dynamic `:request_id` from the path
 * plus the parsed body. Returns the same `Result` shape used by the
 * other handlers, with two extra terminal states for 404 / 410. */
export type ApprovalsResolveRouterHandler = (
  requestId: string,
  rawBody: unknown,
) => Promise<ApprovalsResolveRouterResult>

export type CreateInboundRouterDeps = {
  /** Function returning the current plugin HMAC secret. Called per request so KOD-385's rotation can swap it in place. */
  getSecret: () => string
  dedupe: NonceDedupe
  /** Reload callbacks fired in registration order on POST /admin/reload. */
  reloadCallbacks: () => readonly ReloadCallback[]
  /**
   * If set, `POST /plugins/kodi-bridge/config/subscriptions` invokes this
   * handler with the parsed JSON body. Otherwise the route returns 501.
   * Validation lives in the handler (event-bus owns the schema).
   */
  subscriptionsHandler?: SubscriptionsHandler
  /**
   * If set, `POST /plugins/kodi-bridge/agents/provision` invokes this
   * handler. Otherwise the route returns 501. KOD-381 wires it.
   */
  provisionHandler?: ProvisionHandler
  /**
   * If set, `POST /plugins/kodi-bridge/agents/deprovision` invokes this
   * handler. Otherwise the route returns 501.
   */
  deprovisionHandler?: DeprovisionHandler
  /**
   * If set, `POST /plugins/kodi-bridge/agents/update-policy` invokes
   * this handler (KOD-389 — push autonomy policy refreshes from Kodi).
   * Otherwise the route returns 501.
   */
  updatePolicyHandler?: UpdatePolicyHandler
  /**
   * If set, `POST /plugins/kodi-bridge/approvals/:request_id/resolve`
   * invokes this handler (KOD-391). Otherwise the route returns 501.
   */
  approvalsResolveHandler?: ApprovalsResolveRouterHandler
  logger?: InboundLogger
  now?: () => number
}

export type InboundRouter = {
  /** OpenClaw-compatible handler for `api.registerHttpRoute`. */
  handle: (req: IncomingMessage, res: ServerResponse) => Promise<void>
}

async function readRequestBody(req: IncomingMessage): Promise<string> {
  return await new Promise((resolve, reject) => {
    let data = ''
    req.setEncoding('utf8')
    req.on('data', (chunk: string) => {
      data += chunk
    })
    req.on('end', () => resolve(data))
    req.on('error', reject)
  })
}

function writeJson(res: ServerResponse, status: number, body: unknown): void {
  const payload = JSON.stringify(body)
  res.statusCode = status
  res.setHeader('content-type', 'application/json')
  res.setHeader('content-length', Buffer.byteLength(payload).toString())
  res.end(payload)
}

function methodNotAllowed(res: ServerResponse): void {
  writeJson(res, 405, { error: 'Method Not Allowed' })
}

function notFound(res: ServerResponse, subPath: string): void {
  writeJson(res, 404, { error: 'Not Found', path: `/plugins/kodi-bridge/${subPath}` })
}

function notImplemented(res: ServerResponse, subPath: string): void {
  writeJson(res, 501, {
    error: 'Not Implemented',
    code: 'NOT_IMPLEMENTED',
    path: `/plugins/kodi-bridge/${subPath}`,
  })
}

export function isInboundRoute(subPath: string): boolean {
  if (subPath === RELOAD_ROUTE) return true
  if (subPath === SUBSCRIPTIONS_ROUTE) return true
  if (subPath === PROVISION_ROUTE) return true
  if (subPath === DEPROVISION_ROUTE) return true
  if (subPath === UPDATE_POLICY_ROUTE) return true
  if (STUB_ROUTES_EXACT.has(subPath)) return true
  if (APPROVALS_RESOLVE_PATTERN.test(subPath)) return true
  return STUB_ROUTES_PATTERNED.some((pattern) => pattern.test(subPath))
}

export function createInboundRouter(deps: CreateInboundRouterDeps): InboundRouter {
  const {
    getSecret,
    dedupe,
    reloadCallbacks,
    subscriptionsHandler,
    provisionHandler,
    deprovisionHandler,
    updatePolicyHandler,
    approvalsResolveHandler,
    logger = console,
    now,
  } = deps

  async function handle(req: IncomingMessage, res: ServerResponse): Promise<void> {
    if ((req.method ?? 'GET').toUpperCase() !== 'POST') {
      return methodNotAllowed(res)
    }

    const url = new URL(req.url ?? '/', 'http://localhost')
    const path = url.pathname

    if (!path.startsWith(PLUGIN_PREFIX)) {
      return notFound(res, path)
    }

    const subPath = path.slice(PLUGIN_PREFIX.length)
    if (!isInboundRoute(subPath)) {
      return notFound(res, subPath)
    }

    let rawBody: string
    try {
      rawBody = await readRequestBody(req)
    } catch (err) {
      logger.warn(
        JSON.stringify({
          msg: 'inbound body read failed',
          path: subPath,
          error: err instanceof Error ? err.message : String(err),
        }),
      )
      return writeJson(res, 400, { error: 'Bad Request', code: 'BODY_READ_FAILED' })
    }

    const verify = verifyInbound({
      headers: req.headers,
      rawBody,
      secret: getSecret(),
      dedupe,
      now,
    })

    if (!verify.ok) {
      if (verify.code === 'REPLAY') {
        return writeJson(res, 409, { error: 'Replay', code: 'REPLAY' })
      }
      // Don't leak SKEW vs SIGNATURE vs MISSING at the boundary — they all
      // mean "your request didn't authenticate" to the caller.
      logger.warn(
        JSON.stringify({ msg: 'inbound HMAC rejected', path: subPath, code: verify.code }),
      )
      return writeJson(res, 401, { error: 'Unauthorized', code: 'UNAUTHORIZED' })
    }

    let parsedBody: unknown = undefined
    if (rawBody.length > 0) {
      try {
        parsedBody = JSON.parse(rawBody)
      } catch {
        return writeJson(res, 400, { error: 'Bad Request', code: 'BODY_NOT_JSON' })
      }
    }

    if (subPath === SUBSCRIPTIONS_ROUTE) {
      if (!subscriptionsHandler) {
        return notImplemented(res, subPath)
      }
      try {
        await subscriptionsHandler(parsedBody)
        return writeJson(res, 200, { ok: true })
      } catch (err) {
        logger.warn(
          JSON.stringify({
            msg: 'inbound subscriptions handler failed',
            error: err instanceof Error ? err.message : String(err),
          }),
        )
        return writeJson(res, 400, {
          error: 'Bad Request',
          code: 'INVALID_SUBSCRIPTIONS',
          message: err instanceof Error ? err.message : 'invalid subscriptions',
        })
      }
    }

    if (subPath === RELOAD_ROUTE) {
      const callbacks = reloadCallbacks()
      let ran = 0
      let failed = 0
      for (const cb of callbacks) {
        try {
          await cb()
          ran += 1
        } catch (err) {
          failed += 1
          logger.warn(
            JSON.stringify({
              msg: 'inbound reload callback failed',
              error: err instanceof Error ? err.message : String(err),
            }),
          )
        }
      }
      return writeJson(res, 200, { ok: true, ran, failed })
    }

    if (subPath === PROVISION_ROUTE) {
      if (!provisionHandler) return notImplemented(res, subPath)
      try {
        const result = await provisionHandler(parsedBody)
        if (result.kind === 'badRequest') {
          return writeJson(res, 400, {
            error: 'Bad Request',
            code: 'INVALID_BODY',
            message: result.message,
          })
        }
        return writeJson(res, 200, result.body)
      } catch (err) {
        logger.warn(
          JSON.stringify({
            msg: 'inbound provision handler failed',
            error: err instanceof Error ? err.message : String(err),
          }),
        )
        return writeJson(res, 500, {
          error: 'Internal Server Error',
          code: 'PROVISION_FAILED',
        })
      }
    }

    if (subPath === DEPROVISION_ROUTE) {
      if (!deprovisionHandler) return notImplemented(res, subPath)
      try {
        const result = await deprovisionHandler(parsedBody)
        if (result.kind === 'badRequest') {
          return writeJson(res, 400, {
            error: 'Bad Request',
            code: 'INVALID_BODY',
            message: result.message,
          })
        }
        return writeJson(res, 200, result.body)
      } catch (err) {
        logger.warn(
          JSON.stringify({
            msg: 'inbound deprovision handler failed',
            error: err instanceof Error ? err.message : String(err),
          }),
        )
        return writeJson(res, 500, {
          error: 'Internal Server Error',
          code: 'DEPROVISION_FAILED',
        })
      }
    }

    if (subPath === UPDATE_POLICY_ROUTE) {
      if (!updatePolicyHandler) return notImplemented(res, subPath)
      try {
        const result = await updatePolicyHandler(parsedBody)
        if (result.kind === 'badRequest') {
          return writeJson(res, 400, {
            error: 'Bad Request',
            code: 'INVALID_BODY',
            message: result.message,
          })
        }
        return writeJson(res, 200, result.body)
      } catch (err) {
        logger.warn(
          JSON.stringify({
            msg: 'inbound update-policy handler failed',
            error: err instanceof Error ? err.message : String(err),
          }),
        )
        return writeJson(res, 500, {
          error: 'Internal Server Error',
          code: 'UPDATE_POLICY_FAILED',
        })
      }
    }

    const resolveMatch = APPROVALS_RESOLVE_PATTERN.exec(subPath)
    if (resolveMatch) {
      if (!approvalsResolveHandler) return notImplemented(res, subPath)
      const requestId = resolveMatch[1]!
      try {
        const result = await approvalsResolveHandler(requestId, parsedBody)
        if (result.kind === 'badRequest') {
          return writeJson(res, 400, {
            error: 'Bad Request',
            code: 'INVALID_BODY',
            message: result.message,
          })
        }
        if (result.kind === 'notFound') {
          return writeJson(res, 404, {
            error: 'Not Found',
            code: 'UNKNOWN_REQUEST_ID',
            request_id: requestId,
          })
        }
        if (result.kind === 'gone') {
          return writeJson(res, 410, {
            error: 'Gone',
            code: 'APPROVAL_EXPIRED',
            request_id: requestId,
          })
        }
        return writeJson(res, 200, result.body)
      } catch (err) {
        logger.warn(
          JSON.stringify({
            msg: 'inbound approvals-resolve handler failed',
            request_id: requestId,
            error: err instanceof Error ? err.message : String(err),
          }),
        )
        return writeJson(res, 500, {
          error: 'Internal Server Error',
          code: 'RESOLVE_FAILED',
        })
      }
    }

    return notImplemented(res, subPath)
  }

  return { handle }
}
