import { describe, expect, it } from 'bun:test'
import {
  buildMeetingOrgIdentityDirectory,
  buildParticipantStableKey,
  resolveMeetingParticipantIdentity,
} from './participant-identity'

const directory = buildMeetingOrgIdentityDirectory([
  {
    userId: 'user-1',
    name: 'Noah Milberger',
    email: 'noah@kodi.so',
  },
  {
    userId: 'user-2',
    name: 'Aly Singh',
    email: 'aly@kodi.so',
  },
])

describe('resolveMeetingParticipantIdentity', () => {
  it('matches internal participants by exact email', () => {
    const resolved = resolveMeetingParticipantIdentity({
      provider: 'zoom',
      participant: {
        providerParticipantId: 'zoom-1',
        displayName: 'Noah Milberger',
        email: 'NOAH@kodi.so',
      },
      directory,
      rejoinCount: 1,
    })

    expect(resolved.classification).toBe('internal')
    expect(resolved.confidence).toBe(1)
    expect(resolved.matchedUserId).toBe('user-1')
    expect(resolved.rejoinCount).toBe(1)
  })

  it('classifies outside email domains as external', () => {
    const resolved = resolveMeetingParticipantIdentity({
      provider: 'zoom',
      participant: {
        providerParticipantId: 'zoom-2',
        displayName: 'Vendor Guest',
        email: 'guest@outside.dev',
      },
      directory,
    })

    expect(resolved.classification).toBe('external')
    expect(resolved.matchedUserId).toBeNull()
  })

  it('builds stable keys from the strongest available identity', () => {
    expect(
      buildParticipantStableKey({
        providerParticipantId: 'provider-1',
        email: 'person@example.com',
        displayName: 'Person Example',
      })
    ).toBe('provider:provider-1')

    expect(
      buildParticipantStableKey({
        email: 'person@example.com',
      })
    ).toBe('email:person@example.com')
  })
})
