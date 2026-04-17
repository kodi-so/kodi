interface BotIdentityPreviewProps {
  displayName: string
  inviteEmail: string
}

export function BotIdentityPreview({
  displayName,
  inviteEmail,
}: BotIdentityPreviewProps) {
  return (
    <div className="rounded-2xl border border-brand-line bg-brand-elevated p-4">
      <p className="text-[11px] uppercase tracking-[0.2em] text-brand-subtle">
        Identity preview
      </p>
      <div className="mt-3 space-y-2">
        <p className="text-sm font-medium text-foreground">{displayName}</p>
        <p className="text-sm text-brand-quiet">
          Invite address: {inviteEmail}
        </p>
      </div>
    </div>
  )
}
