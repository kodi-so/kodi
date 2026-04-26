import { describe, expect, test } from 'bun:test'
import { generateCloudInit, type PluginInstallConfig } from './cloud-init'

const GW_TOKEN = 'a'.repeat(64)
const HMAC_SECRET = 'b'.repeat(64)

const PLUGIN: PluginInstallConfig = {
  version: '2026-04-25-deadbeef',
  bundleUrl: 'https://kodi-plugin-bundles-dev.s3.amazonaws.com/bundles/2026-04-25-deadbeef/kodi-bridge.tgz?X-Amz-Signature=...',
  sha256: 'c'.repeat(64),
  hmacSecret: HMAC_SECRET,
  instanceId: 'inst_abc123',
  orgId: 'org_xyz789',
  kodiApiBaseUrl: 'https://api.kodi.so',
}

const INSTANCE_CONFIG = {
  litellmVirtualKey: 'sk-virtual-key',
  litellmProxyUrl: 'http://litellm.kodi.so',
  hostname: 'abc123.agent.kodi.so',
}

function decodeOpenclawConfig(yaml: string): Record<string, unknown> {
  const match = yaml.match(/echo '([^']+)' \| base64 -d > \/root\/\.openclaw\/openclaw\.json/)
  if (!match) throw new Error('openclaw.json base64 line not found in cloud-init')
  return JSON.parse(Buffer.from(match[1]!, 'base64').toString('utf8'))
}

describe('generateCloudInit (without plugin)', () => {
  test('produces a valid cloud-config without plugin install commands', () => {
    const yaml = generateCloudInit(GW_TOKEN, undefined, INSTANCE_CONFIG)
    expect(yaml).toMatch(/^#cloud-config/)
    expect(yaml).not.toContain('/opt/kodi-bridge/')
    expect(yaml).not.toContain('KODI_BRIDGE_HMAC_SECRET')
    const cfg = decodeOpenclawConfig(yaml)
    expect(cfg.plugins).toBeUndefined()
  })
})

describe('generateCloudInit (with plugin)', () => {
  const yaml = generateCloudInit(GW_TOKEN, undefined, INSTANCE_CONFIG, PLUGIN)

  test('emits download → sha256 verify → extract → symlink swap, in order', () => {
    const downloadIdx = yaml.indexOf("curl -fsSL --retry 5 --retry-delay 5 -o /tmp/kodi-bridge.tgz '")
    const verifyIdx = yaml.indexOf('sha256sum --check')
    const extractIdx = yaml.indexOf('tar -xzf /tmp/kodi-bridge.tgz')
    const symlinkIdx = yaml.indexOf('ln -sfn /opt/kodi-bridge/')

    expect(downloadIdx).toBeGreaterThan(-1)
    expect(verifyIdx).toBeGreaterThan(downloadIdx)
    expect(extractIdx).toBeGreaterThan(verifyIdx)
    expect(symlinkIdx).toBeGreaterThan(extractIdx)
  })

  test('install steps run before systemctl start openclaw', () => {
    const symlinkIdx = yaml.indexOf('ln -sfn /opt/kodi-bridge/')
    const startIdx = yaml.indexOf('systemctl start openclaw')
    expect(symlinkIdx).toBeLessThan(startIdx)
  })

  test('embeds the bundle url, sha256 check, and version dir', () => {
    expect(yaml).toContain(PLUGIN.bundleUrl)
    expect(yaml).toContain(`${PLUGIN.sha256}  /tmp/kodi-bridge.tgz`)
    expect(yaml).toContain(`/opt/kodi-bridge/${PLUGIN.version}`)
  })

  test('writes a systemd drop-in with the secret + gateway token + version', () => {
    expect(yaml).toContain('/etc/systemd/system/openclaw.service.d/kodi-bridge.conf')
    expect(yaml).toContain(`Environment=KODI_BRIDGE_HMAC_SECRET=${HMAC_SECRET}`)
    expect(yaml).toContain(`Environment=OPENCLAW_GATEWAY_TOKEN=${GW_TOKEN}`)
    expect(yaml).toContain(`Environment=PLUGIN_VERSION=${PLUGIN.version}`)
  })

  test('openclaw.json carries plugins.* config with a SecretRef', () => {
    const cfg = decodeOpenclawConfig(yaml) as Record<string, Record<string, unknown>>
    const plugins = cfg.plugins as Record<string, unknown>
    expect((plugins.load as { paths: string[] }).paths).toEqual(['/opt/kodi-bridge/current'])
    expect(plugins.allow).toEqual(['kodi-bridge'])

    const entry = (plugins.entries as Record<string, Record<string, unknown>>)['kodi-bridge']!
    expect(entry.instance_id).toBe(PLUGIN.instanceId)
    expect(entry.org_id).toBe(PLUGIN.orgId)
    expect(entry.kodi_api_base_url).toBe(PLUGIN.kodiApiBaseUrl)
    expect(entry.hmac_secret).toEqual({ $secret: 'KODI_BRIDGE_HMAC_SECRET' })
  })

  test('Caddy reverse proxy includes /plugins/* (so /plugins/kodi-bridge/health is reachable)', () => {
    // Caddyfile is base64-encoded inside the cloud-init YAML; decode and inspect.
    const match = yaml.match(/echo '([A-Za-z0-9+/=]+)' \| base64 -d > \/etc\/caddy\/Caddyfile/)
    expect(match).not.toBeNull()
    const caddyfile = Buffer.from(match![1]!, 'base64').toString('utf8')
    expect(caddyfile).toContain('handle /plugins/*')
    expect(caddyfile).toContain('reverse_proxy localhost:18789')
  })
})
