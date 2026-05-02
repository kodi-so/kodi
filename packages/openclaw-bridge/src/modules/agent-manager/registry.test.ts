import { describe, expect, test } from 'bun:test'
import { createAgentRegistry, type AgentRegistryEntry } from './registry'

const ENTRY_A: AgentRegistryEntry = {
  user_id: '11111111-1111-4111-8111-111111111111',
  openclaw_agent_id: 'agent_aaa1',
  workspace_dir: '/state/kodi-workspaces/agent_aaa1',
  composio_status: 'active',
  created_at: '2026-05-02T12:00:00.000Z',
}

const ENTRY_B: AgentRegistryEntry = {
  user_id: '22222222-2222-4222-8222-222222222222',
  openclaw_agent_id: 'agent_bbb2',
  workspace_dir: '/state/kodi-workspaces/agent_bbb2',
  composio_status: 'pending',
  created_at: '2026-05-02T12:01:00.000Z',
}

describe('createAgentRegistry', () => {
  test('add then getByUser returns the entry', () => {
    const r = createAgentRegistry()
    r.add(ENTRY_A)
    expect(r.getByUser(ENTRY_A.user_id)).toEqual(ENTRY_A)
  })

  test('add then getByAgentId returns the entry', () => {
    const r = createAgentRegistry()
    r.add(ENTRY_A)
    expect(r.getByAgentId(ENTRY_A.openclaw_agent_id)).toEqual(ENTRY_A)
  })

  test('list returns every entry, count matches', () => {
    const r = createAgentRegistry()
    r.add(ENTRY_A)
    r.add(ENTRY_B)
    expect(r.list().length).toBe(2)
    expect(r.count()).toBe(2)
    const ids = r.list().map((e) => e.openclaw_agent_id).sort()
    expect(ids).toEqual(['agent_aaa1', 'agent_bbb2'])
  })

  test('add for the same user replaces the previous entry in both indexes', () => {
    const r = createAgentRegistry()
    r.add(ENTRY_A)
    const replacement: AgentRegistryEntry = {
      ...ENTRY_A,
      openclaw_agent_id: 'agent_aaa1_new',
      workspace_dir: '/state/kodi-workspaces/agent_aaa1_new',
    }
    r.add(replacement)
    // Only the new entry is reachable by user; both ids stay reachable until
    // the caller removes the old one — the registry doesn't auto-orphan
    // because mid-rotation the old agent might still be receiving events.
    expect(r.getByUser(ENTRY_A.user_id)).toEqual(replacement)
    expect(r.getByAgentId('agent_aaa1_new')).toEqual(replacement)
  })

  test('remove(known) returns entry and clears both indexes', () => {
    const r = createAgentRegistry()
    r.add(ENTRY_A)
    r.add(ENTRY_B)
    const removed = r.remove(ENTRY_A.openclaw_agent_id)
    expect(removed).toEqual(ENTRY_A)
    expect(r.getByUser(ENTRY_A.user_id)).toBeUndefined()
    expect(r.getByAgentId(ENTRY_A.openclaw_agent_id)).toBeUndefined()
    expect(r.list()).toEqual([ENTRY_B])
    expect(r.count()).toBe(1)
  })

  test('remove(unknown) returns undefined and does not throw', () => {
    const r = createAgentRegistry()
    expect(r.remove('agent_nonexistent')).toBeUndefined()
  })

  test('clear empties both indexes', () => {
    const r = createAgentRegistry()
    r.add(ENTRY_A)
    r.add(ENTRY_B)
    r.clear()
    expect(r.list()).toEqual([])
    expect(r.count()).toBe(0)
    expect(r.getByUser(ENTRY_A.user_id)).toBeUndefined()
  })
})
