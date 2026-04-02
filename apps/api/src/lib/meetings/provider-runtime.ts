import { MeetingProviderGateway } from './provider-gateway'
import { MeetingProviderRegistry } from './provider-registry'
import { RecallGoogleMeetAdapter } from '../providers/recall/adapter'

export function createDefaultMeetingProviderGateway() {
  return new MeetingProviderGateway(
    new MeetingProviderRegistry([new RecallGoogleMeetAdapter()])
  )
}
