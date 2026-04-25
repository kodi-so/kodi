import { drizzle } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'
import * as schema from './schema'

function createDb() {
  const connectionString = process.env.DATABASE_URL
  if (!connectionString) {
    throw new Error('DATABASE_URL environment variable is required')
  }
  const client = postgres(connectionString, { prepare: false })
  return drizzle(client, { schema })
}

// Lazy singleton — only connects when first accessed
let _db: ReturnType<typeof createDb> | undefined

export const db = new Proxy({} as ReturnType<typeof createDb>, {
  get(_target, prop) {
    if (!_db) _db = createDb()
    return (_db as any)[prop]
  },
})

export { and, asc, desc, eq, gt, inArray, isNull, lt, or, sql } from 'drizzle-orm'
export * from './schema'
export { encrypt, decrypt, encryptJson, decryptJson } from './lib/crypto'
export { deriveMeetingBotIdentity } from './lib/meeting-bot-identity'
export * from './lib/meeting-copilot'
export { ensurePersonalOrganizationForUser } from './lib/personal-org'
