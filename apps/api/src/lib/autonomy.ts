import { agentAutonomyPolicies, db, eq } from '@kodi/db'
import type {
  AgentAutonomyPolicy,
  AutonomyLevel,
  AutonomyOverrides,
} from '@kodi/db'
import { z } from 'zod'

const AUTONOMY_LEVELS = ['strict', 'normal', 'lenient', 'yolo'] as const

const overrideActionSchema = z.enum(['allow', 'ask', 'deny'])
const autonomyLevelSchema = z.enum(AUTONOMY_LEVELS)

// Glob keys are validated as plain non-empty strings here. Concrete glob
// matching happens at policy evaluation time (M5); this layer just guards
// against junk input being persisted.
const overridesSchema = z
  .record(z.string().min(1), overrideActionSchema)
  .nullable()

export type EffectiveAutonomyPolicy = {
  autonomyLevel: AutonomyLevel
  overrides: AutonomyOverrides | null
}

export const DEFAULT_AUTONOMY_POLICY: EffectiveAutonomyPolicy = {
  autonomyLevel: 'normal',
  overrides: null,
}

/**
 * Returns the agent's effective autonomy policy. Falls back to
 * DEFAULT_AUTONOMY_POLICY when no row exists.
 */
export async function getEffectiveAutonomyPolicy(
  agentId: string,
): Promise<EffectiveAutonomyPolicy> {
  const rows = await db
    .select()
    .from(agentAutonomyPolicies)
    .where(eq(agentAutonomyPolicies.agentId, agentId))
    .limit(1)

  const row: AgentAutonomyPolicy | undefined = rows[0]
  if (!row) return DEFAULT_AUTONOMY_POLICY

  return {
    autonomyLevel: row.autonomyLevel as AutonomyLevel,
    overrides: row.overrides ?? null,
  }
}

const setAutonomyPolicySchema = z.object({
  agentId: z.string().min(1),
  autonomyLevel: autonomyLevelSchema,
  overrides: overridesSchema,
  updatedByUserId: z.string().min(1).nullable().optional(),
})

export type SetAutonomyPolicyInput = z.input<typeof setAutonomyPolicySchema>

/**
 * Upsert an agent's autonomy policy. Validates inputs strictly; rejects
 * unknown levels and malformed overrides with zod errors.
 */
export async function setAutonomyPolicy(
  input: SetAutonomyPolicyInput,
): Promise<AgentAutonomyPolicy> {
  const parsed = setAutonomyPolicySchema.parse(input)

  const [row] = await db
    .insert(agentAutonomyPolicies)
    .values({
      agentId: parsed.agentId,
      autonomyLevel: parsed.autonomyLevel,
      overrides: parsed.overrides ?? null,
      updatedByUserId: parsed.updatedByUserId ?? null,
    })
    .onConflictDoUpdate({
      target: agentAutonomyPolicies.agentId,
      set: {
        autonomyLevel: parsed.autonomyLevel,
        overrides: parsed.overrides ?? null,
        updatedByUserId: parsed.updatedByUserId ?? null,
        updatedAt: new Date(),
      },
    })
    .returning()

  if (!row) throw new Error(`Failed to upsert autonomy policy for agent ${parsed.agentId}`)
  return row
}
