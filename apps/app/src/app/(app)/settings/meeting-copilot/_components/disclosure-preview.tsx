import {
  buildMeetingCopilotDisclosure,
  type MeetingCopilotSettings,
} from '@kodi/db/client'

interface DisclosurePreviewProps {
  form: MeetingCopilotSettings
}

export function DisclosurePreview({ form }: DisclosurePreviewProps) {
  return (
    <div className="rounded-2xl border border-dashed border-border bg-card p-4">
      <p className="text-[11px] uppercase tracking-[0.2em] text-muted-foreground">
        Disclosure contract
      </p>
      <div className="mt-3 space-y-2 text-sm leading-6 text-foreground">
        {buildMeetingCopilotDisclosure(form).map((line) => (
          <p key={line}>{line}</p>
        ))}
      </div>
    </div>
  )
}
