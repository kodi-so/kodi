import type { MeetingCopilotSettings } from '@kodi/db/client'
import { Input, Label } from '@kodi/ui'

interface DisplayNameFieldProps {
  value: string | null
  placeholder: string
  disabled: boolean
  onChange: (
    updater: (current: MeetingCopilotSettings | null) => MeetingCopilotSettings | null
  ) => void
}

export function DisplayNameField({
  value,
  placeholder,
  disabled,
  onChange,
}: DisplayNameFieldProps) {
  return (
    <div className="space-y-2">
      <Label htmlFor="meeting-bot-display-name" className="text-foreground">
        Visible meeting display name
      </Label>
      <Input
        id="meeting-bot-display-name"
        value={value ?? ''}
        onChange={(event) =>
          onChange((current) =>
            current
              ? {
                  ...current,
                  botDisplayName:
                    event.target.value.trim().length > 0
                      ? event.target.value
                      : null,
                }
              : current
          )
        }
        disabled={disabled}
        placeholder={placeholder}
        className="h-12 rounded-xl border-brand-line bg-brand-elevated"
      />
      <p className="text-xs text-brand-subtle">
        Leave blank to use the default derived workspace identity.
      </p>
    </div>
  )
}
