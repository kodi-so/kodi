import { env } from '../env'

const CF_API = 'https://api.cloudflare.com/client/v4'

function getToken(): string {
  const token = env.CLOUDFLARE_API_TOKEN
  if (!token) throw new Error('CLOUDFLARE_API_TOKEN is not configured')
  return token
}

function getZoneId(): string {
  const zoneId = env.CLOUDFLARE_ZONE_ID
  if (!zoneId) throw new Error('CLOUDFLARE_ZONE_ID is not configured')
  return zoneId
}

interface CloudflareResult {
  success: boolean
  errors: { message: string }[]
  result: { id: string }
}

/**
 * Create a DNS A record for an instance subdomain.
 * Returns the Cloudflare record ID (save to DB for cleanup on deprovision).
 *
 * Records are created with proxied: false — DNS-only so Caddy can get
 * Let's Encrypt TLS certs via ACME HTTP challenge.
 */
export async function createARecord(
  subdomain: string, // full subdomain e.g. "abc123def456.agent.kodi.so"
  ip: string,
): Promise<string> {
  const resp = await fetch(`${CF_API}/zones/${getZoneId()}/dns_records`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${getToken()}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      type: 'A',
      name: subdomain,
      content: ip,
      ttl: 1, // auto
      proxied: false, // DNS-only for Caddy to get Let's Encrypt certs
    }),
  })

  const data = (await resp.json()) as CloudflareResult

  if (!data.success) {
    throw new Error(
      `Cloudflare DNS error: ${data.errors.map((e) => e.message).join(', ')}`,
    )
  }

  return data.result.id
}

/**
 * Delete a DNS A record by record ID.
 */
export async function deleteRecord(recordId: string): Promise<void> {
  const resp = await fetch(
    `${CF_API}/zones/${getZoneId()}/dns_records/${recordId}`,
    {
      method: 'DELETE',
      headers: {
        Authorization: `Bearer ${getToken()}`,
      },
    },
  )

  const data = (await resp.json()) as CloudflareResult

  if (!data.success) {
    throw new Error(
      `Cloudflare DNS delete error: ${data.errors.map((e) => e.message).join(', ')}`,
    )
  }
}
