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

export {
  and,
  asc,
  desc,
  eq,
  gt,
  gte,
  inArray,
  isNull,
  lt,
  ne,
  or,
  sql,
} from 'drizzle-orm'
export * from './schema'
export { encrypt, decrypt, encryptJson, decryptJson } from './lib/crypto'
export { deriveMeetingBotIdentity } from './lib/meeting-bot-identity'
export * from './lib/meeting-copilot'
export { ensurePersonalOrganizationForUser } from './lib/personal-org'
export {
  buildMemberOpenClawAgentId,
  buildMemberOpenClawAgentSlug,
  buildOrgOpenClawAgentId,
  ensureMemberOpenClawAgent,
  ensureOrgOpenClawAgent,
} from './lib/openclaw-agent-registry'
export {
  PLANS,
  MARKUP_FACTOR,
  toRealBudget,
  toUserVisibleCost,
  type PlanId,
  type PlanConfig,
} from './lib/plans'
export { createLiteLLMClient } from './lib/litellm'
