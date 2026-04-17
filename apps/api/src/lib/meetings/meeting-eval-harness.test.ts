import { describe, expect, it } from 'bun:test'
import type { MeetingProviderEvent } from './events'
import {
  evaluateStructuredInsightsRegression,
  replayMeetingEvalFixture,
} from './meeting-eval-harness'

function transcriptEvent(
  occurredAt: string,
  content: string,
  speaker: { providerParticipantId: string; displayName: string; email: string }
): MeetingProviderEvent {
  return {
    kind: 'transcript',
    provider: 'zoom',
    occurredAt: new Date(occurredAt),
    transcript: {
      content,
      speaker,
      isPartial: false,
    },
  }
}

describe('meeting eval harness', () => {
  it('replays a synthetic meeting fixture into transcript turns and participant identities', async () => {
    const replayed = await replayMeetingEvalFixture({
      name: 'pricing-decision',
      provider: 'zoom',
      orgDirectory: [
        {
          userId: 'user-1',
          name: 'Noah Milberger',
          email: 'noah@kodi.so',
        },
      ],
      events: [
        {
          payload: {
            normalizedEvents: [
              {
                kind: 'participant',
                provider: 'zoom',
                occurredAt: new Date('2026-04-12T10:00:00.000Z'),
                action: 'participant.joined',
                participant: {
                  providerParticipantId: 'p-1',
                  displayName: 'Noah Milberger',
                  email: 'noah@kodi.so',
                },
              },
              {
                kind: 'participant',
                provider: 'zoom',
                occurredAt: new Date('2026-04-12T10:00:01.000Z'),
                action: 'participant.joined',
                participant: {
                  providerParticipantId: 'p-2',
                  displayName: 'Guest Buyer',
                  email: 'buyer@acme.com',
                },
              },
              transcriptEvent(
                '2026-04-12T10:00:05.000Z',
                'We decided to move enterprise pricing into the pilot deck.',
                {
                  providerParticipantId: 'p-1',
                  displayName: 'Noah Milberger',
                  email: 'noah@kodi.so',
                }
              ),
              transcriptEvent(
                '2026-04-12T10:00:15.000Z',
                'I still need the final buyer objections list.',
                {
                  providerParticipantId: 'p-2',
                  displayName: 'Guest Buyer',
                  email: 'buyer@acme.com',
                }
              ),
            ],
          },
        },
      ],
    })

    expect(replayed.transcriptTurns).toHaveLength(2)
    expect(
      replayed.participants.find(
        (participant) => participant.email === 'noah@kodi.so'
      )?.resolution.classification
    ).toBe('internal')
    expect(
      replayed.participants.find(
        (participant) => participant.email === 'buyer@acme.com'
      )?.resolution.classification
    ).toBe('external')
  })

  it('scores structured insight regressions against expected fixture outputs', () => {
    const score = evaluateStructuredInsightsRegression({
      expected: {
        decisions: ['Move enterprise pricing into the pilot deck'],
        openQuestions: ['Need the final buyer objections list'],
        risks: ['Buyer objections are still incomplete'],
        candidateActionItems: ['Collect the final buyer objections list'],
      },
      actual: {
        decisions: [
          { summary: 'Move enterprise pricing into the pilot deck this week' },
        ],
        openQuestions: [{ summary: 'Need the final buyer objections list' }],
        risks: [{ summary: 'Buyer objections are still incomplete' }],
        candidateActionItems: [
          { title: 'Collect the final buyer objections list' },
        ],
      },
    })

    expect(score.decisions.matched).toBe(1)
    expect(score.openQuestions.matched).toBe(1)
    expect(score.risks.matched).toBe(1)
    expect(score.candidateActionItems.matched).toBe(1)
  })
})
