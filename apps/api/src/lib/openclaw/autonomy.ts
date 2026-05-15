import { z } from 'zod'
import {
  agentAutonomyPolicies,
  db,
  type AutonomyLevel,
  type AutonomyOverrides,
} from '@kodi/db'
import { pushUpdatePolicy, type PushResult } from './plugin-client'

/**
 * Set an agent's autonomy policy (KOD-392 / M5-T4).
 *
 * Two writers update this row:
 *   - This helper (admin / Kodi-side mutation, plus the Hono PUT route).
 *   - Migration scripts / seed flows (rare).
 *
 * The plugin's loader (KOD-389) caches policies for 15 minutes by
 * default. To make changes take effect "within seconds" per the AC,
 * we POST `/plugins/kodi-bridge/agents/update-policy` after the upsert
 * so the plugin invalidates its cache eagerly.
 *
 * Push failures DO NOT roll back the upsert. The persisted row is the
 * source of truth; the plugin will pick the change up either via the
 * eager push or via the next TTL-refresh fetch (worst case: 15 min).
 * Failures are logged for ops visibility.
 */

export const AUTONOMY_LEVELS = [
  'strict',
  'normal',
  'lenient',
  'yolo',
] as const satisfies readonly AutonomyLevel[]

export const AUTONOMY_OVERRIDE_ACTIONS = ['allow', 'ask', 'deny'] as const

export const AutonomyLevelSchema = z.enum(AUTONOMY_LEVELS)
export const AutonomyOverrideActionSchema = z.enum(AUTONOMY_OVERRIDE_ACTIONS)

/**
 * Override-glob keys: tool name patterns. We accept any non-empty string
 * here — the matcher in `interceptor.ts` (KOD-390) handles
 * exact-match and trailing-`*` glob; rejecting other patterns at the
 * write boundary would just confuse admins who copy/paste from the spec
 * examples (e.g. `"github.merge_pr"`, `"slack.*"`, `"*"`).
 */
export const AutonomyOverridesSchema = z
  .record(z.string().min(1), AutonomyOverrideActionSchema)
  .nullable()
  .optional()

export const SetAgentAutonomyBodySchema = z.object({
  autonomy_level: AutonomyLevelSchema,
  overrides: AutonomyOverridesSchema,
})

export type SetAgentAutonomyBody = z.infer<typeof SetAgentAutonomyBodySchema>

export type SetAgentAutonomyInput = {
  /** Kodi DB UUID of the agent. */
  agentId: string
  orgId: string
  autonomyLevel: AutonomyLevel
  overrides?: AutonomyOverrides | null
  /** User who decided this — recorded as `updatedByUserId` for audit. */
  decidedByUserId: string
  /** Test seam — defaults to imported `db`. */
  db?: typeof db
  /** Test seam — defaults to the production `pushUpdatePolicy`. */
  pushFn?: typeof pushUpdatePolicy
  now?: () => number
  logger?: Pick<Console, 'log' | 'warn' | 'error'>
}

export type SetAgentAutonomyResult = {
  agent_id: string
  autonomy_level: AutonomyLevel
  overrides: AutonomyOverrides | null
  updated_at: Date
  /** Whether the eager plugin push succeeded. False for missing instance,
   * non-running instance, or HTTP failure — the policy is still
   * persisted; the plugin will pick it up on the next TTL refresh. */
  reload_pushed: boolean
  /** Reason the push failed, if it did. Helpful for the UI to show
   * "saved, propagating in <15min" vs the success state. */
  reload_reason?: string
}

export async function setAgentAutonomyPolicy(
  input: SetAgentAutonomyInput,
): Promise<SetAgentAutonomyResult> {
  const dbInstance = input.db ?? db
  const pushFn = input.pushFn ?? pushUpdatePolicy
  const logger = input.logger ?? console
  const now = input.now ?? Date.now

  // Normalize: drizzle stores `jsonb` overrides as null when absent.
  const normalizedOverrides: AutonomyOverrides | null =
    input.overrides && Object.keys(input.overrides).length > 0
      ? input.overrides
      : null

  const updatedAt = new Date(now())
  const [row] = await dbInstance
    .insert(agentAutonomyPolicies)
    .values({
      agentId: input.agentId,
      autonomyLevel: input.autonomyLevel,
      overrides: normalizedOverrides,
      updatedByUserId: input.decidedByUserId,
      updatedAt,
    })
    .onConflictDoUpdate({
      target: agentAutonomyPolicies.agentId,
      set: {
        autonomyLevel: input.autonomyLevel,
        overrides: normalizedOverrides,
        updatedByUserId: input.decidedByUserId,
        updatedAt,
      },
    })
    .returning()

  if (!row) {
    throw new Error('Upsert returned no row for agent_autonomy_policies')
  }

  // Look up the instance so we can push the change. We pick the running
  // one if there are multiple (rare) — non-running rows mean the plugin
  // can't be reached anyway.
  const targetInstance = await dbInstance.query.instances.findFirst({
    where: (fields, ops) =>
      ops.and(ops.eq(fields.orgId, input.orgId), ops.eq(fields.status, 'running')),
  })

  let reloadPushed = false
  let reloadReason: string | undefined

  if (!targetInstance) {
    reloadReason = 'no-running-instance'
  } else {
    const result: PushResult = await pushFn({
      instance: targetInstance,
      body: {
        agent_id: row.agentId,
        autonomy_level: row.autonomyLevel as AutonomyLevel,
        overrides: (row.overrides as AutonomyOverrides | null) ?? null,
      },
    })
    if (result.ok) {
      reloadPushed = true
    } else {
      reloadReason = result.reason
      logger.warn(
        JSON.stringify({
          msg: 'autonomy.set.push_failed',
          agent_id: input.agentId,
          instance_id: targetInstance.id,
          reason: result.reason,
          status: result.status,
          error: result.error,
        }),
      )
    }
  }

  return {
    agent_id: row.agentId,
    autonomy_level: row.autonomyLevel as AutonomyLevel,
    overrides: (row.overrides as AutonomyOverrides | null) ?? null,
    updated_at: row.updatedAt,
    reload_pushed: reloadPushed,
    ...(reloadReason ? { reload_reason: reloadReason } : {}),
  }
}
