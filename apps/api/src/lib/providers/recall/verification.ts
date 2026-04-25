import crypto from 'crypto'

type VerifyRequestFromRecallInput = {
  secret: string
  headers: Record<string, string | undefined>
  payload: string | null
}

function getHeader(
  headers: Record<string, string | undefined>,
  key: string
) {
  return headers[key] ?? headers[key.toLowerCase()]
}

export function verifyRequestFromRecall(
  input: VerifyRequestFromRecallInput
) {
  const { secret, headers, payload } = input
  const msgId = getHeader(headers, 'webhook-id') ?? getHeader(headers, 'svix-id')
  const msgTimestamp =
    getHeader(headers, 'webhook-timestamp') ??
    getHeader(headers, 'svix-timestamp')
  const msgSignature =
    getHeader(headers, 'webhook-signature') ??
    getHeader(headers, 'svix-signature')

  if (!secret || !secret.startsWith('whsec_')) {
    throw new Error('Recall webhook verification secret is missing or invalid.')
  }

  if (!msgId || !msgTimestamp || !msgSignature) {
    throw new Error('Missing Recall webhook verification headers.')
  }

  const key = Buffer.from(secret.slice('whsec_'.length), 'base64')
  const payloadText = payload ?? ''
  const toSign = `${msgId}.${msgTimestamp}.${payloadText}`
  const expectedSignature = crypto
    .createHmac('sha256', key)
    .update(toSign)
    .digest('base64')

  const passedSignatures = msgSignature.split(' ')
  for (const versionedSignature of passedSignatures) {
    const [version, signature] = versionedSignature.split(',')
    if (version !== 'v1' || !signature) continue

    const expectedBytes = Buffer.from(expectedSignature, 'base64')
    const actualBytes = Buffer.from(signature, 'base64')

    if (
      expectedBytes.length === actualBytes.length &&
      crypto.timingSafeEqual(expectedBytes, actualBytes)
    ) {
      return
    }
  }

  throw new Error('No matching Recall webhook signature found.')
}
