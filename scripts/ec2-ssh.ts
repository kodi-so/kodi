/**
 * SSH into an instance and dump diagnostic info (cloud-init, openclaw, caddy).
 *
 * Usage:
 *   bun scripts/ec2-ssh.ts                       # uses latest instance from DB
 *   bun scripts/ec2-ssh.ts i-0b9f28e8e310d5071   # specific EC2 instance ID
 */
import { EC2Client, DescribeInstancesCommand } from '@aws-sdk/client-ec2'
import { db, instances } from '@kodi/db'
import { desc } from 'drizzle-orm'
import { sshExec } from '../apps/api/src/routers/instance/ssh'

const region = process.env.AWS_REGION ?? 'us-east-1'
const accessKeyId = process.env.AWS_ACCESS_KEY_ID!
const secretAccessKey = process.env.AWS_SECRET_ACCESS_KEY!

if (!accessKeyId || !secretAccessKey) {
  console.error('AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY must be set')
  process.exit(1)
}

let instanceId = process.argv[2]
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
  console.log(`Instance: ${instanceId} (${ip}, status=${latest[0].status})`)
}

if (!ip) {
  const ec2 = new EC2Client({ region, credentials: { accessKeyId, secretAccessKey } })
  const result = await ec2.send(new DescribeInstancesCommand({ InstanceIds: [instanceId] }))
  const inst = result.Reservations?.[0]?.Instances?.[0]
  ip = inst?.PublicIpAddress ?? null
  console.log(`State: ${inst?.State?.Name}, IP: ${ip}`)
}

if (!ip) {
  console.error('Could not determine IP address')
  process.exit(1)
}

const script = `
echo "=== cloud-init status ==="
cloud-init status 2>&1 || echo "cloud-init not found"
echo "=== cloud-init output (last 80 lines) ==="
sudo tail -80 /var/log/cloud-init-output.log 2>&1 || echo "no log file"
echo "=== openclaw installed? ==="
which openclaw 2>&1 || echo "openclaw NOT found in PATH"
echo "=== openclaw daemon ==="
systemctl status openclaw 2>&1 || ps aux | grep openclaw 2>&1
echo "=== port 18789 ==="
sudo ss -tlnp | grep 18789 || echo "nothing on 18789"
echo "=== openclaw config ==="
sudo cat /root/.openclaw/openclaw.json 2>&1 || echo "no config file"
echo "=== ready marker ==="
ls -la /var/lib/cloud/instance/kodi-ready 2>&1 || echo "not ready yet"
echo "=== caddy status ==="
systemctl status caddy 2>&1 || echo "caddy not running"
echo "=== ufw status ==="
sudo ufw status 2>&1 || echo "ufw not available"
echo "=== disk space ==="
df -h /
`.trim()

console.log(`\nRunning diagnostics on ${ip}...\n`)

try {
  const result = await sshExec(ip, 'ubuntu', script)
  console.log(result.stdout)
  if (result.stderr) console.error(result.stderr)
} catch (err) {
  console.error('SSH failed:', err instanceof Error ? err.message : err)
}

process.exit(0)
