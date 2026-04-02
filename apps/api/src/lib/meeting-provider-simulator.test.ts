import { describe, expect, test } from 'bun:test'
import { MeetingProviderRegistry } from './meeting-provider-registry'
import { createSimulatedMeetingProviderGateway, replaySimulatedMeetingEvents, SimulatedMeetingProviderAdapter } from './meeting-provider-simulator'

describe('meeting provider simulator', () => {
  test('replays synthetic provider events through the normalized gateway path', async () => {
    const batches = await replaySimulatedMeetingEvents({
      provider: 'simulated',
      events: [
        {
          session: { internalMeetingSessionId: 'meeting_123' },
          payload: {
            normalizedEvents: [
              {
                kind: 'lifecycle',
                provider: 'simulated',
                occurredAt: new Date('2026-04-02T12:00:00.000Z'),
                session: { internalMeetingSessionId: 'meeting_123' },
                action: 'meeting.started',
                state: 'listening',
              },
              {
                kind: 'transcript',
                provider: 'simulated',
                occurredAt: new Date('2026-04-02T12:00:01.000Z'),
                session: { internalMeetingSessionId: 'meeting_123' },
                transcript: {
                  content: 'Let us ship the provider adapter first.',
                  speaker: {
                    providerParticipantId: 'participant_1',
                    displayName: 'Kodi Bot',
                  },
                },
              },
            ],
          },
        },
      ],
    })

    expect(batches).toHaveLength(1)
    expect(batches[0]?.normalizedEvents).toHaveLength(2)
    expect(batches[0]?.normalizedEvents[0]?.kind).toBe('lifecycle')
    expect(batches[0]?.normalizedEvents[1]?.kind).toBe('transcript')
  })

  test('simulated adapters can be registered and resolved like any other provider', () => {
    const registry = new MeetingProviderRegistry([
      new SimulatedMeetingProviderAdapter('simulated'),
    ])

    expect(registry.has('simulated')).toBe(true)
    expect(registry.resolve('simulated').provider).toBe('simulated')
  })

  test('simulated gateway exposes provider health without a live integration', async () => {
    const gateway = createSimulatedMeetingProviderGateway('simulated')
    const health = await gateway.getHealth({
      orgId: 'org_123',
      provider: 'simulated',
    })

    expect(health.status).toBe('healthy')
    expect(health.metadata?.mode).toBe('simulation')
  })
})
