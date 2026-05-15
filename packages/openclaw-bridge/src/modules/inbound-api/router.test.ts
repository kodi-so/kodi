import { describe, expect, test } from 'bun:test'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { Readable } from 'node:stream'
import { signRequest } from '@kodi/shared/hmac'
import { createInboundRouter, isInboundRoute, PLUGIN_PREFIX } from './router'
import { createNonceDedupe } from './dedupe'

const SECRET = 'test-secret-32-bytes-of-randomness--'
const NOW = 1_750_000_000_000

type FakeResponse = {
  statusCode: number
  headers: Record<string, string>
  body: string
  setHeader(k: string, v: string): void
  end(payload: string): void
}

function fakeReq(opts: {
  method?: string
  url: string
  headers?: Record<string, string>
  body?: string
}): IncomingMessage {
  const stream = Readable.from([opts.body ?? ''])
  const req = stream as unknown as IncomingMessage & { method?: string; url: string; headers: Record<string, string> }
  req.method = opts.method ?? 'POST'
  req.url = opts.url
  req.headers = Object.fromEntries(
    Object.entries(opts.headers ?? {}).map(([k, v]) => [k.toLowerCase(), v]),
  )
  ;(req as unknown as { setEncoding(e: string): void }).setEncoding = () => {}
  return req
}

function fakeRes(): FakeResponse & { res: ServerResponse } {
  const res: FakeResponse = {
    statusCode: 200,
    headers: {},
    body: '',
    setHeader(k, v) {
      res.headers[k.toLowerCase()] = v
    },
    end(payload) {
      res.body = payload
    },
  }
  return Object.assign(res, { res: res as unknown as ServerResponse })
}

function signed(body: string, nonce = '00000000-0000-0000-0000-000000000001') {
  const signature = signRequest({ body, secret: SECRET, timestamp: NOW, nonce })
  return {
    'x-kb-timestamp': String(NOW),
    'x-kb-nonce': nonce,
    'x-kb-signature': signature,
    'content-type': 'application/json',
  }
}

function buildRouter(
  reloadCallbacks: Array<() => void | Promise<void>> = [],
  subscriptionsHandler?: (raw: unknown) => void | Promise<void>,
) {
  const dedupe = createNonceDedupe()
  return {
    dedupe,
    router: createInboundRouter({
      getSecret: () => SECRET,
      dedupe,
      reloadCallbacks: () => reloadCallbacks,
      subscriptionsHandler,
      logger: { log: () => {}, warn: () => {} },
      now: () => NOW,
    }),
  }
}

describe('isInboundRoute', () => {
  test('matches every spec § 2.4.5 route', () => {
    expect(isInboundRoute('agents/provision')).toBe(true)
    expect(isInboundRoute('agents/deprovision')).toBe(true)
    expect(isInboundRoute('agents/update-policy')).toBe(true)
    expect(isInboundRoute('agents/abc-123/inject')).toBe(true)
    expect(isInboundRoute('agents/abc-123/push-event')).toBe(true)
    expect(isInboundRoute('approvals/req-7/resolve')).toBe(true)
    expect(isInboundRoute('config/subscriptions')).toBe(true)
    expect(isInboundRoute('admin/update')).toBe(true)
    expect(isInboundRoute('admin/reload')).toBe(true)
  })

  test('rejects unknown sub-paths', () => {
    expect(isInboundRoute('admin/something-else')).toBe(false)
    expect(isInboundRoute('agents/123/unknown')).toBe(false)
    expect(isInboundRoute('foo/bar')).toBe(false)
  })
})

describe('createInboundRouter — auth', () => {
  test('rejects non-POST with 405', async () => {
    const { router } = buildRouter()
    const res = fakeRes()
    await router.handle(
      fakeReq({ method: 'GET', url: `${PLUGIN_PREFIX}admin/reload`, headers: signed('') }),
      res.res,
    )
    expect(res.statusCode).toBe(405)
  })

  test('rejects unsigned request with 401', async () => {
    const { router } = buildRouter()
    const res = fakeRes()
    await router.handle(
      fakeReq({ url: `${PLUGIN_PREFIX}admin/reload`, body: '' }),
      res.res,
    )
    expect(res.statusCode).toBe(401)
    expect(JSON.parse(res.body).code).toBe('UNAUTHORIZED')
  })

  test('rejects bad-signed request with 401', async () => {
    const { router } = buildRouter()
    const headers = signed('{"x":1}')
    const res = fakeRes()
    await router.handle(
      // body bytes differ from what the signer signed
      fakeReq({ url: `${PLUGIN_PREFIX}admin/reload`, headers, body: '{"x":2}' }),
      res.res,
    )
    expect(res.statusCode).toBe(401)
  })

  test('rejects replayed nonce with 409', async () => {
    const { router } = buildRouter()
    const body = ''
    const headers = signed(body, 'replay-1')
    const first = fakeRes()
    await router.handle(
      fakeReq({ url: `${PLUGIN_PREFIX}admin/reload`, headers, body }),
      first.res,
    )
    expect(first.statusCode).toBe(200)

    const second = fakeRes()
    await router.handle(
      fakeReq({ url: `${PLUGIN_PREFIX}admin/reload`, headers, body }),
      second.res,
    )
    expect(second.statusCode).toBe(409)
    expect(JSON.parse(second.body).code).toBe('REPLAY')
  })
})

describe('createInboundRouter — admin/reload', () => {
  test('runs every reload callback in order and returns counts', async () => {
    const order: string[] = []
    const callbacks = [
      async () => {
        order.push('a')
      },
      async () => {
        order.push('b')
      },
    ]
    const { router } = buildRouter(callbacks)
    const res = fakeRes()
    await router.handle(
      fakeReq({ url: `${PLUGIN_PREFIX}admin/reload`, headers: signed(''), body: '' }),
      res.res,
    )
    expect(res.statusCode).toBe(200)
    expect(JSON.parse(res.body)).toEqual({ ok: true, ran: 2, failed: 0 })
    expect(order).toEqual(['a', 'b'])
  })

  test('failed callbacks are counted but never crash the route', async () => {
    const callbacks = [
      async () => {
        throw new Error('boom')
      },
      async () => {},
    ]
    const { router } = buildRouter(callbacks)
    const res = fakeRes()
    await router.handle(
      fakeReq({ url: `${PLUGIN_PREFIX}admin/reload`, headers: signed(''), body: '' }),
      res.res,
    )
    expect(res.statusCode).toBe(200)
    expect(JSON.parse(res.body)).toEqual({ ok: true, ran: 1, failed: 1 })
  })
})

describe('createInboundRouter — stub routes', () => {
  test('agents/provision returns 501 with NOT_IMPLEMENTED', async () => {
    const { router } = buildRouter()
    const body = '{"org_id":"o","user_id":"u"}'
    const res = fakeRes()
    await router.handle(
      fakeReq({
        url: `${PLUGIN_PREFIX}agents/provision`,
        headers: signed(body),
        body,
      }),
      res.res,
    )
    expect(res.statusCode).toBe(501)
    expect(JSON.parse(res.body).code).toBe('NOT_IMPLEMENTED')
  })

  test('dynamic-segment routes (agents/:id/inject) return 501', async () => {
    const { router } = buildRouter()
    const body = '{"message":"hi"}'
    const res = fakeRes()
    await router.handle(
      fakeReq({
        url: `${PLUGIN_PREFIX}agents/agent-abc/inject`,
        headers: signed(body),
        body,
      }),
      res.res,
    )
    expect(res.statusCode).toBe(501)
  })

  test('unknown sub-path returns 404', async () => {
    const { router } = buildRouter()
    const res = fakeRes()
    await router.handle(
      fakeReq({
        url: `${PLUGIN_PREFIX}foo/bar`,
        headers: signed(''),
        body: '',
      }),
      res.res,
    )
    expect(res.statusCode).toBe(404)
  })

  test('non-prefix path returns 404', async () => {
    const { router } = buildRouter()
    const res = fakeRes()
    await router.handle(
      fakeReq({ url: '/health', headers: signed(''), body: '' }),
      res.res,
    )
    expect(res.statusCode).toBe(404)
  })
})

describe('createInboundRouter — config/subscriptions', () => {
  test('returns 501 when no subscriptionsHandler is wired', async () => {
    const { router } = buildRouter()
    const body = '{"subscriptions":{}}'
    const res = fakeRes()
    await router.handle(
      fakeReq({
        url: `${PLUGIN_PREFIX}config/subscriptions`,
        headers: signed(body),
        body,
      }),
      res.res,
    )
    expect(res.statusCode).toBe(501)
  })

  test('routes the parsed body to subscriptionsHandler and returns 200', async () => {
    const captured: unknown[] = []
    const { router } = buildRouter([], async (raw) => {
      captured.push(raw)
    })
    const body = '{"subscriptions":{"plugin.*":{"enabled":true,"verbosity":"summary"}}}'
    const res = fakeRes()
    await router.handle(
      fakeReq({
        url: `${PLUGIN_PREFIX}config/subscriptions`,
        headers: signed(body),
        body,
      }),
      res.res,
    )
    expect(res.statusCode).toBe(200)
    expect(captured).toHaveLength(1)
    expect((captured[0] as { subscriptions: Record<string, unknown> }).subscriptions['plugin.*']).toBeDefined()
  })

  test('returns 400 INVALID_SUBSCRIPTIONS when the handler throws', async () => {
    const { router } = buildRouter([], async () => {
      throw new Error('bad input')
    })
    const body = '{"subscriptions":{}}'
    const res = fakeRes()
    await router.handle(
      fakeReq({
        url: `${PLUGIN_PREFIX}config/subscriptions`,
        headers: signed(body),
        body,
      }),
      res.res,
    )
    expect(res.statusCode).toBe(400)
    expect(JSON.parse(res.body).code).toBe('INVALID_SUBSCRIPTIONS')
  })
})

describe('createInboundRouter — body parsing', () => {
  test('non-JSON body returns 400 BODY_NOT_JSON', async () => {
    const { router } = buildRouter()
    const body = 'not-json'
    const res = fakeRes()
    await router.handle(
      fakeReq({ url: `${PLUGIN_PREFIX}agents/provision`, headers: signed(body), body }),
      res.res,
    )
    expect(res.statusCode).toBe(400)
    expect(JSON.parse(res.body).code).toBe('BODY_NOT_JSON')
  })

  test('empty body is allowed', async () => {
    const { router } = buildRouter()
    const res = fakeRes()
    await router.handle(
      fakeReq({ url: `${PLUGIN_PREFIX}admin/reload`, headers: signed(''), body: '' }),
      res.res,
    )
    expect(res.statusCode).toBe(200)
  })
})

describe('createInboundRouter — agents/provision + agents/deprovision (KOD-381)', () => {
  function buildRouterWithAgentHandlers(
    provisionResultBody: Record<string, unknown> = {
      openclaw_agent_id: 'agent_xyz',
      composio_status: 'active',
      registered_tool_count: 1,
    },
    deprovisionResultBody: Record<string, unknown> = { ok: true },
  ) {
    const dedupe = createNonceDedupe()
    return {
      dedupe,
      router: createInboundRouter({
        getSecret: () => SECRET,
        dedupe,
        reloadCallbacks: () => [],
        provisionHandler: async (raw) => {
          if (
            !raw ||
            typeof raw !== 'object' ||
            !('user_id' in (raw as Record<string, unknown>))
          ) {
            return { kind: 'badRequest', message: 'missing user_id' }
          }
          return { kind: 'ok', body: provisionResultBody }
        },
        deprovisionHandler: async (raw) => {
          if (
            !raw ||
            typeof raw !== 'object' ||
            !('user_id' in (raw as Record<string, unknown>))
          ) {
            return { kind: 'badRequest', message: 'missing user_id' }
          }
          return { kind: 'ok', body: deprovisionResultBody }
        },
        logger: { log: () => {}, warn: () => {} },
        now: () => NOW,
      }),
    }
  }

  test('provision: valid body → 200 with handler payload', async () => {
    const { router } = buildRouterWithAgentHandlers()
    const body = JSON.stringify({
      org_id: '11111111-1111-4111-8111-111111111111',
      user_id: '22222222-2222-4222-8222-222222222222',
      actions: [],
    })
    const res = fakeRes()
    await router.handle(
      fakeReq({ url: `${PLUGIN_PREFIX}agents/provision`, headers: signed(body), body }),
      res.res,
    )
    expect(res.statusCode).toBe(200)
    expect(JSON.parse(res.body)).toEqual({
      openclaw_agent_id: 'agent_xyz',
      composio_status: 'active',
      registered_tool_count: 1,
    })
  })

  test('provision: bad body → 400 INVALID_BODY', async () => {
    const { router } = buildRouterWithAgentHandlers()
    const body = JSON.stringify({ org_id: 'oops' }) // no user_id
    const res = fakeRes()
    await router.handle(
      fakeReq({ url: `${PLUGIN_PREFIX}agents/provision`, headers: signed(body), body }),
      res.res,
    )
    expect(res.statusCode).toBe(400)
    expect(JSON.parse(res.body).code).toBe('INVALID_BODY')
  })

  test('provision: handler throws → 500 PROVISION_FAILED', async () => {
    const dedupe = createNonceDedupe()
    const router = createInboundRouter({
      getSecret: () => SECRET,
      dedupe,
      reloadCallbacks: () => [],
      provisionHandler: async () => {
        throw new Error('agent-manager exploded')
      },
      logger: { log: () => {}, warn: () => {} },
      now: () => NOW,
    })
    const body = JSON.stringify({ user_id: '22222222-2222-4222-8222-222222222222' })
    const res = fakeRes()
    await router.handle(
      fakeReq({ url: `${PLUGIN_PREFIX}agents/provision`, headers: signed(body), body }),
      res.res,
    )
    expect(res.statusCode).toBe(500)
    expect(JSON.parse(res.body).code).toBe('PROVISION_FAILED')
  })

  test('provision: missing handler → 501 NOT_IMPLEMENTED', async () => {
    const { router } = buildRouter()
    const body = JSON.stringify({ user_id: '22222222-2222-4222-8222-222222222222' })
    const res = fakeRes()
    await router.handle(
      fakeReq({ url: `${PLUGIN_PREFIX}agents/provision`, headers: signed(body), body }),
      res.res,
    )
    expect(res.statusCode).toBe(501)
    expect(JSON.parse(res.body).code).toBe('NOT_IMPLEMENTED')
  })

  test('deprovision: valid body → 200 { ok: true }', async () => {
    const { router } = buildRouterWithAgentHandlers()
    const body = JSON.stringify({
      user_id: '22222222-2222-4222-8222-222222222222',
    })
    const res = fakeRes()
    await router.handle(
      fakeReq({ url: `${PLUGIN_PREFIX}agents/deprovision`, headers: signed(body), body }),
      res.res,
    )
    expect(res.statusCode).toBe(200)
    expect(JSON.parse(res.body)).toEqual({ ok: true })
  })

  test('deprovision: missing user_id → 400', async () => {
    const { router } = buildRouterWithAgentHandlers()
    const body = JSON.stringify({})
    const res = fakeRes()
    await router.handle(
      fakeReq({ url: `${PLUGIN_PREFIX}agents/deprovision`, headers: signed(body), body }),
      res.res,
    )
    expect(res.statusCode).toBe(400)
    expect(JSON.parse(res.body).code).toBe('INVALID_BODY')
  })

  test('deprovision: missing handler → 501', async () => {
    const { router } = buildRouter()
    const body = JSON.stringify({
      user_id: '22222222-2222-4222-8222-222222222222',
    })
    const res = fakeRes()
    await router.handle(
      fakeReq({ url: `${PLUGIN_PREFIX}agents/deprovision`, headers: signed(body), body }),
      res.res,
    )
    expect(res.statusCode).toBe(501)
  })

  test('agent routes still require valid HMAC (smoke test)', async () => {
    const { router } = buildRouterWithAgentHandlers()
    const body = JSON.stringify({ user_id: '22222222-2222-4222-8222-222222222222' })
    const res = fakeRes()
    // Don't sign — should 401
    await router.handle(
      fakeReq({
        url: `${PLUGIN_PREFIX}agents/provision`,
        body,
        headers: { 'content-type': 'application/json' },
      }),
      res.res,
    )
    expect(res.statusCode).toBe(401)
  })
})

describe('createInboundRouter — agents/update-policy (KOD-389)', () => {
  function buildRouterWithUpdatePolicy(opts: {
    badRequest?: boolean
    handlerThrows?: boolean
  } = {}) {
    const dedupe = createNonceDedupe()
    return {
      dedupe,
      router: createInboundRouter({
        getSecret: () => SECRET,
        dedupe,
        reloadCallbacks: () => [],
        updatePolicyHandler: async (raw) => {
          if (opts.handlerThrows) throw new Error('loader broke')
          if (opts.badRequest) return { kind: 'badRequest', message: 'no good' }
          if (
            !raw ||
            typeof raw !== 'object' ||
            !('agent_id' in (raw as Record<string, unknown>))
          ) {
            return { kind: 'badRequest', message: 'missing agent_id' }
          }
          return { kind: 'ok', body: { ok: true } }
        },
        logger: { log: () => {}, warn: () => {} },
        now: () => NOW,
      }),
    }
  }

  test('valid body → 200 { ok: true }', async () => {
    const { router } = buildRouterWithUpdatePolicy()
    const body = JSON.stringify({
      agent_id: 'kodi-member-agent-aaa',
      autonomy_level: 'normal',
      overrides: null,
    })
    const res = fakeRes()
    await router.handle(
      fakeReq({ url: `${PLUGIN_PREFIX}agents/update-policy`, headers: signed(body), body }),
      res.res,
    )
    expect(res.statusCode).toBe(200)
    expect(JSON.parse(res.body)).toEqual({ ok: true })
  })

  test('bad body → 400 INVALID_BODY', async () => {
    const { router } = buildRouterWithUpdatePolicy({ badRequest: true })
    const body = JSON.stringify({ agent_id: 'a' })
    const res = fakeRes()
    await router.handle(
      fakeReq({ url: `${PLUGIN_PREFIX}agents/update-policy`, headers: signed(body), body }),
      res.res,
    )
    expect(res.statusCode).toBe(400)
    expect(JSON.parse(res.body).code).toBe('INVALID_BODY')
  })

  test('handler throws → 500 UPDATE_POLICY_FAILED', async () => {
    const { router } = buildRouterWithUpdatePolicy({ handlerThrows: true })
    const body = JSON.stringify({ agent_id: 'a' })
    const res = fakeRes()
    await router.handle(
      fakeReq({ url: `${PLUGIN_PREFIX}agents/update-policy`, headers: signed(body), body }),
      res.res,
    )
    expect(res.statusCode).toBe(500)
    expect(JSON.parse(res.body).code).toBe('UPDATE_POLICY_FAILED')
  })

  test('no handler wired → 501', async () => {
    const { router } = buildRouter()
    const body = JSON.stringify({ agent_id: 'a' })
    const res = fakeRes()
    await router.handle(
      fakeReq({ url: `${PLUGIN_PREFIX}agents/update-policy`, headers: signed(body), body }),
      res.res,
    )
    expect(res.statusCode).toBe(501)
  })

  test('still requires HMAC', async () => {
    const { router } = buildRouterWithUpdatePolicy()
    const body = JSON.stringify({ agent_id: 'a' })
    const res = fakeRes()
    await router.handle(
      fakeReq({
        url: `${PLUGIN_PREFIX}agents/update-policy`,
        body,
        headers: { 'content-type': 'application/json' },
      }),
      res.res,
    )
    expect(res.statusCode).toBe(401)
  })
})
