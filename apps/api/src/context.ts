import { db } from '@kodi/db'
import { betterAuth } from 'better-auth'
import { drizzleAdapter } from 'better-auth/adapters/drizzle'
import * as schema from '@kodi/db/schema'

// Lazy auth instance — shares the same DB as the API
let _auth: ReturnType<typeof betterAuth> | null = null

function getAuth() {
  if (!_auth) {
    _auth = betterAuth({
      baseURL: process.env.BETTER_AUTH_URL!,
      database: drizzleAdapter(db, {
        provider: 'pg',
        schema,
      }),
    })
  }
  return _auth
}

export type Session = {
  user: { id: string; email: string; name: string }
  session: { id: string; userId: string }
}

export async function createContext(opts: { req: Request; resHeaders: Headers }) {
  // Try to validate the session from the incoming request
  let session: Session | null = null
  try {
    const auth = getAuth()
    const result = await auth.api.getSession({ headers: opts.req.headers })
    if (result) {
      session = result as Session
    }
  } catch {
    // Unauthenticated or session fetch failed — session stays null
  }

  return {
    db,
    req: opts.req,
    resHeaders: opts.resHeaders,
    session,
  }
}

export type TRPCContext = Awaited<ReturnType<typeof createContext>>
