import { env } from '../env'

function getBaseUrl(): string {
  const url = env.LITELLM_PROXY_URL
  if (!url) throw new Error('LITELLM_PROXY_URL is not configured')
  return url.replace(/\/$/, '')
}

function getMasterKey(): string {
  const key = env.LITELLM_MASTER_KEY
  if (!key) throw new Error('LITELLM_MASTER_KEY is not configured')
  return key
}

async function litellmFetch(
  path: string,
  options: RequestInit = {},
): Promise<Response> {
  const url = `${getBaseUrl()}${path}`
  console.log(`[litellm] ${options.method ?? 'GET'} ${url}`)

  let resp: Response
  try {
    resp = await fetch(url, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${getMasterKey()}`,
        ...(options.headers as Record<string, string> | undefined),
      },
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error(`[litellm] Network error on ${path}: ${message}`)
    throw new Error(`LiteLLM network error on ${path}: ${message}`)
  }

  if (!resp.ok) {
    const body = await resp.text().catch(() => '')
    console.error(`[litellm] HTTP ${resp.status} on ${path}: ${body}`)
    throw new Error(`LiteLLM API error ${resp.status} on ${path}: ${body}`)
  }

  return resp
}

interface CreateCustomerResult {
  user_id: string
}

/**
 * Create a LiteLLM customer with a monthly budget cap.
 * For Kodi, we use orgId as the customer ID.
 */
export async function createCustomer(
  userId: string,
  maxBudgetDollars: number,
): Promise<CreateCustomerResult> {
  const resp = await litellmFetch('/customer/new', {
    method: 'POST',
    body: JSON.stringify({
      user_id: userId,
      max_budget: maxBudgetDollars,
    }),
  })
  return (await resp.json()) as CreateCustomerResult
}

/**
 * Generate a virtual key with a budget cap.
 * This key goes into openclaw.json on the instance.
 */
export async function generateKey(
  userId: string,
  maxBudgetDollars: number,
): Promise<string> {
  const resp = await litellmFetch('/key/generate', {
    method: 'POST',
    body: JSON.stringify({
      user_id: userId,
      max_budget: maxBudgetDollars,
    }),
  })
  const data = (await resp.json()) as { key: string }
  return data.key
}

interface KeyInfo {
  key: string
  spend: number
  max_budget: number | null
}

/** Get spend info for a key. */
export async function getKeyInfo(virtualKey: string): Promise<KeyInfo> {
  const resp = await litellmFetch(
    `/key/info?key=${encodeURIComponent(virtualKey)}`,
  )
  const data = (await resp.json()) as { info: KeyInfo }
  return data.info
}

/** Update the budget on a virtual key (e.g., on plan upgrade). */
export async function updateKeyBudget(
  virtualKey: string,
  newBudgetDollars: number,
): Promise<void> {
  await litellmFetch('/key/update', {
    method: 'POST',
    body: JSON.stringify({
      key: virtualKey,
      max_budget: newBudgetDollars,
    }),
  })
}

/** Delete a LiteLLM customer (called on deprovision). */
export async function deleteCustomer(userId: string): Promise<void> {
  await litellmFetch('/customer/delete', {
    method: 'POST',
    body: JSON.stringify({
      user_ids: [userId],
    }),
  })
}
