import { describe, expect, it } from 'bun:test'
import {
  buildMeetingMemoryUpdateEvent,
  emitMeetingMemoryUpdateEvent,
} from './meeting-events'
import type { MeetingProviderEvent } from '../meetings/events'

const meetingSession = {
  id: 'meeting_123',
  orgId: 'org_123',
  provider: 'zoom',
  hostUserId: 'user_123',
  title: 'Q2 roadmap sync',
  status: 'listening',
} as const

const persistedEvent = {
  id: 'meeting_event_123',
  sequence: 42,
} as const

function transcriptEvent(
  overrides?: Partial<Extract<MeetingProviderEvent, { kind: 'transcript' }>>
): Extract<MeetingProviderEvent, { kind: 'transcript' }> {
  return {
    kind: 'transcript',
    provider: 'zoom',
    occurredAt: new Date('2026-04-30T15:00:00.000Z'),
    transcript: {
      content: 'We decided to move onboarding fixes into the launch checklist.',
      isPartial: false,
    },
    ...overrides,
  }
}

function lifecycleEvent(
  action: Extract<MeetingProviderEvent, { kind: 'lifecycle' }>['action'],
  state: Extract<MeetingProviderEvent, { kind: 'lifecycle' }>['state']
): Extract<MeetingProviderEvent, { kind: 'lifecycle' }> {
  return {
    kind: 'lifecycle',
    provider: 'zoom',
    occurredAt: new Date('2026-04-30T15:00:00.000Z'),
    action,
    state,
  }
}

describe('buildMeetingMemoryUpdateEvent', () => {
  it('builds a transcript-driven memory event for final transcript evidence', () => {
    const event = buildMeetingMemoryUpdateEvent({
      orgId: 'org_123',
      meetingSession,
      persistedEvent,
      event: transcriptEvent(),
    })

    expect(event).toMatchObject({
      orgId: 'org_123',
      source: 'meeting',
      visibility: 'shared',
      summary: 'Meeting "Q2 roadmap sync" has new transcript evidence.',
      actor: {
        userId: 'user_123',
      },
      payload: {
        meetingSessionId: 'meeting_123',
        eventId: 'meeting_event_123',
        lastEventSequence: 42,
        trigger: 'transcript_updated',
      },
    })
  })

  it('builds a completion event for meeting end signals', () => {
    const event = buildMeetingMemoryUpdateEvent({
      orgId: 'org_123',
      meetingSession: {
        ...meetingSession,
        status: 'ended',
      },
      persistedEvent,
      event: lifecycleEvent('meeting.ended', 'stopped'),
    })

    expect(event?.payload.trigger).toBe('completed')
    expect(event?.summary).toBe('Meeting "Q2 roadmap sync" completed.')
  })

  it('ignores low-signal lifecycle transitions like joining', () => {
    const event = buildMeetingMemoryUpdateEvent({
      orgId: 'org_123',
      meetingSession,
      persistedEvent,
      event: lifecycleEvent('meeting.joining', 'joining'),
    })

    expect(event).toBeNull()
  })

  it('ignores partial transcript updates', () => {
    const event = buildMeetingMemoryUpdateEvent({
      orgId: 'org_123',
      meetingSession,
      persistedEvent,
      event: transcriptEvent({
        transcript: {
          content: 'Still streaming',
          isPartial: true,
        },
      }),
    })

    expect(event).toBeNull()
  })
})

describe('emitMeetingMemoryUpdateEvent', () => {
  it('passes the normalized event to the shared memory scheduler', async () => {
    const seen: Array<unknown> = []

    const event = await emitMeetingMemoryUpdateEvent(
      {
        orgId: 'org_123',
        meetingSession,
        persistedEvent,
        event: lifecycleEvent('meeting.started', 'listening'),
      },
      async (memoryEvent) => {
        seen.push(memoryEvent)
      }
    )

    expect(seen).toHaveLength(1)
    expect(event?.payload.trigger).toBe('state_changed')
    expect((seen[0] as { payload: { trigger: string } }).payload.trigger).toBe(
      'state_changed'
    )
  })
})
