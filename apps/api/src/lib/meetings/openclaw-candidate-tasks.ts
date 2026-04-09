import { db, desc, eq, transcriptSegments } from '@kodi/db'
import type { MeetingParticipant, MeetingSession, TranscriptSegment } from '@kodi/db'
import { z } from 'zod'
import { openClawChatCompletion } from '../openclaw/client'
import { saveMeetingStateSnapshotPatch } from './state-snapshots'

const candidateTasksSchema = z.object({
  candidateTasks: z.array(
    z.object({
      title: z.string(),
      ownerHint: z.string().nullish(),
      confidence: z.number().min(0).max(1),
      sourceEvidence: z.array(z.string()).default([]),
    })
  ),
})

type ProcessCandidateTasksInput = {
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
  }))
}

function serializeTranscriptWindow(segments: TranscriptSegment[]) {
  return segments.map((segment) => ({
    speakerName: segment.speakerName,
    content: segment.content,
    createdAt: formatDate(segment.createdAt),
  }))
}

function buildCandidateTaskMessages(input: {
  meetingSession: MeetingSession
  participants: MeetingParticipant[]
  transcriptWindow: TranscriptSegment[]
  rollingSummary: string | null
  rollingNotes: string | null
}) {
  return [
    {
      role: 'system' as const,
      content:
        'You are Kodi meeting intelligence running inside OpenClaw. Read the meeting transcript window and existing rolling notes, then identify likely follow-up tasks that were discussed or clearly implied. Reply with JSON only and no prose using this shape: {"candidateTasks":[{"title":"task title","ownerHint":"person or team","confidence":0.0,"sourceEvidence":["quote or short evidence"]}]}. Only include tasks with concrete evidence. Keep titles short and actionable.',
    },
    {
      role: 'user' as const,
      content: JSON.stringify({
        protocolVersion: 'kodi.meeting.tasks.v1',
        meeting: {
          meetingSessionId: input.meetingSession.id,
          provider: input.meetingSession.provider,
          title: input.meetingSession.title,
          status: input.meetingSession.status,
        },
        participants: serializeParticipants(input.participants),
        rollingSummary: input.rollingSummary,
        rollingNotes: input.rollingNotes,
        transcriptWindow: serializeTranscriptWindow(input.transcriptWindow),
      }),
    },
  ]
}

function parseCandidateTasks(content: string) {
  const normalized = content
    .trim()
    .replace(/^```json\s*/i, '')
    .replace(/^```\s*/i, '')
    .replace(/\s*```$/i, '')

  try {
    return candidateTasksSchema.parse(JSON.parse(normalized))
  } catch {
    return null
  }
}

export async function processMeetingCandidateTasks(
  input: ProcessCandidateTasksInput
) {
  const [latestSnapshot, participants, transcriptWindow] = await Promise.all([
    db.query.meetingStateSnapshots.findFirst({
      where: (fields, { eq }) => eq(fields.meetingSessionId, input.meetingSession.id),
      orderBy: (fields, { desc }) => desc(fields.createdAt),
    }),
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
    messages: buildCandidateTaskMessages({
      meetingSession: input.meetingSession,
      participants,
      transcriptWindow: [...transcriptWindow].reverse(),
      rollingSummary: latestSnapshot?.summary ?? null,
      rollingNotes: latestSnapshot?.rollingNotes ?? null,
    }),
    timeoutMs: 15_000,
  })

  if (!response.ok) {
    return response
  }

  const parsed = parseCandidateTasks(response.content)
  if (!parsed) {
    return {
      ok: false as const,
      reason: 'invalid-response' as const,
      error: 'OpenClaw candidate task response was not valid JSON.',
      raw: response.content,
    }
  }

  await saveMeetingStateSnapshotPatch({
    meetingSessionId: input.meetingSession.id,
    lastEventSequence: input.lastEventSequence,
    patch: {
      candidateTasks: parsed.candidateTasks,
      lastClassifiedAt: new Date(),
    },
  })

  return {
    ok: true as const,
    candidateTasks: parsed.candidateTasks,
  }
}
