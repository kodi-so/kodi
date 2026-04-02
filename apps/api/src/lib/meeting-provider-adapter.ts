import type {
  MeetingAdapterLifecycleState,
  MeetingProviderEvent,
  MeetingProviderEventEnvelope,
  MeetingProviderHealthSnapshot,
  MeetingProviderSessionRef,
  MeetingProviderSlug,
} from './meeting-events'

export type MeetingProviderActorIdentity = {
  installerUserId?: string | null
  externalAccountId?: string | null
  externalAccountEmail?: string | null
}

export type MeetingProviderJoinTarget = {
  joinUrl?: string | null
  externalMeetingId?: string | null
  title?: string | null
  scheduledStartAt?: Date | null
  metadata?: Record<string, unknown> | null
}

export type MeetingBotIdentity = {
  displayName?: string | null
  email?: string | null
  avatarUrl?: string | null
}

export type MeetingProviderPrepareRequest = {
  orgId: string
  provider: MeetingProviderSlug
  actor?: MeetingProviderActorIdentity | null
  meeting: MeetingProviderJoinTarget
  botIdentity?: MeetingBotIdentity | null
  metadata?: Record<string, unknown> | null
}

export type MeetingProviderJoinRequest = MeetingProviderPrepareRequest & {
  session?: MeetingProviderSessionRef | null
}

export type MeetingProviderStopRequest = {
  orgId: string
  provider: MeetingProviderSlug
  session: MeetingProviderSessionRef
  reason?: string | null
  metadata?: Record<string, unknown> | null
}

export type MeetingProviderHealthRequest = {
  orgId: string
  provider: MeetingProviderSlug
  session?: MeetingProviderSessionRef | null
  metadata?: Record<string, unknown> | null
}

export type MeetingProviderControlResult = {
  acceptedAt: Date
  session?: MeetingProviderSessionRef | null
  lifecycleState: MeetingAdapterLifecycleState
  providerRequestId?: string | null
  metadata?: Record<string, unknown> | null
}

export interface MeetingProviderAdapter {
  readonly provider: MeetingProviderSlug

  prepare?(
    request: MeetingProviderPrepareRequest
  ): Promise<MeetingProviderControlResult>

  join(request: MeetingProviderJoinRequest): Promise<MeetingProviderControlResult>

  stop(request: MeetingProviderStopRequest): Promise<MeetingProviderControlResult>

  normalizeEvent(
    envelope: MeetingProviderEventEnvelope
  ): Promise<MeetingProviderEvent[]>

  getHealth?(
    request: MeetingProviderHealthRequest
  ): Promise<MeetingProviderHealthSnapshot>
}
