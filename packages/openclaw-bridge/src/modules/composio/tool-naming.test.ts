import { describe, expect, test } from 'bun:test'
import { buildComposioToolName, parseComposioToolName } from './tool-naming'

describe('buildComposioToolName', () => {
  test('joins prefix, agent id, toolkit, action with __', () => {
    expect(
      buildComposioToolName({
        openclaw_agent_id: 'agent_aaa',
        toolkit: 'gmail',
        action: 'send_email',
      }),
    ).toBe('composio__agent_aaa__gmail__send_email')
  })
})

describe('parseComposioToolName', () => {
  test('round-trips a valid name', () => {
    const built = buildComposioToolName({
      openclaw_agent_id: 'agent_bbb',
      toolkit: 'slack',
      action: 'post_message',
    })
    expect(parseComposioToolName(built)).toEqual({
      openclaw_agent_id: 'agent_bbb',
      toolkit: 'slack',
      action: 'post_message',
    })
  })

  test.each([
    ['empty string', ''],
    ['no prefix', 'gmail__send_email'],
    ['only prefix', 'composio__'],
    ['too few parts', 'composio__agent__gmail'],
    ['too many parts', 'composio__agent__gmail__send__extra'],
    ['empty agent id', 'composio____gmail__send_email'],
    ['unrelated tool', 'kodi__memory__lookup'],
  ])('returns null for invalid name: %s', (_label, input) => {
    expect(parseComposioToolName(input)).toBeNull()
  })
})
