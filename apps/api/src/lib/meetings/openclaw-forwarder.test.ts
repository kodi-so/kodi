import { describe, expect, it } from 'bun:test'
import { forwardMeetingEventToOpenClaw } from './openclaw-forwarder'

describe('forwardMeetingEventToOpenClaw', () => {
  it('skips transcript forwarding because transcript analysis already reads from Postgres', async () => {
    const result = await forwardMeetingEventToOpenClaw({
      orgId: 'org-1',
      meetingSession: {
        id: 'meeting-1',
        orgId: 'org-1',
        provider: 'zoom',
        providerInstallationId: null,
        providerMeetingId: null,
        providerMeetingUuid: null,
        providerMeetingInstanceId: null,
        providerBotSessionId: null,
        hostUserId: null,
        title: 'Test meeting',
        agenda: null,
        language: null,
        status: 'listening',
        consentState: null,
        liveSummary: null,
        finalSummary: null,
        scheduledStartAt: null,
        actualStartAt: null,
        endedAt: null,
        metadata: null,
        createdAt: new Date('2026-04-13T00:00:00.000Z'),
        updatedAt: new Date('2026-04-13T00:00:00.000Z'),
      },
      persistedEvent: {
        id: 'event-1',
        meetingSessionId: 'meeting-1',
        sequence: 42,
        eventType: 'meeting.transcript.segment_received',
        source: 'recall_webhook',
        dedupeKey: null,
        payload: null,
        occurredAt: new Date('2026-04-13T00:00:00.000Z'),
      },
      event: {
        kind: 'transcript',
        provider: 'zoom',
        occurredAt: new Date('2026-04-13T00:00:00.000Z'),
        transcript: {
          content: 'Kodi what did we decide?',
          isPartial: false,
        },
      },
      source: 'recall_webhook',
    })

    expect(result).toEqual({
      ok: true,
      skipped: 'transcript-event',
    })
  })
})
