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
