import { activityLog } from '@kodi/db'
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js'
import type * as schema from '@kodi/db/schema'

type AnyDb = PostgresJsDatabase<typeof schema>

/**
 * logActivity — append-only activity log helper.
 * Call this from any tRPC procedure after a significant org event.
 *
 * @param dbInstance - the Drizzle db instance from context
 * @param orgId      - the org this event belongs to
 * @param action     - dot-namespaced action string, e.g. 'member.invited'
 * @param metadata   - optional action-specific payload stored as JSONB
 * @param userId     - optional user who triggered the action (null for agent-initiated)
 */
export async function logActivity(
  dbInstance: AnyDb,
  orgId: string,
  action: string,
  metadata?: Record<string, unknown>,
  userId?: string | null,
): Promise<void> {
  await dbInstance.insert(activityLog).values({
    orgId,
    action,
    metadata: metadata ?? null,
    userId: userId ?? null,
  })
}
