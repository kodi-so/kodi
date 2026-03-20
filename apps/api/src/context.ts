import { db } from '@kodi/db'

export async function createContext(opts: { req: Request; resHeaders: Headers }) {
  return {
    db,
    req: opts.req,
    resHeaders: opts.resHeaders,
  }
}

export type TRPCContext = Awaited<ReturnType<typeof createContext>>
