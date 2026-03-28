/**
 * Run an arbitrary command on an EC2 instance via SSH.
 *
 * Usage:
 *   bun scripts/ec2-run.ts "sudo journalctl -u openclaw -n 50"
 *   bun scripts/ec2-run.ts "uptime" i-0123456789
 */
import { EC2Client, DescribeInstancesCommand } from '@aws-sdk/client-ec2'
import { db, instances } from '@kodi/db'
import { desc } from 'drizzle-orm'
import { sshExec } from '../apps/api/src/routers/instance/ssh'

const region = process.env.AWS_REGION ?? 'us-east-1'
const accessKeyId = process.env.AWS_ACCESS_KEY_ID!
const secretAccessKey = process.env.AWS_SECRET_ACCESS_KEY!

const command = process.argv[2]
if (!command) {
  console.error('Usage: bun scripts/ec2-run.ts "command" [instance-id]')
  process.exit(1)
}

let instanceId = process.argv[3]
let ip: string | null = null

if (!instanceId) {
  const latest = await db
    .select()
    .from(instances)
    .orderBy(desc(instances.createdAt))
    .limit(1)

  if (!latest[0]?.ec2InstanceId) {
    console.error('No instance found in DB')
    process.exit(1)
  }
  instanceId = latest[0].ec2InstanceId
  ip = latest[0].ipAddress
  console.log(`Instance: ${instanceId} (${ip})`)
}

if (!ip) {
  const ec2 = new EC2Client({ region, credentials: { accessKeyId, secretAccessKey } })
  const result = await ec2.send(new DescribeInstancesCommand({ InstanceIds: [instanceId] }))
  ip = result.Reservations?.[0]?.Instances?.[0]?.PublicIpAddress ?? null
}

if (!ip) {
  console.error('Could not determine IP address')
  process.exit(1)
}

console.log(`> ${command}\n`)

try {
  const result = await sshExec(ip, 'ubuntu', command)
  if (result.stdout) console.log(result.stdout)
  if (result.stderr) console.error(result.stderr)
  process.exit(result.code)
} catch (err) {
  console.error('SSH failed:', err instanceof Error ? err.message : err)
  process.exit(1)
}
