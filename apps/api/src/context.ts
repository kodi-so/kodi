import { db } from '@kodi/db'
import { orgMembers, organizations } from '@kodi/db'
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
  user: { id: string; email: string; name: string; image?: string | null }
  session: { id: string; userId: string }
}

// Type for a membership row with its org relation eagerly loaded
export type OrgMemberWithOrg = typeof orgMembers.$inferSelect & {
  org: typeof organizations.$inferSelect
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
      where: (fields, { and, eq }) =>
        and(eq(fields.orgId, orgId), eq(fields.userId, session.user.id)),
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
