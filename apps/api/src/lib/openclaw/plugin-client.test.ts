import { describe, expect, test } from 'bun:test'
import type { Instance } from '@kodi/db'
import { encrypt } from '@kodi/db'
import { pushPluginRoute, pushAdminReload } from './plugin-client'

const SECRET = 'test-secret-32-bytes-of-randomness--'
const NOW = 1_750_000_000_000

function instanceFor(overrides: Partial<Instance> = {}): Instance {
  return {
    id: 'instance-1',
    orgId: 'org-1',
    status: 'running',
    ec2InstanceId: null,
    ipAddress: null,
    hostname: 'instance-abc.agent.kodi.so',
    instanceUrl: null,
    gatewayToken: null,
    dnsRecordId: null,
    litellmCustomerId: null,
    litellmVirtualKey: null,
    errorMessage: null,
    sshUser: 'ubuntu',
    lastHealthCheck: null,
    pluginVersionInstalled: null,
    pluginHmacSecretEncrypted: encrypt(SECRET),
    lastPluginHeartbeatAt: null,
    bundleVersionTarget: null,
    createdAt: new Date(),
    ...overrides,
  }
}

type Captured = { url: string; init: RequestInit | undefined }

function captureFetch(opts: { status?: number; body?: string } = {}) {
  const calls: Captured[] = []
  const fetchImpl = (async (url: string | URL | Request, init?: RequestInit) => {
    calls.push({ url: String(url), init })
    return new Response(opts.body ?? '', { status: opts.status ?? 200 })
  }) as unknown as typeof fetch
  return { fetchImpl, calls }
}

describe('pushPluginRoute', () => {
  test('signs+POSTs to <baseUrl>/plugins/kodi-bridge/<subPath> and returns ok', async () => {
    const { fetchImpl, calls } = captureFetch()
    const result = await pushPluginRoute({
      instance: instanceFor(),
      subPath: 'admin/reload',
      now: () => NOW,
      nonceFactory: () => 'nonce-1',
      fetchImpl,
    })
    expect(result.ok).toBe(true)
    expect(calls).toHaveLength(1)
    expect(calls[0]!.url).toBe(
      'https://instance-abc.agent.kodi.so/plugins/kodi-bridge/admin/reload',
    )
    const headers = calls[0]!.init!.headers as Record<string, string>
    expect(headers['x-kb-timestamp']).toBe(String(NOW))
    expect(headers['x-kb-nonce']).toBe('nonce-1')
    expect(headers['x-kb-signature']).toMatch(/^[a-f0-9]{64}$/)
  })

  test('prefers instance.instanceUrl over hostname', async () => {
    const { fetchImpl, calls } = captureFetch()
    await pushPluginRoute({
      instance: instanceFor({ instanceUrl: 'https://override.example' }),
      subPath: 'admin/reload',
      now: () => NOW,
      nonceFactory: () => 'nonce-1',
      fetchImpl,
    })
    expect(calls[0]!.url).toBe('https://override.example/plugins/kodi-bridge/admin/reload')
  })

  test('returns missing-instance-url when neither URL nor hostname is set', async () => {
    const result = await pushPluginRoute({
      instance: instanceFor({ hostname: null, instanceUrl: null }),
      subPath: 'admin/reload',
    })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.reason).toBe('missing-instance-url')
  })

  test('returns missing-plugin-secret when the HMAC secret is unset', async () => {
    const result = await pushPluginRoute({
      instance: instanceFor({ pluginHmacSecretEncrypted: null }),
      subPath: 'admin/reload',
    })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.reason).toBe('missing-plugin-secret')
  })

  test('returns unauthorized on 401 from the plugin', async () => {
    const { fetchImpl } = captureFetch({ status: 401 })
    const result = await pushPluginRoute({
      instance: instanceFor(),
      subPath: 'admin/reload',
      now: () => NOW,
      nonceFactory: () => 'nonce-1',
      fetchImpl,
    })
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.reason).toBe('unauthorized')
      expect(result.status).toBe(401)
    }
  })

  test('returns http-error for other non-2xx statuses', async () => {
    const { fetchImpl } = captureFetch({ status: 500, body: 'oops' })
    const result = await pushPluginRoute({
      instance: instanceFor(),
      subPath: 'admin/reload',
      now: () => NOW,
      nonceFactory: () => 'nonce-1',
      fetchImpl,
    })
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.reason).toBe('http-error')
      expect(result.status).toBe(500)
      expect(result.error).toBe('oops')
    }
  })

  test('returns request-failed when fetch throws', async () => {
    const fetchImpl = (async () => {
      throw new Error('connection refused')
    }) as unknown as typeof fetch
    const result = await pushPluginRoute({
      instance: instanceFor(),
      subPath: 'admin/reload',
      now: () => NOW,
      nonceFactory: () => 'nonce-1',
      fetchImpl,
    })
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.reason).toBe('request-failed')
      expect(result.error).toContain('connection refused')
    }
  })

  test('signs the JSON-stringified body so the plugin can verify it byte-for-byte', async () => {
    const { fetchImpl, calls } = captureFetch()
    await pushPluginRoute({
      instance: instanceFor(),
      subPath: 'admin/reload',
      body: { hello: 'world' },
      now: () => NOW,
      nonceFactory: () => 'nonce-1',
      fetchImpl,
    })
    expect(calls[0]!.init!.body).toBe('{"hello":"world"}')
  })
})

describe('pushAdminReload', () => {
  test('targets /admin/reload with an empty body', async () => {
    const { fetchImpl, calls } = captureFetch()
    await pushAdminReload(instanceFor(), {
      now: () => NOW,
      nonceFactory: () => 'nonce-1',
      fetchImpl,
    })
    expect(calls[0]!.url.endsWith('/plugins/kodi-bridge/admin/reload')).toBe(true)
    expect(calls[0]!.init!.body).toBe('{}')
  })
})
