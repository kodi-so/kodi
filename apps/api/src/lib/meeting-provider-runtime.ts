import { MeetingProviderGateway } from './meeting-provider-gateway'
import { MeetingProviderRegistry } from './meeting-provider-registry'
import { RecallGoogleMeetAdapter } from './recall-adapter'

export function createDefaultMeetingProviderGateway() {
  return new MeetingProviderGateway(
    new MeetingProviderRegistry([new RecallGoogleMeetAdapter()])
  )
}
