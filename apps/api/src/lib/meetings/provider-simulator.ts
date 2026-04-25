import type {
  MeetingProviderAdapter,
  MeetingProviderControlResult,
  MeetingProviderHealthRequest,
  MeetingProviderJoinRequest,
  MeetingProviderPrepareRequest,
  MeetingProviderStopRequest,
} from './provider-adapter'
import { MeetingProviderGateway } from './provider-gateway'
import { MeetingProviderRegistry } from './provider-registry'
import type {
  MeetingAdapterLifecycleState,
  MeetingProviderEvent,
  MeetingProviderEventEnvelope,
  MeetingProviderHealthSnapshot,
  MeetingProviderSlug,
  MeetingProviderTransport,
} from './events'

export type SimulatedProviderPayload = {
  normalizedEvents?: MeetingProviderEvent[]
  metadata?: Record<string, unknown> | null
}

export type SimulatedProviderEnvelopeInput = {
  payload?: SimulatedProviderPayload
  transport?: MeetingProviderTransport
  receivedAt?: Date
} & Omit<MeetingProviderEventEnvelope, 'provider' | 'transport' | 'receivedAt'>

export type SimulatedReplayBatch = {
  envelope: MeetingProviderEventEnvelope
  normalizedEvents: MeetingProviderEvent[]
}

function buildAcceptedResult(
  provider: MeetingProviderSlug,
  lifecycleState: MeetingAdapterLifecycleState,
  metadata?: Record<string, unknown> | null
): MeetingProviderControlResult {
  return {
    acceptedAt: new Date(),
    lifecycleState,
    metadata: {
      mode: 'simulation',
      provider,
      ...(metadata ?? {}),
    },
  }
}

export class SimulatedMeetingProviderAdapter implements MeetingProviderAdapter {
  readonly provider: MeetingProviderSlug

  constructor(provider: MeetingProviderSlug) {
    this.provider = provider
  }

  prepare(request: MeetingProviderPrepareRequest): Promise<MeetingProviderControlResult> {
    return Promise.resolve(
      buildAcceptedResult(request.provider, 'preparing', request.metadata)
    )
  }

  join(request: MeetingProviderJoinRequest): Promise<MeetingProviderControlResult> {
    return Promise.resolve(
      buildAcceptedResult(request.provider, 'joining', request.metadata)
    )
  }

  stop(request: MeetingProviderStopRequest): Promise<MeetingProviderControlResult> {
    return Promise.resolve(
      buildAcceptedResult(request.provider, 'stopped', request.metadata)
    )
  }

  normalizeEvent(
    envelope: MeetingProviderEventEnvelope
  ): Promise<MeetingProviderEvent[]> {
    const payload =
      envelope.payload &&
      typeof envelope.payload === 'object' &&
      !Array.isArray(envelope.payload)
        ? (envelope.payload as SimulatedProviderPayload)
        : null

    return Promise.resolve(payload?.normalizedEvents ?? [])
  }

  getHealth(
    request: MeetingProviderHealthRequest
  ): Promise<MeetingProviderHealthSnapshot> {
    return Promise.resolve({
      status: 'healthy',
      observedAt: new Date(),
      lifecycleState: request.session ? 'listening' : 'idle',
      metadata: { mode: 'simulation', provider: request.provider },
    })
  }
}

export function createSimulatedMeetingProviderGateway(
  provider: MeetingProviderSlug
) {
  const registry = new MeetingProviderRegistry([
    new SimulatedMeetingProviderAdapter(provider),
  ])

  return new MeetingProviderGateway(registry)
}

export async function replaySimulatedMeetingEvents(input: {
  provider: MeetingProviderSlug
  events: SimulatedProviderEnvelopeInput[]
  gateway?: MeetingProviderGateway
  onBatch?: (batch: SimulatedReplayBatch) => void | Promise<void>
}) {
  const gateway =
    input.gateway ?? createSimulatedMeetingProviderGateway(input.provider)

  const batches: SimulatedReplayBatch[] = []

  for (const event of input.events) {
    const envelope: MeetingProviderEventEnvelope = {
      provider: input.provider,
      transport: event.transport ?? 'internal',
      receivedAt: event.receivedAt ?? new Date(),
      deliveryId: event.deliveryId ?? null,
      session: event.session ?? null,
      payload: event.payload ?? null,
    }

    const normalizedEvents = await gateway.normalizeEvent(envelope)
    const batch = { envelope, normalizedEvents }
    batches.push(batch)

    if (input.onBatch) {
      await input.onBatch(batch)
    }
  }

  return batches
}
