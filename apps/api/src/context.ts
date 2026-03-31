import { db } from '@kodi/db'
import { orgMembers, organizations } from '@kodi/db'
import { eq, and } from 'drizzle-orm'
import { betterAuth } from 'better-auth'
import { drizzleAdapter } from 'better-auth/adapters/drizzle'
import * as schema from '@kodi/db/schema'

// Lazy auth instance — shares the same DB as the API
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let _auth: any = null

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
  // eslint-disable-next-line @typescript-eslint/no-unsafe-return
  return _auth as ReturnType<typeof betterAuth>
}

export type Session = {
  user: { id: string; email: string; name: string }
  session: { id: string; userId: string }
}

// Type for a membership row with its org relation eagerly loaded
export type OrgMemberWithOrg = typeof orgMembers.$inferSelect & {
  org: typeof organizations.$inferSelect
}

async function getValidSession(headers: Headers) {
  const auth = getAuth()
  const cookieString = headers.get('cookie') || ''
  
  // Extract ALL session tokens from the cookie (there may be multiple due to cross-subdomain cookies)
  const tokenRegex = /__Secure-better-auth\.session_token=([^;]+)/g
  const tokens: string[] = []
  let match
  while ((match = tokenRegex.exec(cookieString)) !== null) {
    if (match[1]) {
      tokens.push(match[1])
    }
  }
  
  // Try the first token with the full headers (better-auth's default behavior)
  let session = await auth.api.getSession({ headers })
  if (session) {
    return session as Session
  }
  
  // If that didn't work and we have multiple tokens, try each one individually
  for (let i = 1; i < tokens.length; i++) {
    const customHeaders = new Headers(headers)
    customHeaders.set('cookie', `__Secure-better-auth.session_token=${tokens[i]}`)
    
    try {
      session = await auth.api.getSession({ headers: customHeaders })
      if (session) {
        return session as Session
      }
    } catch {
      // Try next token
    }
  }
  
  return null
}

export async function createContext(opts: { req: Request; resHeaders: Headers }) {
  // Try to validate the session from the incoming request
  let session: Session | null = null
  try {
    session = await getValidSession(opts.req.headers)
  } catch {
    // Unauthenticated or session fetch failed — session stays null
  }

  // Per-request membership cache — avoids duplicate DB hits across middleware + resolver
  const membershipCache = new Map<string, OrgMemberWithOrg | null>()

  /**
   * Lazy org membership lookup with per-request caching.
   * Returns null if the user is unauthenticated or is not a member of the org.
   */
  const getOrgMembership = async (orgId: string): Promise<OrgMemberWithOrg | null> => {
    if (!session?.user?.id) return null
    if (membershipCache.has(orgId)) return membershipCache.get(orgId) ?? null

    const membership = await db.query.orgMembers.findFirst({
      where: and(eq(orgMembers.orgId, orgId), eq(orgMembers.userId, session.user.id)),
      with: { org: true },
    })

    const result: OrgMemberWithOrg | null = membership ?? null
    membershipCache.set(orgId, result)
    return result
  }

  return {
    db,
    req: opts.req,
    resHeaders: opts.resHeaders,
    session,
    getOrgMembership,
  }
}

export type TRPCContext = Awaited<ReturnType<typeof createContext>>
