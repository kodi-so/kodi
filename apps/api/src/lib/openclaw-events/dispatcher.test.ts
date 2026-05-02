import { describe, expect, test } from 'bun:test'
import { EVENT_KINDS, type EventEnvelope, type EventKind } from '@kodi/shared/events'
import type { Instance } from '@kodi/db'
import {
  dispatchEvent,
  eventHandlers,
  isKnownEventKind,
  UnknownEventKindError,
  type EventHandler,
} from './dispatcher'

const FAKE_INSTANCE: Instance = {
  id: 'instance-1',
  orgId: 'org-1',
  status: 'running',
  ec2InstanceId: null,
  ipAddress: null,
  hostname: null,
  instanceUrl: null,
  gatewayToken: null,
  dnsRecordId: null,
  litellmCustomerId: null,
  litellmVirtualKey: null,
  errorMessage: null,
  sshUser: 'ubuntu',
  lastHealthCheck: null,
  pluginVersionInstalled: null,
  pluginHmacSecretEncrypted: null,
  lastPluginHeartbeatAt: null,
  bundleVersionTarget: null,
  createdAt: new Date(),
}

function envelopeFor(kind: EventKind, payload: unknown = {}): EventEnvelope {
  return {
    protocol: 'kodi-bridge.v1',
    plugin_version: '2026-04-21-abc1234',
    instance: {
      instance_id: '11111111-1111-4111-8111-111111111111',
      org_id: '22222222-2222-4222-8222-222222222222',
    },
    event: {
      kind,
      verbosity: 'summary',
      occurred_at: '2026-04-21T10:23:41.123Z',
      idempotency_key: '55555555-5555-4555-8555-555555555555',
      payload,
    },
  }
}

describe('isKnownEventKind', () => {
  test('every catalog kind is recognised', () => {
    for (const kind of EVENT_KINDS) {
      expect(isKnownEventKind(kind)).toBe(true)
    }
  })

  test('unknown kinds are rejected', () => {
    expect(isKnownEventKind('plugin.exploded')).toBe(false)
    expect(isKnownEventKind('')).toBe(false)
  })
})

describe('eventHandlers map', () => {
  test('has a handler for every kind in EVENT_KINDS', () => {
    for (const kind of EVENT_KINDS) {
      expect(typeof eventHandlers[kind]).toBe('function')
    }
  })
})

describe('dispatchEvent', () => {
  test('routes to the handler matching event.kind', async () => {
    const calls: Array<{ kind: EventKind }> = []
    const handlers: Record<EventKind, EventHandler> = Object.fromEntries(
      EVENT_KINDS.map((kind) => [
        kind,
        (async ({ envelope }) => {
          calls.push({ kind: envelope.event.kind })
        }) satisfies EventHandler,
      ]),
    ) as Record<EventKind, EventHandler>

    await dispatchEvent({ envelope: envelopeFor('heartbeat'), instance: FAKE_INSTANCE }, handlers)

    expect(calls).toEqual([{ kind: 'heartbeat' }])
  })

  test('throws UnknownEventKindError for kinds outside the catalog', async () => {
    const env = envelopeFor('plugin.started')
    // Cast through unknown so we can simulate a wire payload that slipped past
    // schema validation (defense-in-depth: dispatcher should still refuse it).
    ;(env.event as { kind: string }).kind = 'plugin.exploded'
    await expect(dispatchEvent({ envelope: env, instance: FAKE_INSTANCE })).rejects.toThrow(
      UnknownEventKindError,
    )
  })

  test('passes ctx through to the handler unchanged', async () => {
    let received: { envelope?: EventEnvelope; instance?: Instance } = {}
    const handlers: Record<EventKind, EventHandler> = {
      ...eventHandlers,
      'plugin.started': async (ctx) => {
        received = { envelope: ctx.envelope, instance: ctx.instance }
      },
    }
    const env = envelopeFor('plugin.started', {
      pid: 1,
      started_at: '2026-04-21T10:23:41.123Z',
    })
    await dispatchEvent({ envelope: env, instance: FAKE_INSTANCE }, handlers)
    expect(received.envelope?.event.kind).toBe('plugin.started')
    expect(received.instance?.id).toBe(FAKE_INSTANCE.id)
  })

  test('handler exceptions bubble up (so the route can return 500)', async () => {
    const handlers: Record<EventKind, EventHandler> = {
      ...eventHandlers,
      'plugin.started': async () => {
        throw new Error('db unavailable')
      },
    }
    await expect(
      dispatchEvent({ envelope: envelopeFor('plugin.started'), instance: FAKE_INSTANCE }, handlers),
    ).rejects.toThrow('db unavailable')
  })

  test('composio.session_failed remains a no-op (KOD-386 reauth recovery via webhook)', async () => {
    // Auto-rotation on this event would loop indefinitely against a
    // persistent registration failure. The reauth path is covered by
    // the Composio webhook hook in /integrations/composio/webhook,
    // which fires triggerAgentRotation when the user actually reauths.
    const env = envelopeFor('composio.session_failed', {
      user_id: '11111111-1111-4111-8111-111111111111',
      error: 'auth_error',
    })
    await expect(
      dispatchEvent({ envelope: env, instance: FAKE_INSTANCE }),
    ).resolves.toBeUndefined()
  })
})
