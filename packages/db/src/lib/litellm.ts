interface LiteLLMClient {
  createCustomer(
    userId: string,
    maxBudgetDollars: number,
  ): Promise<{ user_id: string }>
  generateKey(userId: string, maxBudgetDollars: number): Promise<string>
  getKeyInfo(
    virtualKey: string,
  ): Promise<{ key: string; spend: number; max_budget: number | null }>
  updateKeyBudget(
    virtualKey: string,
    newBudgetDollars: number,
  ): Promise<void>
  deleteCustomer(userId: string): Promise<void>
}

export function createLiteLLMClient(
  baseUrl: string,
  masterKey: string,
): LiteLLMClient {
  const url = baseUrl.replace(/\/$/, '')

  async function litellmFetch(
    path: string,
    options: RequestInit = {},
  ): Promise<Response> {
    const fullUrl = `${url}${path}`
    console.log(`[litellm] ${options.method ?? 'GET'} ${fullUrl}`)

    let resp: Response
    try {
      resp = await fetch(fullUrl, {
        ...options,
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${masterKey}`,
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

  return {
    async createCustomer(userId, maxBudgetDollars) {
      const resp = await litellmFetch('/customer/new', {
        method: 'POST',
        body: JSON.stringify({
          user_id: userId,
          max_budget: maxBudgetDollars,
        }),
      })
      return (await resp.json()) as { user_id: string }
    },

    async generateKey(userId, maxBudgetDollars) {
      const resp = await litellmFetch('/key/generate', {
        method: 'POST',
        body: JSON.stringify({
          user_id: userId,
          max_budget: maxBudgetDollars,
        }),
      })
      const data = (await resp.json()) as { key: string }
      return data.key
    },

    async getKeyInfo(virtualKey) {
      const resp = await litellmFetch(
        `/key/info?key=${encodeURIComponent(virtualKey)}`,
      )
      const data = (await resp.json()) as {
        info: { key: string; spend: number; max_budget: number | null }
      }
      return data.info
    },

    async updateKeyBudget(virtualKey, newBudgetDollars) {
      await litellmFetch('/key/update', {
        method: 'POST',
        body: JSON.stringify({
          key: virtualKey,
          max_budget: newBudgetDollars,
        }),
      })
    },

    async deleteCustomer(userId) {
      await litellmFetch('/customer/delete', {
        method: 'POST',
        body: JSON.stringify({ user_ids: [userId] }),
      })
    },
  }
}
