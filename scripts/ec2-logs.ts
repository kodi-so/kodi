/**
 * Fetch EC2 instance info, security group rules, and console output.
 *
 * Usage:
 *   bun scripts/ec2-logs.ts                       # uses latest instance from DB
 *   bun scripts/ec2-logs.ts i-0982f940dcbe61d40   # specific instance ID
 */
import {
  DescribeInstancesCommand,
  DescribeSecurityGroupsCommand,
  DescribeSubnetsCommand,
  EC2Client,
  GetConsoleOutputCommand,
} from '@aws-sdk/client-ec2'
import { db, instances } from '@kodi/db'
import { desc } from 'drizzle-orm'

const region = process.env.AWS_REGION ?? 'us-east-1'
const accessKeyId = process.env.AWS_ACCESS_KEY_ID
const secretAccessKey = process.env.AWS_SECRET_ACCESS_KEY

if (!accessKeyId || !secretAccessKey) {
  console.error('AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY must be set')
  process.exit(1)
}

const ec2 = new EC2Client({ region, credentials: { accessKeyId, secretAccessKey } })

let instanceId = process.argv[2]

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
  console.log(`Using instance from DB: ${instanceId} (${latest[0].ipAddress}, status=${latest[0].status})`)
}

// Fetch instance info
console.log(`\n=== Instance Info ===`)
const descResult = await ec2.send(new DescribeInstancesCommand({ InstanceIds: [instanceId] }))
const inst = descResult.Reservations?.[0]?.Instances?.[0]
if (inst) {
  console.log(`State:    ${inst.State?.Name}`)
  console.log(`IP:       ${inst.PublicIpAddress ?? '(none)'}`)
  console.log(`Type:     ${inst.InstanceType}`)
  console.log(`AMI:      ${inst.ImageId}`)
  console.log(`Arch:     ${inst.Architecture}`)
  console.log(`Launch:   ${inst.LaunchTime?.toISOString()}`)
  console.log(`Subnet:   ${inst.SubnetId}`)
  console.log(`VPC:      ${inst.VpcId}`)
  console.log(`SG:       ${inst.SecurityGroups?.map((sg) => `${sg.GroupId} (${sg.GroupName})`).join(', ')}`)
}

// Security group rules
if (inst?.SecurityGroups?.[0]?.GroupId) {
  const sgId = inst.SecurityGroups[0].GroupId
  console.log(`\n=== Security Group: ${sgId} ===`)
  try {
    const sgResult = await ec2.send(new DescribeSecurityGroupsCommand({ GroupIds: [sgId] }))
    const sg = sgResult.SecurityGroups?.[0]
    if (sg) {
      console.log('Inbound rules:')
      for (const rule of sg.IpPermissions ?? []) {
        const port = rule.IpProtocol === '-1' ? 'ALL'
          : rule.FromPort === rule.ToPort ? String(rule.FromPort)
          : `${rule.FromPort}-${rule.ToPort}`
        const sources = [
          ...(rule.IpRanges?.map((r) => r.CidrIp) ?? []),
          ...(rule.Ipv6Ranges?.map((r) => r.CidrIpv6) ?? []),
        ].join(', ')
        console.log(`  ${rule.IpProtocol === '-1' ? 'ALL' : rule.IpProtocol?.toUpperCase()} port ${port} from ${sources || '(self/sg ref)'}`)
      }
    }
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e)
    console.log(`  (permission denied: ${msg.slice(0, 100)})`)
  }
}

// Subnet info
if (inst?.SubnetId) {
  console.log(`\n=== Subnet ===`)
  try {
    const subnetResult = await ec2.send(new DescribeSubnetsCommand({ SubnetIds: [inst.SubnetId] }))
    const subnet = subnetResult.Subnets?.[0]
    if (subnet) {
      console.log(`Subnet:         ${subnet.SubnetId}`)
      console.log(`AZ:             ${subnet.AvailabilityZone}`)
      console.log(`CIDR:           ${subnet.CidrBlock}`)
      console.log(`Auto-assign IP: ${subnet.MapPublicIpOnLaunch}`)
    }
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e)
    console.log(`  (permission denied: ${msg.slice(0, 100)})`)
  }
}

// Console output
console.log(`\n=== Console Output (cloud-init logs) ===`)
try {
  const output = await ec2.send(new GetConsoleOutputCommand({ InstanceId: instanceId }))
  if (output.Output) {
    const decoded = Buffer.from(output.Output, 'base64').toString('utf-8')
    console.log(decoded)
  } else {
    console.log('(no output yet — may take a few minutes after launch)')
  }
} catch (e: unknown) {
  const msg = e instanceof Error ? e.message : String(e)
  if (msg.includes('UnauthorizedOperation')) {
    console.log('IAM user lacks ec2:GetConsoleOutput permission.')
    console.log(`Check logs via AWS Console: EC2 > Instances > ${instanceId} > Actions > Monitor > Get system log`)
  } else {
    console.log(`Error: ${msg}`)
  }
}

process.exit(0)
