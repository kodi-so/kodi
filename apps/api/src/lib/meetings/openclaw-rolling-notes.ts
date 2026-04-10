import {
  db,
  desc,
  eq,
  meetingSessions,
  transcriptSegments,
} from '@kodi/db'
import type { MeetingParticipant, MeetingSession, TranscriptSegment } from '@kodi/db'
import { z } from 'zod'
import { openClawChatCompletion } from '../openclaw/client'
import { saveMeetingStateSnapshotPatch } from './state-snapshots'

const rollingNotesSchema = z.object({
  summary: z.string().nullish(),
  rollingNotes: z.string().nullish(),
  activeTopics: z.array(z.string()).nullish(),
})

type ProcessMeetingRollingNotesInput = {
  orgId: string
  meetingSession: MeetingSession
  lastEventSequence: number
}

function formatDate(value: Date | null | undefined) {
  return value ? value.toISOString() : null
}

function serializeParticipants(participants: MeetingParticipant[]) {
  return participants.map((participant) => ({
    displayName: participant.displayName,
    email: participant.email,
    isHost: participant.isHost,
    joinedAt: formatDate(participant.joinedAt),
    leftAt: formatDate(participant.leftAt),
  }))
}

function serializeTranscriptWindow(segments: TranscriptSegment[]) {
  return segments.map((segment) => ({
    id: segment.id,
    speakerName: segment.speakerName,
    content: segment.content,
    isPartial: segment.isPartial,
    source: segment.source,
    createdAt: formatDate(segment.createdAt),
    startOffsetMs: segment.startOffsetMs,
    endOffsetMs: segment.endOffsetMs,
  }))
}

function buildRollingNotesMessages(input: {
  meetingSession: MeetingSession
  participants: MeetingParticipant[]
  transcriptWindow: TranscriptSegment[]
}) {
  return [
    {
      role: 'system' as const,
      content:
        'You are Kodi meeting intelligence running inside OpenClaw. Read the provided JSON meeting context and transcript window, then reply with JSON only and no prose. Return this shape: {"summary":"short current summary","rollingNotes":"bullet-style running notes as plain text","activeTopics":["topic one","topic two"]}. Keep summary concise, keep rollingNotes grounded in the transcript, and do not invent facts.',
    },
    {
      role: 'user' as const,
      content: JSON.stringify({
        protocolVersion: 'kodi.meeting.notes.v1',
        meeting: {
          meetingSessionId: input.meetingSession.id,
          provider: input.meetingSession.provider,
          title: input.meetingSession.title,
          status: input.meetingSession.status,
          actualStartAt: formatDate(input.meetingSession.actualStartAt),
          endedAt: formatDate(input.meetingSession.endedAt),
        },
        participants: serializeParticipants(input.participants),
        transcriptWindow: serializeTranscriptWindow(input.transcriptWindow),
      }),
    },
  ]
}

function parseRollingNotes(content: string) {
  const normalized = content
    .trim()
    .replace(/^```json\s*/i, '')
    .replace(/^```\s*/i, '')
    .replace(/\s*```$/i, '')

  try {
    return rollingNotesSchema.parse(JSON.parse(normalized))
  } catch {
    return null
  }
}

export async function processMeetingRollingNotes(
  input: ProcessMeetingRollingNotesInput
) {
  const lastSnapshot = await db.query.meetingStateSnapshots.findFirst({
    where: (fields, { eq }) => eq(fields.meetingSessionId, input.meetingSession.id),
    orderBy: (fields, { desc }) => desc(fields.createdAt),
    columns: {
      id: true,
      lastEventSequence: true,
    },
  })

  if (
    lastSnapshot?.lastEventSequence != null &&
    lastSnapshot.lastEventSequence >= input.lastEventSequence
  ) {
    return { ok: true as const, skipped: 'already-processed' as const }
  }

  const [participants, transcriptWindow] = await Promise.all([
    db.query.meetingParticipants.findMany({
      where: (fields, { eq }) => eq(fields.meetingSessionId, input.meetingSession.id),
      orderBy: (fields, { asc }) => asc(fields.createdAt),
    }),
    db.query.transcriptSegments.findMany({
      where: (fields, { eq }) => eq(fields.meetingSessionId, input.meetingSession.id),
      orderBy: (fields, { desc }) => desc(fields.createdAt),
      limit: 40,
    }),
  ])

  if (transcriptWindow.length === 0) {
    return { ok: true as const, skipped: 'no-transcript' as const }
  }

  const response = await openClawChatCompletion({
    orgId: input.orgId,
    messages: buildRollingNotesMessages({
      meetingSession: input.meetingSession,
      participants,
      transcriptWindow: [...transcriptWindow].reverse(),
    }),
    timeoutMs: 15_000,
  })

  if (!response.ok) {
    return response
  }

  const snapshot = parseRollingNotes(response.content)
  if (!snapshot) {
    return {
      ok: false as const,
      reason: 'invalid-response' as const,
      error: 'OpenClaw rolling notes response was not valid JSON.',
      raw: response.content,
    }
  }

  await saveMeetingStateSnapshotPatch({
    meetingSessionId: input.meetingSession.id,
    lastEventSequence: input.lastEventSequence,
    patch: {
    summary: snapshot.summary ?? null,
    rollingNotes: snapshot.rollingNotes ?? null,
    activeTopics: snapshot.activeTopics ?? null,
    lastProcessedAt: new Date(),
    },
  })

  await db
    .update(meetingSessions)
    .set({
      liveSummary: snapshot.summary ?? input.meetingSession.liveSummary,
      updatedAt: new Date(),
    })
    .where(eq(meetingSessions.id, input.meetingSession.id))

  return {
    ok: true as const,
    snapshot,
  }
}
