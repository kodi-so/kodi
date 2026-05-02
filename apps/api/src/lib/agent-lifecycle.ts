import {
  db as defaultDb,
  eq,
  instances,
  orgMembers,
  type Instance,
} from '@kodi/db'
import {
  deprovisionAgentForUser,
  provisionAgentForUser,
  type ProvisionAgentForUserResult,
  type DeprovisionAgentForUserResult,
} from './composio-sessions'

/**
 * Glue between Kodi's org-membership lifecycle and the agent provisioning
 * orchestrator from KOD-383.
 *
 * The orchestrator is slow (Composio API + signed POST to the plugin); we
 * never want to block a tRPC mutation on it. These triggers run the work
 * fire-and-forget, log failures, and decide on their own whether to skip
 * (e.g. when the org has no running instance yet).
 *
 * Membership-change → agent-change is best-effort:
 *   - failure does NOT roll back the membership change
 *   - failure is retryable: any subsequent membership/connection event
 *     funnels through the same idempotent orchestrator
 *   - org with no running instance: skip until KOD-385's instance-side
 *     reconciliation backfills agents at instance startup
 */

// ── Trigger sources ───────────────────────────────────────────────────────

export type TriggerProvisionInput = {
  org_id: string
  user_id: string
  org_member_id: string
  display_name?: string | null
  /** Override the database connection for tests. */
  dbInstance?: typeof defaultDb
  /**
   * Override the orchestrator for tests. Defaults to the real
   * `provisionAgentForUser` from `composio-sessions.ts`.
   */
  provisionFn?: typeof provisionAgentForUser
  logger?: Pick<Console, 'log' | 'warn' | 'error'>
}

export type TriggerProvisionOutcome =
  | { kind: 'started' }
  | { kind: 'skipped'; reason: 'no-instance' | 'instance-not-running' }

/**
 * Fire-and-forget agent provisioning trigger. Returns synchronously after
 * deciding whether to start the work; the actual orchestrator call runs
 * on the next microtask and its outcome is logged but not surfaced.
 *
 * Skips when the org has no instance yet, or its instance isn't `running`
 * — those cases are covered by `reconcileAgentsForOrg` after instance
 * provisioning lands.
 */
export async function triggerAgentProvision(
  input: TriggerProvisionInput,
): Promise<TriggerProvisionOutcome> {
  const dbInstance = input.dbInstance ?? defaultDb
  const provisionFn = input.provisionFn ?? provisionAgentForUser
  const logger = input.logger ?? console

  const inst = await resolveInstanceForOrg(dbInstance, input.org_id)
  if (!inst) return { kind: 'skipped', reason: 'no-instance' }
  if (inst.status !== 'running') {
    return { kind: 'skipped', reason: 'instance-not-running' }
  }

  // Fire-and-forget. Any failure is logged; never thrown back to the
  // caller (membership mutations must complete regardless).
  void runProvisionInBackground(provisionFn, dbInstance, input, logger)
  return { kind: 'started' }
}

async function runProvisionInBackground(
  provisionFn: typeof provisionAgentForUser,
  dbInstance: typeof defaultDb,
  input: TriggerProvisionInput,
  logger: Pick<Console, 'log' | 'warn' | 'error'>,
): Promise<void> {
  try {
    const result = await provisionFn({
      dbInstance,
      org_id: input.org_id,
      user_id: input.user_id,
      org_member_id: input.org_member_id,
      display_name: input.display_name ?? null,
    })
    logger.log(
      JSON.stringify({
        msg: 'agent.provision.background',
        org_id: input.org_id,
        user_id: input.user_id,
        composio_status: result.composio_status,
        registered_tool_count: result.registered_tool_count,
      }),
    )
  } catch (err) {
    logger.error(
      JSON.stringify({
        msg: 'agent.provision.background.failed',
        org_id: input.org_id,
        user_id: input.user_id,
        error: err instanceof Error ? err.message : String(err),
      }),
    )
  }
}

export type TriggerDeprovisionInput = {
  org_id: string
  user_id: string
  org_member_id: string
  dbInstance?: typeof defaultDb
  deprovisionFn?: typeof deprovisionAgentForUser
  logger?: Pick<Console, 'log' | 'warn' | 'error'>
}

/**
 * Fire-and-forget agent teardown. Even when the instance is gone we still
 * try to reach the orchestrator so the openclaw_agents row is marked
 * `deprovisioned` — the orchestrator handles the no-instance case
 * gracefully.
 */
export async function triggerAgentDeprovision(
  input: TriggerDeprovisionInput,
): Promise<{ kind: 'started' }> {
  const dbInstance = input.dbInstance ?? defaultDb
  const deprovisionFn = input.deprovisionFn ?? deprovisionAgentForUser
  const logger = input.logger ?? console

  void runDeprovisionInBackground(deprovisionFn, dbInstance, input, logger)
  return { kind: 'started' }
}

async function runDeprovisionInBackground(
  deprovisionFn: typeof deprovisionAgentForUser,
  dbInstance: typeof defaultDb,
  input: TriggerDeprovisionInput,
  logger: Pick<Console, 'log' | 'warn' | 'error'>,
): Promise<void> {
  try {
    const result: DeprovisionAgentForUserResult = await deprovisionFn({
      dbInstance,
      org_id: input.org_id,
      user_id: input.user_id,
      org_member_id: input.org_member_id,
    })
    logger.log(
      JSON.stringify({
        msg: 'agent.deprovision.background',
        org_id: input.org_id,
        user_id: input.user_id,
        removed: result.removed,
      }),
    )
  } catch (err) {
    logger.error(
      JSON.stringify({
        msg: 'agent.deprovision.background.failed',
        org_id: input.org_id,
        user_id: input.user_id,
        error: err instanceof Error ? err.message : String(err),
      }),
    )
  }
}

// ── Instance-side reconciliation ──────────────────────────────────────────

export type ReconcileAgentsForOrgInput = {
  org_id: string
  dbInstance?: typeof defaultDb
  provisionFn?: typeof provisionAgentForUser
  logger?: Pick<Console, 'log' | 'warn' | 'error'>
}

export type ReconcileAgentsForOrgResult = {
  attempted: number
  succeeded: number
  failed: number
  /** Per-member outcomes for diagnostics. */
  results: Array<
    | {
        org_member_id: string
        user_id: string
        ok: true
        composio_status: ProvisionAgentForUserResult['composio_status']
      }
    | {
        org_member_id: string
        user_id: string
        ok: false
        error: string
      }
  >
}

/**
 * Iterate every member of an org and provision an agent for each.
 *
 * Called at the tail of `provisionInstance` (after the instance reaches a
 * usable state) so members who joined while the org had no instance get
 * backfilled. Idempotent — `provisionAgentForUser` returns the existing
 * agent on subsequent calls and just re-syncs Composio tools.
 *
 * Runs serially: Composio rate limits are documented but unspecified;
 * fanning out by N members of an org would burst-load both Composio and
 * the plugin's HMAC dedupe nonce store. Serial is safe and the typical
 * org has a handful of members.
 */
export async function reconcileAgentsForOrg(
  input: ReconcileAgentsForOrgInput,
): Promise<ReconcileAgentsForOrgResult> {
  const dbInstance = input.dbInstance ?? defaultDb
  const provisionFn = input.provisionFn ?? provisionAgentForUser
  const logger = input.logger ?? console

  const members = await dbInstance
    .select({
      memberId: orgMembers.id,
      userId: orgMembers.userId,
    })
    .from(orgMembers)
    .where(eq(orgMembers.orgId, input.org_id))

  const result: ReconcileAgentsForOrgResult = {
    attempted: members.length,
    succeeded: 0,
    failed: 0,
    results: [],
  }

  for (const member of members) {
    try {
      const outcome = await provisionFn({
        dbInstance,
        org_id: input.org_id,
        user_id: member.userId,
        org_member_id: member.memberId,
      })
      result.succeeded += 1
      result.results.push({
        org_member_id: member.memberId,
        user_id: member.userId,
        ok: true,
        composio_status: outcome.composio_status,
      })
    } catch (err) {
      result.failed += 1
      const error = err instanceof Error ? err.message : String(err)
      logger.warn(
        JSON.stringify({
          msg: 'agent.reconcile.member.failed',
          org_id: input.org_id,
          org_member_id: member.memberId,
          user_id: member.userId,
          error,
        }),
      )
      result.results.push({
        org_member_id: member.memberId,
        user_id: member.userId,
        ok: false,
        error,
      })
    }
  }

  logger.log(
    JSON.stringify({
      msg: 'agent.reconcile.org',
      org_id: input.org_id,
      attempted: result.attempted,
      succeeded: result.succeeded,
      failed: result.failed,
    }),
  )
  return result
}

// ── Helpers ───────────────────────────────────────────────────────────────

async function resolveInstanceForOrg(
  dbInstance: typeof defaultDb,
  org_id: string,
): Promise<Instance | null> {
  const inst = await dbInstance.query.instances.findFirst({
    where: (fields, { and, eq, ne }) =>
      and(eq(fields.orgId, org_id), ne(fields.status, 'deleted')),
  })
  return inst ?? null
}

// Re-export the underlying orchestrator names for convenience at
// trigger sites; same import path keeps lifecycle wiring discoverable.
export {
  provisionAgentForUser,
  deprovisionAgentForUser,
} from './composio-sessions'
