'use client'

import type { MeetingCopilotSettings } from '@kodi/db/client'
import { Label } from '@kodi/ui/components/label'
import { GuardrailCheckbox } from './guardrail-checkbox'

interface GuardrailsSectionProps {
  form: MeetingCopilotSettings
  disabled: boolean
  onChange: (
    updater: (current: MeetingCopilotSettings | null) => MeetingCopilotSettings | null
  ) => void
}

export function GuardrailsSection({
  form,
  disabled,
  onChange,
}: GuardrailsSectionProps) {
  return (
    <div className="space-y-3">
      <Label className="text-foreground">Pilot response guardrails</Label>
      <div className="space-y-3">
        <GuardrailCheckbox
          checked={form.chatResponsesRequireExplicitAsk}
          disabled={disabled}
          onChange={(checked) =>
            onChange((current) =>
              current
                ? { ...current, chatResponsesRequireExplicitAsk: checked }
                : current
            )
          }
          title="Require an explicit ask before Kodi replies in chat"
          description="Keeps live chat participation limited to direct asks and mentions."
        />

        <GuardrailCheckbox
          checked={form.voiceResponsesRequireExplicitPrompt}
          disabled={disabled}
          onChange={(checked) =>
            onChange((current) =>
              current
                ? { ...current, voiceResponsesRequireExplicitPrompt: checked }
                : current
            )
          }
          title="Require an explicit prompt before Kodi speaks"
          description="Voice stays request-driven and avoids autonomous interruption."
        />

        <GuardrailCheckbox
          checked={form.allowMeetingHostControls}
          disabled={disabled}
          onChange={(checked) =>
            onChange((current) =>
              current
                ? { ...current, allowMeetingHostControls: checked }
                : current
            )
          }
          title="Let the meeting starter narrow live participation"
          description="Workspace owners can always change controls. This lets the meeting starter also move Kodi to listen-only or stop live replies during a session."
        />

        <GuardrailCheckbox
          checked={form.consentNoticeEnabled}
          disabled={disabled}
          onChange={(checked) =>
            onChange((current) =>
              current
                ? { ...current, consentNoticeEnabled: checked }
                : current
            )
          }
          title="Show consent and disclosure notices in product"
          description="Keeps Kodi's listening and speaking behavior visible before and during a meeting."
        />
      </div>
    </div>
  )
}
