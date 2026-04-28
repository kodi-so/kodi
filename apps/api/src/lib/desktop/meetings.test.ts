import { describe, expect, test } from 'bun:test'
import {
  duplicateGroupKey,
  normalizeJoinMetadata,
  serializeUpcoming,
} from './meetings'

describe('desktop meeting helpers', () => {
  test('infers supported providers from scheduled event URLs', () => {
    expect(
      normalizeJoinMetadata('https://meet.google.com/abc-defg-hij')
    ).toEqual({
      conferenceProvider: 'google_meet',
      externalMeetingId: 'abc-defg-hij',
    })
    expect(normalizeJoinMetadata('https://kodi.zoom.us/j/123456789')).toEqual({
      conferenceProvider: 'zoom',
      externalMeetingId: '123456789',
    })
  })

  test('builds deterministic duplicate grouping keys', () => {
    const startsAt = new Date('2026-04-28T15:00:00.000Z')
    expect(
      duplicateGroupKey({
        iCalUid: 'event-1',
        title: 'Planning',
        startsAt,
      })
    ).toBe('ical:event-1')
    expect(
      duplicateGroupKey({
        title: 'Planning',
        startsAt,
        joinUrl: 'https://meet.google.com/abc-defg-hij',
      })
    ).toBe('url:https://meet.google.com/abc-defg-hij')
  })

  test('never offers broken external actions for unsupported events', () => {
    const row = {
      id: 'candidate-1',
      orgId: 'org-1',
      userId: 'user-1',
      calendarProvider: 'google_calendar',
      connectedAccountId: 'acct-1',
      externalEventId: 'event-1',
      iCalUid: null,
      title: 'Room sync',
      description: null,
      location: null,
      startsAt: new Date('2026-04-28T15:00:00.000Z'),
      endsAt: null,
      responseStatus: 'accepted',
      attendees: null,
      joinUrl: null,
      conferenceProvider: null,
      externalMeetingId: null,
      isCanceled: false,
      isLikelyMeeting: true,
      duplicateGroupKey: null,
      meetingSessionId: null,
      lastSyncedAt: new Date(),
      metadata: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    } as const

    expect(serializeUpcoming(row).suggestedAction).toBe('start_local_note')
  })
})
