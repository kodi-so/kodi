import type { MeetingProviderAdapter } from './provider-adapter'
import type { MeetingProviderSlug } from './events'

export class UnsupportedMeetingProviderError extends Error {
  constructor(provider: MeetingProviderSlug) {
    super(`No meeting provider adapter registered for "${provider}".`)
    this.name = 'UnsupportedMeetingProviderError'
  }
}

export class MeetingProviderRegistry {
  private readonly adapters = new Map<
    MeetingProviderSlug,
    MeetingProviderAdapter
  >()

  constructor(adapters: MeetingProviderAdapter[] = []) {
    for (const adapter of adapters) {
      this.register(adapter)
    }
  }

  register(adapter: MeetingProviderAdapter) {
    this.adapters.set(adapter.provider, adapter)
    return this
  }

  has(provider: MeetingProviderSlug) {
    return this.adapters.has(provider)
  }

  get(provider: MeetingProviderSlug) {
    return this.adapters.get(provider) ?? null
  }

  resolve(provider: MeetingProviderSlug) {
    const adapter = this.get(provider)
    if (!adapter) {
      throw new UnsupportedMeetingProviderError(provider)
    }

    return adapter
  }

  listProviders() {
    return [...this.adapters.keys()]
  }
}

export function createMeetingProviderRegistry(
  adapters: MeetingProviderAdapter[] = []
) {
  return new MeetingProviderRegistry(adapters)
}

export function resolveMeetingProviderAdapter(
  registry: MeetingProviderRegistry,
  provider: MeetingProviderSlug
) {
  return registry.resolve(provider)
}
