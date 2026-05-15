import { describe, expect, test } from 'bun:test'
import { createDefaultComposioDispatcher } from './dispatcher'

describe('createDefaultComposioDispatcher', () => {
  test('execute returns a not_configured failure regardless of input', async () => {
    const d = createDefaultComposioDispatcher()
    const result = await d.execute({
      openclaw_agent_id: 'agent_x',
      user_id: '11111111-1111-4111-8111-111111111111',
      composio_session_id: 'sess_y',
      toolkit: 'gmail',
      action: 'send_email',
      params: { to: 'a@b.com' },
    })
    expect(result).toEqual({
      status: 'failed',
      reason: 'not_configured',
      message: expect.stringContaining('Composio backend is not configured') as unknown as string,
    })
  })
})
