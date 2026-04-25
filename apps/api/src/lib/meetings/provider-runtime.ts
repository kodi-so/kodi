import { MeetingProviderGateway } from './provider-gateway'
import { MeetingProviderRegistry } from './provider-registry'
import { RecallMeetingAdapter } from '../providers/recall/adapter'

export function createDefaultMeetingProviderGateway() {
  return new MeetingProviderGateway(
    new MeetingProviderRegistry([
      new RecallMeetingAdapter('google_meet'),
      new RecallMeetingAdapter('zoom'),
    ])
  )
}
