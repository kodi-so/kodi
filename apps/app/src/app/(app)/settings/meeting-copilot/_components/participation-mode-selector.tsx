import {
  getMeetingParticipationModeDescription,
  getMeetingParticipationModeLabel,
  meetingParticipationModeValues,
  type MeetingCopilotSettings,
} from '@kodi/db/client'
import { Label } from '@kodi/ui'

interface ParticipationModeSelectorProps {
  activeMode: MeetingCopilotSettings['defaultParticipationMode']
  disabled: boolean
  onChange: (
    updater: (current: MeetingCopilotSettings | null) => MeetingCopilotSettings | null
  ) => void
}

export function ParticipationModeSelector({
  activeMode,
  disabled,
  onChange,
}: ParticipationModeSelectorProps) {
  return (
    <div className="space-y-3">
      <Label className="text-foreground">Default participation mode</Label>
      <div className="grid gap-3 sm:grid-cols-3">
        {meetingParticipationModeValues.map((mode) => {
          const active = activeMode === mode

          return (
            <button
              key={mode}
              type="button"
              disabled={disabled}
              onClick={() =>
                onChange((current) =>
                  current
                    ? {
                        ...current,
                        defaultParticipationMode: mode,
                      }
                    : current
                )
              }
              className={`rounded-2xl border px-4 py-4 text-left transition ${
                active
                  ? 'border-foreground bg-accent text-foreground'
                  : 'border-border bg-card text-muted-foreground hover:border-foreground/20 hover:text-foreground'
              }`}
            >
              <p className="text-sm font-medium">
                {getMeetingParticipationModeLabel(mode)}
              </p>
              <p className="mt-2 text-xs leading-5">
                {getMeetingParticipationModeDescription(mode)}
              </p>
            </button>
          )
        })}
      </div>
    </div>
  )
}
