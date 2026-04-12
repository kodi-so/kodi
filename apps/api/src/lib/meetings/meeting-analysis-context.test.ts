import { describe, expect, it } from 'bun:test'
import type { TranscriptSegment } from '@kodi/db'
import { buildMeetingTranscriptTurns } from './meeting-analysis-context'

function makeSegment(
  id: string,
  input: Partial<TranscriptSegment> & Pick<TranscriptSegment, 'content'>
): TranscriptSegment {
  return {
    id,
    meetingSessionId: 'meeting-1',
    eventId: null,
    speakerParticipantId: input.speakerParticipantId ?? null,
    speakerName: input.speakerName ?? null,
    content: input.content,
    startOffsetMs: input.startOffsetMs ?? null,
    endOffsetMs: input.endOffsetMs ?? null,
    confidence: input.confidence ?? null,
    isPartial: input.isPartial ?? false,
    source: input.source ?? 'recall_webhook',
    createdAt: input.createdAt ?? new Date('2026-04-11T07:00:00.000Z'),
  }
}

describe('buildMeetingTranscriptTurns', () => {
  it('merges adjacent committed segments for the same speaker', () => {
    const turns = buildMeetingTranscriptTurns([
      makeSegment('seg-1', {
        speakerName: 'Noah',
        content: 'We should ship the Zoom copilot',
        createdAt: new Date('2026-04-11T07:00:00.000Z'),
      }),
      makeSegment('seg-2', {
        speakerName: 'Noah',
        content: 'after we finish the understanding layer.',
        createdAt: new Date('2026-04-11T07:00:25.000Z'),
      }),
    ])

    expect(turns).toHaveLength(1)
    expect(turns[0]?.content).toBe(
      'We should ship the Zoom copilot after we finish the understanding layer.'
    )
    expect(turns[0]?.mergedSegmentCount).toBe(2)
  })

  it('ignores partial rows and keeps different speakers separate', () => {
    const turns = buildMeetingTranscriptTurns([
      makeSegment('seg-1', {
        speakerName: 'Noah',
        content: 'This partial should not become a turn',
        isPartial: true,
      }),
      makeSegment('seg-2', {
        speakerName: 'Noah',
        content: 'First committed turn',
        createdAt: new Date('2026-04-11T07:00:15.000Z'),
      }),
      makeSegment('seg-3', {
        speakerName: 'Kodi',
        content: 'Second committed turn',
        createdAt: new Date('2026-04-11T07:00:35.000Z'),
      }),
    ])

    expect(turns).toHaveLength(2)
    expect(turns.map((turn) => turn.speakerName)).toEqual(['Noah', 'Kodi'])
  })
})
