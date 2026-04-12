import {
  asc,
  db,
  desc,
  eq,
  type MeetingParticipant,
  type MeetingSession,
  type MeetingStateSnapshot,
  type TranscriptSegment,
} from '@kodi/db'

export type MeetingTranscriptTurn = {
  id: string
  speakerParticipantId: string | null
  speakerName: string | null
  content: string
  source: TranscriptSegment['source']
  createdAt: Date
  startOffsetMs: number | null
  endOffsetMs: number | null
  mergedSegmentCount: number
}

type LoadMeetingAnalysisContextInput = {
  meetingSessionId: string
  transcriptLimit?: number
}

export type LoadedMeetingAnalysisContext = {
  snapshot: MeetingStateSnapshot | null
  participants: MeetingParticipant[]
  transcriptSegments: TranscriptSegment[]
  transcriptTurns: MeetingTranscriptTurn[]
}

function normalizeTranscriptContent(value: string) {
  return value.trim().replace(/\s+/g, ' ').toLowerCase()
}

function speakerIdentityKey(input: {
  speakerParticipantId: string | null | undefined
  speakerName: string | null | undefined
}) {
  return (
    input.speakerParticipantId ??
    input.speakerName?.trim().toLowerCase() ??
    'unknown-speaker'
  )
}

function shouldMergeTranscriptTurns(
  previous: MeetingTranscriptTurn,
  current: TranscriptSegment
) {
  if (
    speakerIdentityKey(previous) !==
    speakerIdentityKey({
      speakerParticipantId: current.speakerParticipantId,
      speakerName: current.speakerName,
    })
  ) {
    return false
  }

  if (previous.source !== current.source) return false

  const previousCreatedAt = previous.createdAt.getTime()
  const currentCreatedAt = current.createdAt.getTime()
  if (currentCreatedAt - previousCreatedAt > 90_000) {
    return false
  }

  return true
}

function joinTranscriptContent(previous: string, current: string) {
  const previousNormalized = normalizeTranscriptContent(previous)
  const currentNormalized = normalizeTranscriptContent(current)

  if (!previousNormalized) return current.trim()
  if (!currentNormalized) return previous.trim()

  if (previousNormalized === currentNormalized) {
    return previous.length >= current.length ? previous.trim() : current.trim()
  }

  if (previousNormalized.startsWith(currentNormalized)) {
    return previous.trim()
  }

  if (currentNormalized.startsWith(previousNormalized)) {
    return current.trim()
  }

  const left = previous.trim()
  const right = current.trim()
  if (!left) return right
  if (!right) return left

  return `${left}${/\s$/.test(left) ? '' : ' '}${right}`
}

export function buildMeetingTranscriptTurns(
  transcriptSegments: TranscriptSegment[]
) {
  const turns: MeetingTranscriptTurn[] = []

  for (const segment of transcriptSegments) {
    if (segment.isPartial) continue

    const content = segment.content.trim()
    if (!content) continue

    const previous = turns[turns.length - 1]
    if (!previous || !shouldMergeTranscriptTurns(previous, segment)) {
      turns.push({
        id: segment.id,
        speakerParticipantId: segment.speakerParticipantId ?? null,
        speakerName: segment.speakerName ?? null,
        content,
        source: segment.source,
        createdAt: segment.createdAt,
        startOffsetMs: segment.startOffsetMs ?? null,
        endOffsetMs: segment.endOffsetMs ?? null,
        mergedSegmentCount: 1,
      })
      continue
    }

    previous.content = joinTranscriptContent(previous.content, content)
    previous.speakerParticipantId =
      previous.speakerParticipantId ?? segment.speakerParticipantId ?? null
    previous.speakerName = previous.speakerName ?? segment.speakerName ?? null
    previous.endOffsetMs = segment.endOffsetMs ?? previous.endOffsetMs
    previous.mergedSegmentCount += 1
  }

  return turns
}

export function formatOptionalDate(value: Date | null | undefined) {
  return value ? value.toISOString() : null
}

export function serializeMeetingParticipants(participants: MeetingParticipant[]) {
  return participants.map((participant) => ({
    displayName: participant.displayName,
    email: participant.email,
    isHost: participant.isHost,
    isInternal: participant.isInternal ?? null,
    joinedAt: formatOptionalDate(participant.joinedAt),
    leftAt: formatOptionalDate(participant.leftAt),
  }))
}

export function serializeMeetingTranscriptTurns(turns: MeetingTranscriptTurn[]) {
  return turns.map((turn) => ({
    speakerName: turn.speakerName,
    content: turn.content,
    createdAt: formatOptionalDate(turn.createdAt),
    source: turn.source,
    startOffsetMs: turn.startOffsetMs,
    endOffsetMs: turn.endOffsetMs,
    mergedSegmentCount: turn.mergedSegmentCount,
  }))
}

export function serializeMeetingSnapshot(snapshot: MeetingStateSnapshot | null) {
  return {
    summary: snapshot?.summary ?? null,
    rollingNotes: snapshot?.rollingNotes ?? null,
    activeTopics: snapshot?.activeTopics ?? [],
    decisions: snapshot?.decisions ?? [],
    openQuestions: snapshot?.openQuestions ?? [],
    risks: snapshot?.risks ?? [],
    candidateTasks: snapshot?.candidateTasks ?? [],
    candidateActionItems: snapshot?.candidateActionItems ?? [],
    draftActions: snapshot?.draftActions ?? [],
    lastEventSequence: snapshot?.lastEventSequence ?? null,
    lastProcessedAt: formatOptionalDate(snapshot?.lastProcessedAt),
    lastClassifiedAt: formatOptionalDate(snapshot?.lastClassifiedAt),
  }
}

export async function loadMeetingAnalysisContext(
  input: LoadMeetingAnalysisContextInput
): Promise<LoadedMeetingAnalysisContext> {
  const [snapshot, participants, transcriptSegments] = await Promise.all([
    db.query.meetingStateSnapshots.findFirst({
      where: (fields, { eq }) => eq(fields.meetingSessionId, input.meetingSessionId),
      orderBy: (fields, { desc }) => desc(fields.createdAt),
    }),
    db.query.meetingParticipants.findMany({
      where: (fields, { eq }) => eq(fields.meetingSessionId, input.meetingSessionId),
      orderBy: (fields, { asc }) => asc(fields.createdAt),
    }),
    db.query.transcriptSegments.findMany({
      where: (fields, { eq }) => eq(fields.meetingSessionId, input.meetingSessionId),
      orderBy: (fields, { desc }) => desc(fields.createdAt),
      limit: input.transcriptLimit ?? 60,
    }),
  ])

  const chronologicalTranscript = [...transcriptSegments].reverse()

  return {
    snapshot: snapshot ?? null,
    participants,
    transcriptSegments: chronologicalTranscript,
    transcriptTurns: buildMeetingTranscriptTurns(chronologicalTranscript),
  }
}

// Reuse the transcript turn shape anywhere we need meeting-scoped reasoning.
export function buildMeetingPromptContext(input: {
  meetingSession: MeetingSession
  analysis: LoadedMeetingAnalysisContext
  protocolVersion: string
}) {
  return {
    protocolVersion: input.protocolVersion,
    meeting: {
      meetingSessionId: input.meetingSession.id,
      provider: input.meetingSession.provider,
      title: input.meetingSession.title,
      status: input.meetingSession.status,
      scheduledStartAt: formatOptionalDate(input.meetingSession.scheduledStartAt),
      actualStartAt: formatOptionalDate(input.meetingSession.actualStartAt),
      endedAt: formatOptionalDate(input.meetingSession.endedAt),
    },
    participants: serializeMeetingParticipants(input.analysis.participants),
    priorState: serializeMeetingSnapshot(input.analysis.snapshot),
    transcriptWindow: serializeMeetingTranscriptTurns(input.analysis.transcriptTurns),
  }
}
