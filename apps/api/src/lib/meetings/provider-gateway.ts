import type {
  MeetingProviderAdapter,
  MeetingProviderControlResult,
  MeetingProviderHealthRequest,
  MeetingProviderJoinRequest,
  MeetingProviderPrepareRequest,
  MeetingProviderSendChatMessageRequest,
  MeetingProviderSendChatMessageResult,
  MeetingProviderStopRequest,
} from './provider-adapter'
import type {
  MeetingProviderEvent,
  MeetingProviderEventEnvelope,
  MeetingProviderHealthSnapshot,
  MeetingProviderSlug,
} from './events'
import { MeetingProviderRegistry } from './provider-registry'

export class MeetingProviderCapabilityError extends Error {
  constructor(
    provider: MeetingProviderSlug,
    capability: 'prepare' | 'health' | 'sendChatMessage'
  ) {
    super(
      `Meeting provider "${provider}" does not implement the optional "${capability}" capability.`
    )
    this.name = 'MeetingProviderCapabilityError'
  }
}

export class MeetingProviderGateway {
  constructor(private readonly registry: MeetingProviderRegistry) {}

  resolve(provider: MeetingProviderSlug): MeetingProviderAdapter {
    return this.registry.resolve(provider)
  }

  async prepare(
    request: MeetingProviderPrepareRequest
  ): Promise<MeetingProviderControlResult> {
    const adapter = this.resolve(request.provider)
    if (!adapter.prepare) {
      throw new MeetingProviderCapabilityError(request.provider, 'prepare')
    }

    return adapter.prepare(request)
  }

  join(request: MeetingProviderJoinRequest): Promise<MeetingProviderControlResult> {
    return this.resolve(request.provider).join(request)
  }

  stop(request: MeetingProviderStopRequest): Promise<MeetingProviderControlResult> {
    return this.resolve(request.provider).stop(request)
  }

  async sendChatMessage(
    request: MeetingProviderSendChatMessageRequest
  ): Promise<MeetingProviderSendChatMessageResult> {
    const adapter = this.resolve(request.provider)
    if (!adapter.sendChatMessage) {
      throw new MeetingProviderCapabilityError(request.provider, 'sendChatMessage')
    }

    return adapter.sendChatMessage(request)
  }

  normalizeEvent(
    envelope: MeetingProviderEventEnvelope
  ): Promise<MeetingProviderEvent[]> {
    return this.resolve(envelope.provider).normalizeEvent(envelope)
  }

  async getHealth(
    request: MeetingProviderHealthRequest
  ): Promise<MeetingProviderHealthSnapshot> {
    const adapter = this.resolve(request.provider)
    if (!adapter.getHealth) {
      throw new MeetingProviderCapabilityError(request.provider, 'health')
    }

    return adapter.getHealth(request)
  }
}
