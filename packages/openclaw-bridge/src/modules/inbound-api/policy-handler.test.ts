import { describe, expect, test } from 'bun:test'
import { createUpdatePolicyHandler } from './policy-handler'
import {
  createPolicyLoader,
  type AutonomyPolicy,
} from '../autonomy/policy'
import type { KodiClient } from '../bridge-core/kodi-client'

const AGENT = 'kodi-member-agent-aaa'

const VALID_POLICY: AutonomyPolicy = {
  agent_id: AGENT,
  autonomy_level: 'strict',
  overrides: { 'gmail__send_email': 'deny' },
}

function noopKodi(): KodiClient {
  return {
    signedFetch: async () => new Response('{}', { status: 200 }),
  }
}

describe('createUpdatePolicyHandler', () => {
  test('valid body → ok, loader cache updated', async () => {
    const loader = createPolicyLoader({
      kodiClient: noopKodi(),
      logger: { log: () => {}, warn: () => {} },
    })
    const handler = createUpdatePolicyHandler(loader)
    const result = await handler(VALID_POLICY)
    expect(result.kind).toBe('ok')
    if (result.kind === 'ok') {
      expect(result.body).toEqual({ ok: true })
    }
    expect(loader.list().map((e) => e.policy)).toEqual([VALID_POLICY])
  })

  test('valid body with overrides=null', async () => {
    const loader = createPolicyLoader({
      kodiClient: noopKodi(),
      logger: { log: () => {}, warn: () => {} },
    })
    const handler = createUpdatePolicyHandler(loader)
    const result = await handler({
      agent_id: AGENT,
      autonomy_level: 'normal',
      overrides: null,
    })
    expect(result.kind).toBe('ok')
  })

  test.each([
    ['empty agent_id', { agent_id: '', autonomy_level: 'normal', overrides: null }],
    ['unknown level', { agent_id: AGENT, autonomy_level: 'godmode', overrides: null }],
    ['null body', null],
    ['missing fields', { agent_id: AGENT }],
  ])('badRequest on: %s', async (_label, body) => {
    const loader = createPolicyLoader({
      kodiClient: noopKodi(),
      logger: { log: () => {}, warn: () => {} },
    })
    const handler = createUpdatePolicyHandler(loader)
    const result = await handler(body)
    expect(result.kind).toBe('badRequest')
    expect(loader.list()).toHaveLength(0)
  })
})
