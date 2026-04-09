import crypto from 'node:crypto'
import { db, encrypt, eq, instances, type Instance } from '@kodi/db'
import { env } from '../../env'
import { generateCloudInit } from './cloud-init'
import * as cloudflare from './cloudflare-dns'
import * as ec2 from './ec2'
import * as litellm from './litellm'

// ── Provision ─────────────────────────────────────────────────────────────────

/**
 * Provision a full OpenClaw instance for an org.
 *
 * Flow:
 *   1. Set up LiteLLM customer + virtual key
 *   2. Insert DB record (status: pending)
 *   3. Launch EC2 instance
 *   4. Create Cloudflare DNS A record
 *   5. Update DB (status: installing)
 */
export async function provisionInstance(orgId: string): Promise<Instance> {
  const gatewayToken = crypto.randomBytes(32).toString('hex')
  const hostname = `${gatewayToken.slice(0, 12)}.${env.BASE_DOMAIN}`

  console.log(`[provision] org=${orgId} hostname=${hostname}`)

  const { litellmVirtualKey } = await setupLiteLLM(orgId)
  const cloudInit = buildCloudInit(gatewayToken, hostname, litellmVirtualKey)
  const record = await createPendingRecord(orgId, hostname, gatewayToken, litellmVirtualKey)

  return withErrorRecovery(record.id, () => launch(record.id, orgId, hostname, cloudInit))
}

// ── Deprovision ───────────────────────────────────────────────────────────────

/**
 * Deprovision an instance — tears down DNS, LiteLLM, and EC2.
 * Each step is non-fatal; all steps run regardless of individual failures.
 */
export async function deprovisionInstance(instanceId: string): Promise<void> {
  const inst = await db.query.instances.findFirst({ where: eq(instances.id, instanceId) })
  if (!inst) throw new Error(`Instance ${instanceId} not found`)

  console.log(`[deprovision] instance=${instanceId}`)
  await setStatus(instanceId, 'deleting')

  await safeRun('delete DNS record', () =>
    inst.dnsRecordId ? cloudflare.deleteRecord(inst.dnsRecordId) : Promise.resolve(),
  )
  await safeRun('delete LiteLLM customer', () =>
    inst.litellmCustomerId ? litellm.deleteCustomer(inst.litellmCustomerId) : Promise.resolve(),
  )
  await safeRun('terminate EC2', () =>
    inst.ec2InstanceId ? ec2.terminateInstance(inst.ec2InstanceId) : Promise.resolve(),
  )

  await setStatus(instanceId, 'deleted')
  console.log(`[deprovision] complete`)
}

// ── Private helpers ───────────────────────────────────────────────────────────

async function setupLiteLLM(orgId: string) {
  const credits = env.INSTANCE_CREDITS_DOLLARS
  console.log(`[provision] LiteLLM: creating customer ($${credits} budget)`)
  await litellm.createCustomer(orgId, credits)
  const litellmVirtualKey = await litellm.generateKey(orgId, credits)
  return { litellmVirtualKey }
}

function buildCloudInit(gatewayToken: string, hostname: string, litellmVirtualKey: string) {
  if (!env.ADMIN_SSH_PUBLIC_KEY) {
    console.warn('[provision] ADMIN_SSH_PUBLIC_KEY not set — instance will have no admin SSH access')
  }
  return generateCloudInit(gatewayToken, env.ADMIN_SSH_PUBLIC_KEY, {
    litellmVirtualKey,
    litellmProxyUrl: env.LITELLM_PROXY_URL ?? '',
    hostname,
  })
}

async function createPendingRecord(
  orgId: string,
  hostname: string,
  gatewayToken: string,
  litellmVirtualKey: string,
): Promise<Instance> {
  const [record] = await db
    .insert(instances)
    .values({
      orgId,
      status: 'pending',
      hostname,
      litellmCustomerId: orgId,
      litellmVirtualKey: encrypt(litellmVirtualKey),
      gatewayToken: encrypt(gatewayToken),
      sshUser: 'ubuntu',
    })
    .returning()

  if (!record) throw new Error('Failed to create instance record')
  console.log(`[provision] DB record created id=${record.id}`)
  return record
}

async function launch(
  recordId: string,
  orgId: string,
  hostname: string,
  cloudInit: string,
): Promise<Instance> {
  const serverName = `kodi-${orgId.slice(0, 8)}`
  const instanceType = env.INSTANCE_TYPE
  const volumeGb = env.INSTANCE_VOLUME_GB

  console.log(`[provision] launching EC2: ${serverName} (${instanceType}, ${volumeGb}GB)`)
  const { instanceId, publicIp } = await ec2.createInstance(serverName, cloudInit, instanceType, volumeGb)
  console.log(`[provision] EC2 launched: id=${instanceId} ip=${publicIp}`)

  const dnsRecordId = publicIp
    ? await safeRun('create DNS record', () => cloudflare.createARecord(hostname, publicIp))
    : null

  await db
    .update(instances)
    .set({ ec2InstanceId: instanceId, ipAddress: publicIp, dnsRecordId: dnsRecordId ?? null, status: 'installing' })
    .where(eq(instances.id, recordId))

  console.log(`[provision] status=installing ip=${publicIp}`)

  const updated = await db.query.instances.findFirst({ where: eq(instances.id, recordId) })
  return updated!
}

async function setStatus(
  instanceId: string,
  status: Instance['status'],
  errorMessage?: string,
): Promise<void> {
  await db
    .update(instances)
    .set({ status, ...(errorMessage ? { errorMessage } : {}) })
    .where(eq(instances.id, instanceId))
}

async function withErrorRecovery<T>(instanceId: string, fn: () => Promise<T>): Promise<T> {
  try {
    return await fn()
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error'
    console.error(`[provision] failed instance=${instanceId}: ${errorMessage}`)
    await setStatus(instanceId, 'error', errorMessage)
    throw error
  }
}

/**
 * Runs a task, logging any error without re-throwing.
 * Returns the result or undefined on failure.
 */
async function safeRun<T>(label: string, fn: () => Promise<T>): Promise<T | undefined> {
  try {
    return await fn()
  } catch (err) {
    console.error(`[provision] ${label} failed (non-fatal):`, err)
    return undefined
  }
}
