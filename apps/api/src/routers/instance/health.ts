import { db, eq, instances, type Instance } from '@kodi/db'
import { reconcileAgentsForOrg } from '../../lib/agent-lifecycle'
import { checkCloudInitComplete } from './ssh'

const INSTALL_TIMEOUT_MS = 10 * 60 * 1000 // 10 minutes
const HTTP_HEALTH_TIMEOUT_MS = 5_000

export type HealthCheckResult = Pick<Instance, 'status' | 'hostname' | 'errorMessage'>

/**
 * Run a health check on an installing instance and update its status in DB.
 * - No-op if status is not 'installing'
 * - Times out after INSTALL_TIMEOUT_MS → sets status 'error'
 * - cloud-init done + HTTP 200 → sets status 'running'
 */
export async function checkInstanceHealth(inst: Instance): Promise<HealthCheckResult> {
  if (inst.status !== 'installing') {
    return pick(inst)
  }

  if (isTimedOut(inst)) {
    return updateStatus(inst.id, 'error', 'Provisioning timed out')
  }

  const cloudInitDone = await checkCloudInit(inst)
  const httpHealthy = cloudInitDone ? await checkHttpHealth(inst.hostname) : false

  const newStatus = cloudInitDone && httpHealthy ? 'running' : inst.status
  const result = await updateStatus(inst.id, newStatus)

  // KOD-384: when an instance first transitions to `running`, backfill
  // agents for every org_member who joined while the org had no instance
  // (or whose earlier provision call skipped because of the same). The
  // early-return at the top of this fn narrows inst.status to `installing`,
  // so reaching this branch means we just flipped from installing → running.
  // Fire-and-forget — health checks must stay fast, and the orchestrator
  // is idempotent so a failure here is recoverable on the next call.
  if (newStatus === 'running') {
    void reconcileAgentsForOrg({ org_id: inst.orgId }).catch((err) => {
      console.error(
        JSON.stringify({
          msg: 'agent.reconcile.org.failed',
          org_id: inst.orgId,
          instance_id: inst.id,
          error: err instanceof Error ? err.message : String(err),
        }),
      )
    })
  }

  return result
}

// ── Private helpers ───────────────────────────────────────────────────────────

function isTimedOut(inst: Instance): boolean {
  const elapsed = Date.now() - inst.createdAt.getTime()
  if (elapsed > INSTALL_TIMEOUT_MS) {
    console.warn(`[health] Timed out: instance=${inst.id} elapsed=${Math.round(elapsed / 1000)}s`)
    return true
  }
  return false
}

async function checkCloudInit(inst: Instance): Promise<boolean> {
  if (!inst.ipAddress) {
    console.log(`[health] No IP yet, skipping SSH check: instance=${inst.id}`)
    return false
  }
  const done = await checkCloudInitComplete(inst.ipAddress, inst.sshUser ?? 'ubuntu')
  console.log(`[health] cloud-init=${done} instance=${inst.id}`)
  return done
}

async function checkHttpHealth(hostname: string | null): Promise<boolean> {
  if (!hostname) return false
  try {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), HTTP_HEALTH_TIMEOUT_MS)
    const resp = await fetch(`https://${hostname}/health`, { signal: controller.signal })
    clearTimeout(timer)
    console.log(`[health] HTTP ${resp.status} hostname=${hostname}`)
    return resp.ok
  } catch (err) {
    console.log(`[health] HTTP check failed: ${err instanceof Error ? err.message : 'unknown'}`)
    return false
  }
}

async function updateStatus(
  instanceId: string,
  status: Instance['status'],
  errorMessage?: string,
): Promise<HealthCheckResult> {
  const updated = await db
    .update(instances)
    .set({ status, lastHealthCheck: new Date(), ...(errorMessage ? { errorMessage } : {}) })
    .where(eq(instances.id, instanceId))
    .returning()

  const inst = updated[0]!
  console.log(`[health] status=${status} instance=${instanceId}`)
  return pick(inst)
}

function pick(inst: Instance): HealthCheckResult {
  return { status: inst.status, hostname: inst.hostname, errorMessage: inst.errorMessage }
}
