import { createTRPCClient, httpBatchLink } from '@trpc/client'
import type { AppRouter } from '@kodi/api'

export function createKodiDesktopTrpcClient(input: {
  apiBaseUrl: string
  getAccessToken: () => Promise<string | null> | string | null
}) {
  return createTRPCClient<AppRouter>({
    links: [
      httpBatchLink({
        url: `${input.apiBaseUrl.replace(/\/$/, '')}/trpc`,
        async headers() {
          const token = await input.getAccessToken()
          return token ? { authorization: `Bearer ${token}` } : {}
        },
      }),
    ],
  })
}
