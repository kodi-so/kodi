import crypto from 'node:crypto'
import { eq } from 'drizzle-orm'
import { db, encrypt, instances } from '@kodi/db'
import { env } from '../env'
import { generateCloudInit, type InstanceConfig } from './cloud-init'
import * as cloudflare from './cloudflare-dns'
import * as ec2 from './ec2'
import * as litellm from './litellm'

/**
 * Provision a full OpenClaw instance for an org.
 *
 * Flow:
 * 1. Generate gatewayToken
 * 2. Create LiteLLM customer (orgId as userId)
 * 3. Generate LiteLLM virtual key
 * 4. Derive hostname from gatewayToken + BASE_DOMAIN
 * 5. Generate cloud-init script
 * 6. Insert DB record with status 'pending'
 * 7. Launch EC2 instance → get instanceId + publicIp
 * 8. Create Cloudflare A record → get dnsRecordId
 * 9. Update DB: set cloud fields + status 'installing'
 */
export async function provisionInstance(orgId: string) {
  const gatewayToken = crypto.randomBytes(32).toString('hex')
  const hostname = `${gatewayToken.slice(0, 12)}.${env.BASE_DOMAIN}`
  const serverName = `kodi-${orgId.slice(0, 8)}`
  const instanceType = env.INSTANCE_TYPE
  const volumeGb = env.INSTANCE_VOLUME_GB
  const creditsDollars = env.INSTANCE_CREDITS_DOLLARS

  console.log(`[provision] Starting for org=${orgId} hostname=${hostname} type=${instanceType}`)

  // 1. Create LiteLLM customer
  console.log(`[provision] Creating LiteLLM customer ($${creditsDollars} budget)`)
  await litellm.createCustomer(orgId, creditsDollars)

  // 2. Generate LiteLLM virtual key
  console.log(`[provision] Generating LiteLLM virtual key`)
  const litellmVirtualKey = await litellm.generateKey(orgId, creditsDollars)

  // 3. Build cloud-init
  const instanceConfig: InstanceConfig = {
    litellmVirtualKey,
    litellmProxyUrl: env.LITELLM_PROXY_URL ?? '',
    hostname,
  }

  const cloudInit = generateCloudInit(gatewayToken, env.ADMIN_SSH_PUBLIC_KEY, instanceConfig)

  console.log(`[provision] ADMIN_SSH_PUBLIC_KEY: ${env.ADMIN_SSH_PUBLIC_KEY ? env.ADMIN_SSH_PUBLIC_KEY.slice(0, 40) + '...' : '(NOT SET)'}`)

  // 4. Insert DB record with status 'pending' before cloud calls (fail-safe)
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

  console.log(`[provision] DB record created id=${record.id}, status=pending`)

  try {
    // 5. Launch EC2 instance
    console.log(`[provision] Launching EC2: ${serverName} (${instanceType}, ${volumeGb}GB)`)
    const { instanceId, publicIp } = await ec2.createInstance(serverName, cloudInit, instanceType, volumeGb)
    console.log(`[provision] EC2 launched: id=${instanceId} ip=${publicIp}`)

    // 6. Create Cloudflare DNS A record (non-fatal if no IP yet)
    let dnsRecordId: string | null = null
    if (publicIp) {
      try {
        console.log(`[provision] Creating DNS A record: ${hostname} → ${publicIp}`)
        dnsRecordId = await cloudflare.createARecord(hostname, publicIp)
        console.log(`[provision] DNS record created: ${dnsRecordId}`)
      } catch (dnsError) {
        console.error(`[provision] DNS record creation failed (non-fatal):`, dnsError)
      }
    }

    // 7. Update DB with cloud provider details + status 'installing'
    await db
      .update(instances)
      .set({ ec2InstanceId: instanceId, ipAddress: publicIp, dnsRecordId, status: 'installing' })
      .where(eq(instances.id, record.id))

    console.log(`[provision] DB updated: status=installing, ip=${publicIp}`)

    const updated = await db.query.instances.findFirst({ where: eq(instances.id, record.id) })
    return updated!
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown provisioning error'
    console.error(`[provision] FAILED for instance=${record.id}:`, errorMessage)

    await db
      .update(instances)
      .set({ status: 'error', errorMessage })
      .where(eq(instances.id, record.id))

    throw error
  }
}

/**
 * Deprovision an instance — cleans up DNS, LiteLLM, and EC2.
 * All cloud cleanup steps are non-fatal (log errors but continue).
 */
export async function deprovisionInstance(instanceId: string): Promise<void> {
  console.log(`[deprovision] Starting for instance=${instanceId}`)

  const inst = await db.query.instances.findFirst({ where: eq(instances.id, instanceId) })
  if (!inst) throw new Error(`Instance ${instanceId} not found`)

  await db.update(instances).set({ status: 'deleting' }).where(eq(instances.id, instanceId))

  try {
    if (inst.dnsRecordId) {
      try {
        console.log(`[deprovision] Deleting DNS record: ${inst.dnsRecordId}`)
        await cloudflare.deleteRecord(inst.dnsRecordId)
        console.log(`[deprovision] DNS record deleted`)
      } catch (err) {
        console.error(`[deprovision] DNS deletion failed (non-fatal):`, err)
      }
    }

    if (inst.litellmCustomerId) {
      try {
        console.log(`[deprovision] Deleting LiteLLM customer: ${inst.litellmCustomerId}`)
        await litellm.deleteCustomer(inst.litellmCustomerId)
        console.log(`[deprovision] LiteLLM customer deleted`)
      } catch (err) {
        console.error(`[deprovision] LiteLLM deletion failed (non-fatal):`, err)
      }
    }

    if (inst.ec2InstanceId) {
      try {
        console.log(`[deprovision] Terminating EC2: ${inst.ec2InstanceId}`)
        await ec2.terminateInstance(inst.ec2InstanceId)
        console.log(`[deprovision] EC2 terminated`)
      } catch (err) {
        console.error(`[deprovision] EC2 termination failed (non-fatal):`, err)
      }
    }

    await db.update(instances).set({ status: 'deleted' }).where(eq(instances.id, instanceId))
    console.log(`[deprovision] Complete, status=deleted`)
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown deprovisioning error'
    console.error(`[deprovision] FAILED for instance=${instanceId}:`, errorMessage)

    await db
      .update(instances)
      .set({ status: 'error', errorMessage })
      .where(eq(instances.id, instanceId))

    throw error
  }
}
