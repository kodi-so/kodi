import { env } from '../../env'

export interface InstanceConfig {
  litellmVirtualKey: string
  litellmProxyUrl: string
  hostname: string
}

/**
 * Per-instance kodi-bridge plugin install payload. Optional — if absent
 * (e.g. no plugin version published yet), the cloud-init still produces
 * a working OpenClaw instance, just without the bridge plugin loaded.
 * Kodi can later push an install via the M6 admin update endpoint.
 */
export interface PluginInstallConfig {
  /** Plugin version string (e.g. `2026-04-21-abc1234`). */
  version: string
  /** Presigned S3 URL for the bundle archive. TTL must outlast cloud-init runtime. */
  bundleUrl: string
  /** Hex sha256 of the archive — verified before extraction. */
  sha256: string
  /** 64-char hex HMAC secret used to sign Kodi ↔ plugin requests. */
  hmacSecret: string
  /** Stable instance UUID (instances.id) embedded into the plugin's config. */
  instanceId: string
  /** Owning org UUID, embedded into the plugin's config. */
  orgId: string
  /** Public Kodi API base URL the plugin calls (events, memory, approvals). */
  kodiApiBaseUrl: string
}

const DEFAULT_MODEL_ID = 'moonshot/kimi-k2.5'
const OPENCLAW_VERSION = '2026.3.24'
const PLUGIN_INSTALL_PREFIX = '/opt/kodi-bridge'

export function generateCloudInit(
  gatewayToken: string,
  adminSshPubKey?: string,
  instanceConfig?: InstanceConfig,
  pluginInstall?: PluginInstallConfig,
): string {
  // --- Build openclaw.json config ---
  const openclawConfig: Record<string, unknown> = {
    gateway: {
      mode: 'local',
      bind: 'loopback',
      port: 18789,
      auth: { token: gatewayToken },
      http: {
        endpoints: {
          chatCompletions: { enabled: true },
        },
      },
    },
  }

  if (instanceConfig) {
    // Point at LiteLLM proxy with virtual key — never expose real API keys
    openclawConfig.models = {
      providers: {
        litellm: {
          baseUrl: `${instanceConfig.litellmProxyUrl}/v1`,
          apiKey: instanceConfig.litellmVirtualKey,
          api: 'openai-completions',
          models: [
            {
              id: DEFAULT_MODEL_ID,
              name: DEFAULT_MODEL_ID,
              reasoning: false,
              input: ['text'],
              contextWindow: 262144,
              maxTokens: 32768,
            },
          ],
        },
      },
    }

    openclawConfig.agents = {
      defaults: {
        model: { primary: `litellm/${DEFAULT_MODEL_ID}` },
      },
    }
  }

  // kodi-bridge plugin wiring — only if we have a version to install.
  // SecretRefs reference env vars exported via the systemd drop-in below.
  if (pluginInstall) {
    openclawConfig.plugins = {
      load: {
        paths: [`${PLUGIN_INSTALL_PREFIX}/current`],
      },
      allow: ['kodi-bridge'],
      entries: {
        'kodi-bridge': {
          instance_id: pluginInstall.instanceId,
          org_id: pluginInstall.orgId,
          kodi_api_base_url: pluginInstall.kodiApiBaseUrl,
          hmac_secret: { $secret: 'KODI_BRIDGE_HMAC_SECRET' },
        },
      },
    }
  }

  const configJson = JSON.stringify(openclawConfig, null, 2)
  const configBase64 = Buffer.from(configJson).toString('base64')

  // --- SSH key blocks ---
  const sshBlock = adminSshPubKey
    ? `
ssh_authorized_keys:
  - ${adminSshPubKey}`
    : ''

  const rootSshCmd = adminSshPubKey
    ? `
  - mkdir -p /root/.ssh && chmod 700 /root/.ssh
  - echo '${adminSshPubKey}' >> /root/.ssh/authorized_keys && chmod 600 /root/.ssh/authorized_keys`
    : ''

  // Systemd service file for the OpenClaw gateway daemon
  const systemdUnit = [
    '[Unit]',
    'Description=OpenClaw Gateway',
    'After=network-online.target',
    'Wants=network-online.target',
    '',
    '[Service]',
    'Type=simple',
    'User=root',
    'Group=root',
    'Environment=HOME=/root',
    'Environment=OPENCLAW_NO_AUTO_UPDATE=1',
    'ExecStart=/usr/bin/openclaw gateway',
    'Restart=always',
    'RestartSec=10',
    'StandardOutput=journal',
    'StandardError=journal',
    '',
    '[Install]',
    'WantedBy=multi-user.target',
  ].join('\\n')

  // Systemd drop-in that injects the plugin's secret-ref env vars + the
  // gateway token (so bridge-core's outbound KodiClient finds it). Only
  // emitted when we're installing the plugin.
  const pluginSystemdDropIn = pluginInstall
    ? [
        '[Service]',
        `Environment=KODI_BRIDGE_HMAC_SECRET=${pluginInstall.hmacSecret}`,
        `Environment=OPENCLAW_GATEWAY_TOKEN=${gatewayToken}`,
        `Environment=PLUGIN_VERSION=${pluginInstall.version}`,
      ].join('\\n')
    : null

  // Cloud-init commands that fetch + verify + extract the plugin bundle.
  // sha256 check fails the install if the archive was tampered with in
  // transit; symlink swap is atomic so the gateway either sees the new
  // version or the old one, never a partial.
  const pluginInstallCmds = pluginInstall
    ? [
        `  - mkdir -p ${PLUGIN_INSTALL_PREFIX}/${pluginInstall.version}`,
        `  - curl -fsSL --retry 5 --retry-delay 5 -o /tmp/kodi-bridge.tgz '${pluginInstall.bundleUrl}'`,
        `  - echo '${pluginInstall.sha256}  /tmp/kodi-bridge.tgz' | sha256sum --check`,
        `  - tar -xzf /tmp/kodi-bridge.tgz -C ${PLUGIN_INSTALL_PREFIX}/${pluginInstall.version}/`,
        `  - rm -f /tmp/kodi-bridge.tgz`,
        `  - ln -sfn ${PLUGIN_INSTALL_PREFIX}/${pluginInstall.version} ${PLUGIN_INSTALL_PREFIX}/current`,
        `  - mkdir -p /etc/systemd/system/openclaw.service.d`,
        `  - printf '${pluginSystemdDropIn}' > /etc/systemd/system/openclaw.service.d/kodi-bridge.conf`,
      ].join('\n')
    : null

  // Caddy reverse proxy config — HTTPS via Let's Encrypt
  // proxied: false required so Caddy can get Let's Encrypt certs via ACME HTTP challenge
  const caddyfileContent = instanceConfig
    ? Buffer.from(
        [
          `${instanceConfig.hostname} {`,
          `  handle /v1/* {`,
          `    reverse_proxy localhost:18789`,
          `  }`,
          `  handle /plugins/* {`,
          `    reverse_proxy localhost:18789`,
          `  }`,
          `  handle /health {`,
          `    respond "ok" 200`,
          `  }`,
          `  handle / {`,
          `    respond "ok" 200`,
          `  }`,
          `  handle {`,
          `    respond "not found" 404`,
          `  }`,
          `}`,
        ].join('\n'),
      ).toString('base64')
    : ''

  const caddyBlock = caddyfileContent
    ? `
  - apt-get install -y debian-keyring debian-archive-keyring apt-transport-https curl
  - curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
  - curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' | tee /etc/apt/sources.list.d/caddy-stable.list
  - apt-get update
  - apt-get install -y caddy
  - echo '${caddyfileContent}' | base64 -d > /etc/caddy/Caddyfile
  - systemctl restart caddy`
    : ''

  // Plugin install must happen BEFORE `systemctl start openclaw` so the
  // gateway boots with the bundle in place. The systemd drop-in needs a
  // daemon-reload before start so the env vars are loaded.
  const startSequence = pluginInstall
    ? [
        pluginInstallCmds!,
        `  - systemctl daemon-reload`,
        `  - systemctl enable openclaw`,
        `  - systemctl start openclaw`,
      ].join('\n')
    : [
        `  - systemctl daemon-reload`,
        `  - systemctl enable openclaw`,
        `  - systemctl start openclaw`,
      ].join('\n')

  return `#cloud-config
package_update: true
${sshBlock}
runcmd:
  - export HOME=/root OPENCLAW_VERSION=${OPENCLAW_VERSION} && curl -fsSL https://openclaw.ai/install.sh | bash
  - mkdir -p /root/.openclaw
  - echo '${configBase64}' | base64 -d > /root/.openclaw/openclaw.json
  - chmod 700 /root/.openclaw && chmod 600 /root/.openclaw/openclaw.json
  - mkdir -p /root/.openclaw/agents/main/sessions /root/.openclaw/credentials
  - printf '${systemdUnit}' > /etc/systemd/system/openclaw.service
${startSequence}${caddyBlock}
  - ufw default deny incoming
  - ufw default allow outgoing
  - ufw allow 22/tcp
  - ufw allow 80/tcp
  - ufw allow 443/tcp
  - echo "y" | ufw enable${rootSshCmd}
  - touch /var/lib/cloud/instance/kodi-ready
`
}
