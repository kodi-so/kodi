import { describe, expect, test } from 'bun:test'
import { createComposioSessionCache } from './session'

const AGENT_A = 'agent_aaa'
const AGENT_B = 'agent_bbb'
const SESSION_1 = 'sess_1'
const SESSION_2 = 'sess_2'

describe('createComposioSessionCache', () => {
  test('setSession adds a new entry with empty allowed set', () => {
    const c = createComposioSessionCache()
    const entry = c.setSession({
      openclaw_agent_id: AGENT_A,
      composio_session_id: SESSION_1,
    })
    expect(entry.composio_session_id).toBe(SESSION_1)
    expect(Array.from(entry.allowedToolNames)).toEqual([])
    expect(c.getSession(AGENT_A)).toBe(entry)
  })

  test('setSession on existing agent refreshes session_id but preserves allowed set', () => {
    const c = createComposioSessionCache()
    const first = c.setSession({
      openclaw_agent_id: AGENT_A,
      composio_session_id: SESSION_1,
    })
    first.allowedToolNames.add('composio__agent_aaa__gmail__send_email')

    const second = c.setSession({
      openclaw_agent_id: AGENT_A,
      composio_session_id: SESSION_2,
    })
    expect(second).toBe(first) // same object, mutated
    expect(second.composio_session_id).toBe(SESSION_2)
    expect(second.allowedToolNames.has('composio__agent_aaa__gmail__send_email')).toBe(true)
  })

  test('rotateSession swaps id without touching allowed set', () => {
    const c = createComposioSessionCache()
    const entry = c.setSession({
      openclaw_agent_id: AGENT_A,
      composio_session_id: SESSION_1,
    })
    entry.allowedToolNames.add('composio__agent_aaa__slack__post')

    const rotated = c.rotateSession({
      openclaw_agent_id: AGENT_A,
      composio_session_id: SESSION_2,
    })
    expect(rotated?.composio_session_id).toBe(SESSION_2)
    expect(rotated?.allowedToolNames.has('composio__agent_aaa__slack__post')).toBe(true)
  })

  test('rotateSession returns undefined for unknown agent (no-op)', () => {
    const c = createComposioSessionCache()
    expect(
      c.rotateSession({
        openclaw_agent_id: 'agent_unknown',
        composio_session_id: SESSION_2,
      }),
    ).toBeUndefined()
  })

  test('getSession returns undefined for unknown agent', () => {
    const c = createComposioSessionCache()
    expect(c.getSession('nope')).toBeUndefined()
  })

  test('dropSession returns the removed entry and clears it', () => {
    const c = createComposioSessionCache()
    c.setSession({ openclaw_agent_id: AGENT_A, composio_session_id: SESSION_1 })
    const removed = c.dropSession(AGENT_A)
    expect(removed?.composio_session_id).toBe(SESSION_1)
    expect(c.getSession(AGENT_A)).toBeUndefined()
  })

  test('dropSession returns undefined for unknown agent', () => {
    const c = createComposioSessionCache()
    expect(c.dropSession('nope')).toBeUndefined()
  })

  test('list returns one entry per agent', () => {
    const c = createComposioSessionCache()
    c.setSession({ openclaw_agent_id: AGENT_A, composio_session_id: SESSION_1 })
    c.setSession({ openclaw_agent_id: AGENT_B, composio_session_id: SESSION_2 })
    const ids = c.list().map((x) => x.openclaw_agent_id).sort()
    expect(ids).toEqual([AGENT_A, AGENT_B])
  })

  test('clear empties everything', () => {
    const c = createComposioSessionCache()
    c.setSession({ openclaw_agent_id: AGENT_A, composio_session_id: SESSION_1 })
    c.setSession({ openclaw_agent_id: AGENT_B, composio_session_id: SESSION_2 })
    c.clear()
    expect(c.list()).toEqual([])
  })
})
