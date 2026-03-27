import { betterAuth } from 'better-auth'
import { drizzleAdapter } from 'better-auth/adapters/drizzle'
import { db, ensurePersonalOrganizationForUser } from '@kodi/db'
import * as schema from '@kodi/db/schema'

const betterAuthUrl = process.env.BETTER_AUTH_URL!
const trustedOrigins = [
  betterAuthUrl,
  ...(process.env.TRUSTED_ORIGINS ? process.env.TRUSTED_ORIGINS.split(',') : []),
]
const crossSubDomainCookieDomain = process.env.AUTH_COOKIE_DOMAIN?.trim().replace(/^\./, '')

export const auth = betterAuth({
  baseURL: betterAuthUrl,
  trustedOrigins,
  database: drizzleAdapter(db, {
    provider: 'pg',
    schema,
  }),
  advanced: {
    ...(crossSubDomainCookieDomain
      ? {
          crossSubDomainCookies: {
            enabled: true,
            domain: crossSubDomainCookieDomain,
          },
        }
      : {}),
  },
  databaseHooks: {
    user: {
      create: {
        after: async user => {
          await ensurePersonalOrganizationForUser(db, user.id)
        },
      },
    },
    session: {
      create: {
        after: async session => {
          await ensurePersonalOrganizationForUser(db, session.userId)
        },
      },
    },
  },
  emailAndPassword: {
    enabled: true,
  },
  ...(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET
    ? {
        socialProviders: {
          google: {
            clientId: process.env.GOOGLE_CLIENT_ID,
            clientSecret: process.env.GOOGLE_CLIENT_SECRET,
          },
        },
      }
    : {}),
})
