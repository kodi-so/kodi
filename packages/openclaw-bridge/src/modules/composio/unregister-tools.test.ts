import { describe, expect, test } from 'bun:test'
import { unregisterComposioToolsForAgent } from './unregister-tools'
import { createComposioSessionCache } from './session'

const AGENT = 'agent_aaa'
const SESSION = 'sess_x'

describe('unregisterComposioToolsForAgent', () => {
  test('drops session and reports cleared_tool_count', () => {
    const sessionCache = createComposioSessionCache()
    const entry = sessionCache.setSession({
      openclaw_agent_id: AGENT,
      composio_session_id: SESSION,
    })
    entry.allowedToolNames.add('composio__agent_aaa__gmail__send_email')
    entry.allowedToolNames.add('composio__agent_aaa__slack__post_message')

    const result = unregisterComposioToolsForAgent(
      { sessionCache },
      { openclaw_agent_id: AGENT },
    )
    expect(result).toEqual({ cleared_tool_count: 2, removed: true })
    expect(sessionCache.getSession(AGENT)).toBeUndefined()
  })

  test('unknown agent: no-op success', () => {
    const sessionCache = createComposioSessionCache()
    const result = unregisterComposioToolsForAgent(
      { sessionCache },
      { openclaw_agent_id: 'agent_unknown' },
    )
    expect(result).toEqual({ cleared_tool_count: 0, removed: false })
  })

  test('agent with empty allowed set: removed=true, cleared_tool_count=0', () => {
    const sessionCache = createComposioSessionCache()
    sessionCache.setSession({
      openclaw_agent_id: AGENT,
      composio_session_id: SESSION,
    })
    const result = unregisterComposioToolsForAgent(
      { sessionCache },
      { openclaw_agent_id: AGENT },
    )
    expect(result).toEqual({ cleared_tool_count: 0, removed: true })
  })
})
