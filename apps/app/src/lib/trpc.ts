import { createTRPCClient, httpBatchLink } from '@trpc/client'
import type { AppRouter } from '@kodi/api'

function getApiUrl() {
  return process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3002'
}

export const trpc = createTRPCClient<AppRouter>({
  links: [
    httpBatchLink({
      url: `${getApiUrl()}/trpc`,
      // Forward cookies for session auth
      fetch(url, options) {
        return fetch(url, { ...options, credentials: 'include' })
      },
    }),
  ],
})
