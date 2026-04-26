import { S3Client, PutObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3'
import { requireR2 } from '@/env'

function getClient() {
  const { R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY } = requireR2()
  return new S3Client({
    region: 'auto',
    endpoint: `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: R2_ACCESS_KEY_ID,
      secretAccessKey: R2_SECRET_ACCESS_KEY,
    },
  })
}

export async function uploadObject(key: string, body: Buffer, contentType: string): Promise<string> {
  const { R2_BUCKET_NAME, R2_PUBLIC_URL } = requireR2()
  await getClient().send(
    new PutObjectCommand({
      Bucket: R2_BUCKET_NAME,
      Key: key,
      Body: body,
      ContentType: contentType,
    })
  )
  return `${R2_PUBLIC_URL.replace(/\/$/, '')}/${key}`
}

export async function deleteObject(key: string): Promise<void> {
  const { R2_BUCKET_NAME } = requireR2()
  await getClient().send(
    new DeleteObjectCommand({
      Bucket: R2_BUCKET_NAME,
      Key: key,
    })
  )
}

/** Extract the R2 key from a public URL, or null if it doesn't match our R2_PUBLIC_URL. */
export function keyFromUrl(url: string): string | null {
  try {
    const { R2_PUBLIC_URL } = requireR2()
    const base = R2_PUBLIC_URL.replace(/\/$/, '')
    if (!url.startsWith(base + '/')) return null
    return url.slice(base.length + 1)
  } catch {
    return null
  }
}
