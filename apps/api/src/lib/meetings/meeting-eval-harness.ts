import type { MeetingProviderEvent, MeetingProviderSlug } from './events'
import {
  buildMeetingTranscriptTurns,
} from './meeting-analysis-context'
import {
  buildMeetingOrgIdentityDirectory,
  resolveMeetingParticipantIdentity,
  type MeetingOrgIdentityMember,
  type ResolvedMeetingParticipantIdentity,
} from './participant-identity'
import {
  replaySimulatedMeetingEvents,
  type SimulatedProviderEnvelopeInput,
} from './provider-simulator'

type HarnessParticipant = {
  stableParticipantKey: string
  displayName: string | null
  email: string | null
  providerParticipantId: string | null
  resolution: ResolvedMeetingParticipantIdentity
}

export type MeetingEvalFixture = {
  name: string
  provider: MeetingProviderSlug
  orgDirectory: MeetingOrgIdentityMember[]
  events: SimulatedProviderEnvelopeInput[]
}

export type StructuredInsightEvalInput = {
  decisions?: Array<{ summary?: string | null } | string>
  openQuestions?: Array<{ summary?: string | null } | string>
  risks?: Array<{ summary?: string | null } | string>
  candidateActionItems?: Array<{ title?: string | null } | string>
}

function normalizeSummary(value: string) {
  return value.trim().toLowerCase().replace(/\s+/g, ' ')
}

function extractInsightText(
  item: { summary?: string | null; title?: string | null } | string
) {
  if (typeof item === 'string') return item
  return item.summary ?? item.title ?? ''
}

function scoreInsightCollection(
  expected: string[],
  actual: Array<{ summary?: string | null; title?: string | null } | string>
) {
  const normalizedActual = actual
    .map(extractInsightText)
    .map(normalizeSummary)
    .filter(Boolean)

  const normalizedExpected = expected.map(normalizeSummary).filter(Boolean)
  const matched = normalizedExpected.filter((expectedItem) =>
    normalizedActual.some(
      (actualItem) =>
        actualItem === expectedItem ||
        actualItem.includes(expectedItem) ||
        expectedItem.includes(actualItem)
    )
  )

  return {
    matched: matched.length,
    total: normalizedExpected.length,
    missing: normalizedExpected.filter((item) => !matched.includes(item)),
  }
}

export async function replayMeetingEvalFixture(fixture: MeetingEvalFixture) {
  const batches = await replaySimulatedMeetingEvents({
    provider: fixture.provider,
    events: fixture.events,
  })

  const normalizedEvents = batches.flatMap((batch) => batch.normalizedEvents)
  const directory = buildMeetingOrgIdentityDirectory(fixture.orgDirectory)
  const participantMap = new Map<string, HarnessParticipant>()
  const transcriptLikeSegments: Array<{
    id: string
    meetingSessionId: string
    eventId: string | null
    speakerParticipantId: string | null
    speakerName: string | null
    content: string
    startOffsetMs: number | null
    endOffsetMs: number | null
    confidence: number | null
    isPartial: boolean
    source: 'worker'
    createdAt: Date
  }> = []

  function registerIdentity(identity: {
    providerParticipantId?: string | null
    displayName?: string | null
    email?: string | null
  }) {
    const resolution = resolveMeetingParticipantIdentity({
      provider: fixture.provider,
      participant: identity,
      directory,
    })

    const existing = participantMap.get(resolution.stableParticipantKey)
    participantMap.set(resolution.stableParticipantKey, {
      stableParticipantKey: resolution.stableParticipantKey,
      displayName: identity.displayName ?? existing?.displayName ?? null,
      email: identity.email ?? existing?.email ?? null,
      providerParticipantId:
        identity.providerParticipantId ?? existing?.providerParticipantId ?? null,
      resolution,
    })

    return resolution
  }

  normalizedEvents.forEach((event, index) => {
    if (event.kind === 'participant') {
      registerIdentity(event.participant)
      return
    }

    if (event.kind === 'chat' && event.message.sender) {
      registerIdentity(event.message.sender)
      return
    }

    if (event.kind === 'transcript') {
      const resolution = event.transcript.speaker
        ? registerIdentity(event.transcript.speaker)
        : null

      transcriptLikeSegments.push({
        id: `fixture-segment-${index + 1}`,
        meetingSessionId: 'fixture-meeting',
        eventId: null,
        speakerParticipantId: resolution?.stableParticipantKey ?? null,
        speakerName: event.transcript.speaker?.displayName ?? null,
        content: event.transcript.content,
        startOffsetMs: event.transcript.startOffsetMs ?? null,
        endOffsetMs: event.transcript.endOffsetMs ?? null,
        confidence: event.transcript.confidence ?? null,
        isPartial: event.transcript.isPartial ?? false,
        source: 'worker',
        createdAt: event.occurredAt,
      })
    }
  })

  const transcriptTurns = buildMeetingTranscriptTurns(transcriptLikeSegments)

  return {
    normalizedEvents,
    participants: [...participantMap.values()],
    transcriptTurns,
  }
}

export function evaluateStructuredInsightsRegression(input: {
  expected: {
    decisions?: string[]
    openQuestions?: string[]
    risks?: string[]
    candidateActionItems?: string[]
  }
  actual: StructuredInsightEvalInput
}) {
  return {
    decisions: scoreInsightCollection(
      input.expected.decisions ?? [],
      input.actual.decisions ?? []
    ),
    openQuestions: scoreInsightCollection(
      input.expected.openQuestions ?? [],
      input.actual.openQuestions ?? []
    ),
    risks: scoreInsightCollection(
      input.expected.risks ?? [],
      input.actual.risks ?? []
    ),
    candidateActionItems: scoreInsightCollection(
      input.expected.candidateActionItems ?? [],
      input.actual.candidateActionItems ?? []
    ),
  }
}
