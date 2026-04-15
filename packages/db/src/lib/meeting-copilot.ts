export const meetingParticipationModeValues = [
  'listen_only',
  'chat_enabled',
  'voice_enabled',
] as const

export type MeetingParticipationMode =
  (typeof meetingParticipationModeValues)[number]

export type MeetingCopilotSettings = {
  botDisplayName: string | null
  defaultParticipationMode: MeetingParticipationMode
  chatResponsesRequireExplicitAsk: boolean
  voiceResponsesRequireExplicitPrompt: boolean
  allowMeetingHostControls: boolean
  consentNoticeEnabled: boolean
  transcriptRetentionDays: number
  artifactRetentionDays: number
}

export const DEFAULT_MEETING_COPILOT_SETTINGS: MeetingCopilotSettings = {
  botDisplayName: null,
  defaultParticipationMode: 'chat_enabled',
  chatResponsesRequireExplicitAsk: true,
  voiceResponsesRequireExplicitPrompt: true,
  allowMeetingHostControls: true,
  consentNoticeEnabled: true,
  transcriptRetentionDays: 30,
  artifactRetentionDays: 180,
}

export function resolveMeetingCopilotSettings(
  overrides?: Partial<MeetingCopilotSettings> | null
): MeetingCopilotSettings {
  // Strip `undefined` values before spreading — explicit undefined from
  // `persisted?.field` would otherwise override defaults with undefined,
  // causing all settings to be lost when no row exists yet for the org.
  // `null` is intentional (e.g. botDisplayName) so it is preserved.
  const clean = overrides
    ? (Object.fromEntries(
        Object.entries(overrides).filter(([, v]) => v !== undefined)
      ) as Partial<MeetingCopilotSettings>)
    : {}
  return {
    ...DEFAULT_MEETING_COPILOT_SETTINGS,
    ...clean,
  }
}

export function getMeetingParticipationModeLabel(
  mode: MeetingParticipationMode
) {
  switch (mode) {
    case 'listen_only':
      return 'Listen only'
    case 'chat_enabled':
      return 'Chat enabled'
    case 'voice_enabled':
      return 'Voice enabled'
    default:
      return mode
  }
}

export function getMeetingParticipationModeDescription(
  mode: MeetingParticipationMode
) {
  switch (mode) {
    case 'listen_only':
      return 'Kodi listens and records the meeting state, but stays silent in chat and voice.'
    case 'chat_enabled':
      return 'Kodi can answer in meeting chat when someone explicitly asks or directly mentions it.'
    case 'voice_enabled':
      return 'Kodi can speak only when voice is enabled and the response is explicitly requested.'
    default:
      return 'Kodi follows the configured meeting participation policy.'
  }
}

export function formatRetentionDays(days: number) {
  if (days === 1) return '1 day'
  if (days < 30) return `${days} days`
  if (days % 30 === 0) {
    const months = days / 30
    return months === 1 ? '1 month' : `${months} months`
  }

  return `${days} days`
}

export function buildMeetingCopilotDisclosure(settings: MeetingCopilotSettings) {
  const disclosure = [
    'Kodi appears as a visible participant in the meeting and should disclose when it is listening or speaking.',
  ]

  if (settings.defaultParticipationMode === 'listen_only') {
    disclosure.push(
      'This workspace keeps live participation off by default until an operator narrows or changes the mode.'
    )
  } else if (settings.defaultParticipationMode === 'chat_enabled') {
    disclosure.push(
      'Chat replies are limited to explicit asks or direct mentions in the pilot.'
    )
  } else {
    disclosure.push(
      'Voice replies are limited to explicitly requested responses and should never interrupt an active conversation in the pilot.'
    )
  }

  return disclosure
}
