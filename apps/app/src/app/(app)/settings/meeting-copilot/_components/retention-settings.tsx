import { formatRetentionDays, type MeetingCopilotSettings } from '@kodi/db/client'
import { Input, Label } from '@kodi/ui'

interface RetentionSettingsProps {
  transcriptRetentionDays: number
  artifactRetentionDays: number
  disabled: boolean
  onChange: (
    updater: (current: MeetingCopilotSettings | null) => MeetingCopilotSettings | null
  ) => void
}

export function RetentionSettings({
  transcriptRetentionDays,
  artifactRetentionDays,
  disabled,
  onChange,
}: RetentionSettingsProps) {
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <div className="space-y-2">
        <Label htmlFor="transcript-retention-days" className="text-foreground">
          Transcript retention
        </Label>
        <Input
          id="transcript-retention-days"
          type="number"
          min={1}
          max={3650}
          value={transcriptRetentionDays}
          onChange={(event) =>
            onChange((current) =>
              current
                ? {
                    ...current,
                    transcriptRetentionDays: Math.max(
                      1,
                      Number(event.target.value) || 1
                    ),
                  }
                : current
            )
          }
          disabled={disabled}
          className="h-12 rounded-xl border-brand-line bg-brand-elevated"
        />
        <p className="text-xs text-brand-subtle">
          Current: {formatRetentionDays(transcriptRetentionDays)}
        </p>
      </div>

      <div className="space-y-2">
        <Label htmlFor="artifact-retention-days" className="text-foreground">
          Artifact retention
        </Label>
        <Input
          id="artifact-retention-days"
          type="number"
          min={1}
          max={3650}
          value={artifactRetentionDays}
          onChange={(event) =>
            onChange((current) =>
              current
                ? {
                    ...current,
                    artifactRetentionDays: Math.max(
                      1,
                      Number(event.target.value) || 1
                    ),
                  }
                : current
            )
          }
          disabled={disabled}
          className="h-12 rounded-xl border-brand-line bg-brand-elevated"
        />
        <p className="text-xs text-brand-subtle">
          Current: {formatRetentionDays(artifactRetentionDays)}
        </p>
      </div>
    </div>
  )
}
