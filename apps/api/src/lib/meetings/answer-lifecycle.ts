import {
  db,
  eq,
  meetingAnswerEvents,
  meetingAnswers,
  type MeetingAnswer,
  type MeetingAnswerEventType,
  type MeetingAnswerStatus,
} from '@kodi/db'
import type { MeetingAnswerGrounding } from './answer-engine'

type CreateAnswerRequestInput = {
  meetingSessionId: string
  orgId: string
  requestedByUserId?: string | null
  source: 'ui' | 'chat'
  question: string
}

export async function createAnswerRequest(
  input: CreateAnswerRequestInput
): Promise<MeetingAnswer> {
  const [answer] = await db
    .insert(meetingAnswers)
    .values({
      meetingSessionId: input.meetingSessionId,
      orgId: input.orgId,
      requestedByUserId: input.requestedByUserId ?? null,
      source: input.source,
      question: input.question,
      status: 'requested',
    })
    .returning()

  if (!answer) throw new Error('Failed to create meeting answer record.')

  await logAnswerEvent(answer.id, input.meetingSessionId, 'requested', {
    source: input.source,
    question: input.question,
  })

  return answer
}

export async function transitionAnswerState(
  answerId: string,
  meetingSessionId: string,
  newStatus: MeetingAnswerStatus,
  metadata?: Record<string, unknown>
): Promise<MeetingAnswer | null> {
  const [updated] = await db
    .update(meetingAnswers)
    .set({ status: newStatus, updatedAt: new Date() })
    .where(eq(meetingAnswers.id, answerId))
    .returning()

  if (!updated) return null

  const eventType = statusToEventType(newStatus)
  if (eventType) {
    await logAnswerEvent(answerId, meetingSessionId, eventType, metadata)
  }

  return updated
}

export async function markAnswerGrounded(
  answerId: string,
  meetingSessionId: string,
  answerText: string,
  grounding: MeetingAnswerGrounding
): Promise<MeetingAnswer | null> {
  const [updated] = await db
    .update(meetingAnswers)
    .set({
      status: 'grounded',
      answerText,
      groundingContext: grounding as Record<string, unknown>,
      updatedAt: new Date(),
    })
    .where(eq(meetingAnswers.id, answerId))
    .returning()

  if (!updated) return null

  await logAnswerEvent(answerId, meetingSessionId, 'grounded', {
    transcriptTurnCount: grounding.transcriptTurnCount,
    hasSnapshot: grounding.hasSnapshot,
    participantCount: grounding.participantCount,
  })

  return updated
}

export async function markAnswerDeliveredToUi(
  answerId: string,
  meetingSessionId: string
): Promise<MeetingAnswer | null> {
  const [updated] = await db
    .update(meetingAnswers)
    .set({ status: 'delivered_to_ui', updatedAt: new Date() })
    .where(eq(meetingAnswers.id, answerId))
    .returning()

  if (!updated) return null

  await logAnswerEvent(answerId, meetingSessionId, 'delivered_to_ui')

  return updated
}

export async function markAnswerDeliveredToChat(
  answerId: string,
  meetingSessionId: string
): Promise<MeetingAnswer | null> {
  const now = new Date()
  const [updated] = await db
    .update(meetingAnswers)
    .set({
      status: 'delivered_to_chat',
      deliveredToZoomChatAt: now,
      updatedAt: now,
    })
    .where(eq(meetingAnswers.id, answerId))
    .returning()

  if (!updated) return null

  await logAnswerEvent(answerId, meetingSessionId, 'delivered_to_chat')

  return updated
}

export async function suppressAnswer(
  answerId: string,
  meetingSessionId: string,
  reason: string
): Promise<MeetingAnswer | null> {
  const [updated] = await db
    .update(meetingAnswers)
    .set({ status: 'suppressed', suppressionReason: reason, updatedAt: new Date() })
    .where(eq(meetingAnswers.id, answerId))
    .returning()

  if (!updated) return null

  await logAnswerEvent(answerId, meetingSessionId, 'suppressed', { reason })

  return updated
}

export async function cancelAnswer(
  answerId: string,
  meetingSessionId: string,
  reason?: string
): Promise<MeetingAnswer | null> {
  const now = new Date()
  const [updated] = await db
    .update(meetingAnswers)
    .set({
      status: 'canceled',
      canceledAt: now,
      suppressionReason: reason ?? null,
      updatedAt: now,
    })
    .where(eq(meetingAnswers.id, answerId))
    .returning()

  if (!updated) return null

  await logAnswerEvent(answerId, meetingSessionId, 'canceled', reason ? { reason } : undefined)

  return updated
}

export async function markAnswerFailed(
  answerId: string,
  meetingSessionId: string,
  reason: string
): Promise<MeetingAnswer | null> {
  const [updated] = await db
    .update(meetingAnswers)
    .set({
      status: 'failed',
      suppressionReason: reason,
      updatedAt: new Date(),
    })
    .where(eq(meetingAnswers.id, answerId))
    .returning()

  if (!updated) return null

  await logAnswerEvent(answerId, meetingSessionId, 'failed', { reason })

  return updated
}

export async function markAnswerStale(
  answerId: string,
  meetingSessionId: string
): Promise<MeetingAnswer | null> {
  const now = new Date()
  const [updated] = await db
    .update(meetingAnswers)
    .set({ status: 'stale', staleAt: now, updatedAt: now })
    .where(eq(meetingAnswers.id, answerId))
    .returning()

  if (!updated) return null

  await logAnswerEvent(answerId, meetingSessionId, 'stale')

  return updated
}

export async function markAnswerSpeaking(
  answerId: string,
  meetingSessionId: string
): Promise<MeetingAnswer | null> {
  const [updated] = await db
    .update(meetingAnswers)
    .set({ status: 'speaking', updatedAt: new Date() })
    .where(eq(meetingAnswers.id, answerId))
    .returning()

  if (!updated) return null

  await logAnswerEvent(answerId, meetingSessionId, 'delivering_to_voice')

  return updated
}

export async function markAnswerDeliveredToVoice(
  answerId: string,
  meetingSessionId: string
): Promise<MeetingAnswer | null> {
  const now = new Date()
  const [updated] = await db
    .update(meetingAnswers)
    .set({ status: 'delivered_to_voice', deliveredToVoiceAt: now, updatedAt: now })
    .where(eq(meetingAnswers.id, answerId))
    .returning()

  if (!updated) return null

  await logAnswerEvent(answerId, meetingSessionId, 'delivered_to_voice')

  return updated
}

export async function markAnswerInterrupted(
  answerId: string,
  meetingSessionId: string,
  reason?: string
): Promise<MeetingAnswer | null> {
  const now = new Date()
  const [updated] = await db
    .update(meetingAnswers)
    .set({
      status: 'canceled',
      interruptedAt: now,
      canceledAt: now,
      suppressionReason: reason ?? 'Interrupted by newer voice response.',
      updatedAt: now,
    })
    .where(eq(meetingAnswers.id, answerId))
    .returning()

  if (!updated) return null

  await logAnswerEvent(answerId, meetingSessionId, 'interrupted', reason ? { reason } : undefined)

  return updated
}

export async function getAnswerWithEvents(answerId: string) {
  return db.query.meetingAnswers.findFirst({
    where: (fields, { eq }) => eq(fields.id, answerId),
    with: { events: { orderBy: (f, { asc }) => asc(f.occurredAt) } },
  })
}

export async function listMeetingAnswers(meetingSessionId: string) {
  return db.query.meetingAnswers.findMany({
    where: (fields, { eq }) => eq(fields.meetingSessionId, meetingSessionId),
    orderBy: (fields, { desc }) => desc(fields.createdAt),
    with: { events: { orderBy: (f, { asc }) => asc(f.occurredAt) } },
  })
}

// Stale-detection: an answer is stale if it is still in-flight (requested/preparing/grounded/speaking)
// but was created more than 2 minutes ago.
export function isAnswerStale(answer: MeetingAnswer): boolean {
  const inFlightStatuses: MeetingAnswerStatus[] = ['requested', 'preparing', 'grounded', 'speaking']
  if (!inFlightStatuses.includes(answer.status)) return false
  const ageMs = Date.now() - answer.createdAt.getTime()
  return ageMs > 2 * 60 * 1000
}

async function logAnswerEvent(
  answerId: string,
  meetingSessionId: string,
  eventType: MeetingAnswerEventType,
  metadata?: Record<string, unknown>
) {
  await db.insert(meetingAnswerEvents).values({
    answerId,
    meetingSessionId,
    eventType,
    metadata: metadata ?? null,
    occurredAt: new Date(),
  })
}

function statusToEventType(status: MeetingAnswerStatus): MeetingAnswerEventType | null {
  const map: Partial<Record<MeetingAnswerStatus, MeetingAnswerEventType>> = {
    preparing: 'generating',
    suppressed: 'suppressed',
    canceled: 'canceled',
    failed: 'failed',
    stale: 'stale',
    delivered_to_ui: 'delivered_to_ui',
    delivered_to_chat: 'delivered_to_chat',
    speaking: 'delivering_to_voice',
    delivered_to_voice: 'delivered_to_voice',
  }
  return map[status] ?? null
}
