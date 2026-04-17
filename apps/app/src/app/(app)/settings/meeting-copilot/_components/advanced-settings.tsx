'use client'

import { useState } from 'react'
import { ChevronDown } from 'lucide-react'
import type { MeetingCopilotSettings } from '@kodi/db/client'
import { GuardrailsSection } from './guardrails-section'
import { RetentionSettings } from './retention-settings'
import { DisclosurePreview } from './disclosure-preview'

interface AdvancedSettingsProps {
  form: MeetingCopilotSettings
  disabled: boolean
  onChange: (
    updater: (current: MeetingCopilotSettings | null) => MeetingCopilotSettings | null
  ) => void
}

export function AdvancedSettings({
  form,
  disabled,
  onChange,
}: AdvancedSettingsProps) {
  const [open, setOpen] = useState(false)

  return (
    <div className="rounded-2xl border border-brand-line">
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        className="flex w-full items-center justify-between rounded-2xl px-4 py-3 text-left text-sm font-medium text-brand-quiet hover:text-foreground transition-colors"
      >
        <span>Advanced settings</span>
        <ChevronDown
          size={16}
          className={`transition-transform duration-200 ${open ? 'rotate-180' : ''}`}
        />
      </button>

      {open && (
        <div className="space-y-6 border-t border-brand-line px-4 pb-4 pt-4">
          <GuardrailsSection
            form={form}
            disabled={disabled}
            onChange={onChange}
          />

          <RetentionSettings
            transcriptRetentionDays={form.transcriptRetentionDays}
            artifactRetentionDays={form.artifactRetentionDays}
            disabled={disabled}
            onChange={onChange}
          />

          <DisclosurePreview form={form} />
        </div>
      )}
    </div>
  )
}
