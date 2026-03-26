import { env } from '../env'

export interface InstanceConfig {
  litellmVirtualKey: string
  litellmProxyUrl: string
  hostname: string
}

const DEFAULT_MODEL_ID = 'moonshot/kimi-k2.5'

export function generateCloudInit(
  gatewayToken: string,
  adminSshPubKey?: string,
  instanceConfig?: InstanceConfig,
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
    'ExecStart=/usr/bin/openclaw gateway',
    'Restart=on-failure',
    'RestartSec=10',
    'StandardOutput=journal',
    'StandardError=journal',
    '',
    '[Install]',
    'WantedBy=multi-user.target',
  ].join('\\n')

  // Caddy reverse proxy config — HTTPS via Let's Encrypt
  // proxied: false required so Caddy can get Let's Encrypt certs via ACME HTTP challenge
  const caddyfileContent = instanceConfig
    ? Buffer.from(
        [
          `${instanceConfig.hostname} {`,
          `  handle /v1/* {`,
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

  return `#cloud-config
package_update: true
${sshBlock}
runcmd:
  - export HOME=/root && curl -fsSL https://openclaw.ai/install.sh | bash
  - mkdir -p /root/.openclaw
  - echo '${configBase64}' | base64 -d > /root/.openclaw/openclaw.json
  - chmod 700 /root/.openclaw && chmod 600 /root/.openclaw/openclaw.json
  - mkdir -p /root/.openclaw/agents/main/sessions /root/.openclaw/credentials
  - printf '${systemdUnit}' > /etc/systemd/system/openclaw.service
  - systemctl daemon-reload
  - systemctl enable openclaw
  - systemctl start openclaw${caddyBlock}
  - ufw default deny incoming
  - ufw default allow outgoing
  - ufw allow 22/tcp
  - ufw allow 80/tcp
  - ufw allow 443/tcp
  - echo "y" | ufw enable${rootSshCmd}
  - touch /var/lib/cloud/instance/kodi-ready
`
}
