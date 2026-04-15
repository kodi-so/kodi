import { randomUUID } from 'crypto'
import { db, eq, meetingVoiceMedia, sql } from '@kodi/db'

const TTL_MS = 15 * 60 * 1000 // 15 minutes

export type VoiceAudioPayload = {
  buffer: Buffer
  contentType: string
}

function buildExpiryDate(ttlMs = TTL_MS) {
  return new Date(Date.now() + ttlMs)
}

export function encodeVoiceAudio(buffer: Buffer) {
  return buffer.toString('base64')
}

export function decodeVoiceAudio(audioBase64: string) {
  return Buffer.from(audioBase64, 'base64')
}

async function purgeExpiredVoiceAudio() {
  await db
    .delete(meetingVoiceMedia)
    .where(sql`${meetingVoiceMedia.expiresAt} < now()`)
}

/**
 * Persist generated voice audio in durable storage so Recall can fetch it
 * reliably across instances, retries, and HEAD probes.
 */
export async function storeVoiceAudio(input: {
  answerId: string
  meetingSessionId: string
  buffer: Buffer
  contentType?: string
  ttlMs?: number
}) {
  await purgeExpiredVoiceAudio()

  const token = randomUUID()
  const contentType = input.contentType ?? 'audio/mpeg'

  await db.insert(meetingVoiceMedia).values({
    answerId: input.answerId,
    meetingSessionId: input.meetingSessionId,
    token,
    contentType,
    audioBase64: encodeVoiceAudio(input.buffer),
    byteLength: input.buffer.byteLength,
    expiresAt: buildExpiryDate(input.ttlMs),
  })

  return token
}

/**
 * Retrieve persisted voice audio by token and update access telemetry.
 * Expired entries are cleaned up opportunistically.
 */
export async function getVoiceAudio(token: string): Promise<VoiceAudioPayload | null> {
  const record = await db.query.meetingVoiceMedia.findFirst({
    where: (fields, { eq }) => eq(fields.token, token),
  })

  if (!record) {
    return null
  }

  if (record.expiresAt.getTime() <= Date.now()) {
    await db.delete(meetingVoiceMedia).where(eq(meetingVoiceMedia.id, record.id))
    return null
  }

  const now = new Date()
  await db
    .update(meetingVoiceMedia)
    .set({
      accessCount: record.accessCount + 1,
      firstAccessedAt: record.firstAccessedAt ?? now,
      lastAccessedAt: now,
    })
    .where(eq(meetingVoiceMedia.id, record.id))

  return {
    buffer: decodeVoiceAudio(record.audioBase64),
    contentType: record.contentType,
  }
}
