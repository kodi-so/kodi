import {
  DescribeInstancesCommand,
  EC2Client,
  type _InstanceType,
  RunInstancesCommand,
  TerminateInstancesCommand,
} from '@aws-sdk/client-ec2'
import { requireAws } from '../../env'

let client: EC2Client | null = null

function getClient(): EC2Client {
  if (!client) {
    const aws = requireAws()
    client = new EC2Client({
      region: aws.AWS_REGION,
      credentials: {
        accessKeyId: aws.AWS_ACCESS_KEY_ID,
        secretAccessKey: aws.AWS_SECRET_ACCESS_KEY,
      },
    })
  }
  return client
}

export async function createInstance(
  name: string,
  userData: string,
  instanceType: string,
  volumeGb: number,
): Promise<{ instanceId: string; publicIp: string | null }> {
  const ec2 = getClient()
  const aws = requireAws()

  console.log(`[ec2] Creating instance: name=${name} ami=${aws.AWS_AMI_ID} type=${instanceType} region=${aws.AWS_REGION}`)
  console.log(`[ec2] Network: subnet=${aws.AWS_SUBNET_ID} sg=${aws.AWS_SECURITY_GROUP_ID}`)

  const result = await ec2.send(
    new RunInstancesCommand({
      ImageId: aws.AWS_AMI_ID,
      InstanceType: instanceType as _InstanceType,
      MinCount: 1,
      MaxCount: 1,
      UserData: Buffer.from(userData, 'utf8').toString('base64'),
      NetworkInterfaces: [
        {
          DeviceIndex: 0,
          AssociatePublicIpAddress: true,
          SubnetId: aws.AWS_SUBNET_ID,
          Groups: [aws.AWS_SECURITY_GROUP_ID],
        },
      ],
      BlockDeviceMappings: [
        {
          DeviceName: '/dev/sda1',
          Ebs: {
            VolumeSize: volumeGb,
            VolumeType: 'gp3',
            DeleteOnTermination: true,
          },
        },
      ],
      TagSpecifications: [
        {
          ResourceType: 'instance',
          Tags: [
            { Key: 'Name', Value: name },
            { Key: 'Project', Value: 'kodi' },
          ],
        },
      ],
    }),
  )

  const ec2Instance = result.Instances?.[0]
  if (!ec2Instance?.InstanceId) {
    throw new Error('EC2 RunInstances returned no instance ID')
  }

  console.log(`[ec2] Instance launched: id=${ec2Instance.InstanceId} state=${ec2Instance.State?.Name}`)

  let publicIp = ec2Instance.PublicIpAddress ?? null

  // EC2 instances in a VPC often don't have a public IP until "running" state.
  // Poll for up to 60s (12 attempts, 5s apart) to get the IP.
  if (!publicIp) {
    console.log(`[ec2] No public IP yet, polling for up to 60s...`)
    for (let attempt = 0; attempt < 12; attempt++) {
      await sleep(5000)
      let info: Awaited<ReturnType<typeof getInstance>>
      try {
        info = await getInstance(ec2Instance.InstanceId)
      } catch (err) {
        console.warn(`[ec2] Poll ${attempt + 1}/12: describe failed — ${String(err)}`)
        continue
      }
      if (!info) {
        console.warn(`[ec2] Poll ${attempt + 1}/12: instance not found, skipping`)
        continue
      }
      console.log(`[ec2] Poll ${attempt + 1}/12: state=${info.status} ip=${info.publicIp}`)
      if (info.publicIp) {
        publicIp = info.publicIp
        break
      }
      if (
        info.status === 'terminated' ||
        info.status === 'shutting-down' ||
        info.status === 'stopped'
      ) {
        console.warn(`[ec2] Instance entered terminal state: ${info.status}`)
        break
      }
    }
  }

  console.log(`[ec2] createInstance complete: id=${ec2Instance.InstanceId} ip=${publicIp}`)

  return {
    instanceId: ec2Instance.InstanceId,
    publicIp,
  }
}

/**
 * Terminates an EC2 instance. Idempotent — safe to call if already terminated.
 */
export async function terminateInstance(instanceId: string): Promise<void> {
  const ec2 = getClient()
  try {
    await ec2.send(new TerminateInstancesCommand({ InstanceIds: [instanceId] }))
  } catch (err: unknown) {
    // Ignore "instance not found" — already gone is fine
    if (isNotFoundError(err)) {
      console.log(`[ec2] terminateInstance: ${instanceId} already gone, ignoring`)
      return
    }
    throw err
  }
}

/**
 * Returns instance info, or null if the instance no longer exists.
 */
export async function getInstance(
  instanceId: string,
): Promise<{ instanceId: string; status: string; publicIp: string | null } | null> {
  const ec2 = getClient()
  let result
  try {
    result = await ec2.send(new DescribeInstancesCommand({ InstanceIds: [instanceId] }))
  } catch (err: unknown) {
    if (isNotFoundError(err)) return null
    throw err
  }

  const ec2Instance = result.Reservations?.[0]?.Instances?.[0]
  if (!ec2Instance) return null

  return {
    instanceId: ec2Instance.InstanceId ?? instanceId,
    status: ec2Instance.State?.Name ?? 'unknown',
    publicIp: ec2Instance.PublicIpAddress ?? null,
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function isNotFoundError(err: unknown): boolean {
  if (!err || typeof err !== 'object') return false
  const code = (err as { Code?: string; name?: string }).Code ?? (err as { name?: string }).name
  return code === 'InvalidInstanceID.NotFound'
}
