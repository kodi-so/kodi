interface BotIdentityPreviewProps {
  displayName: string
  inviteEmail: string
}

export function BotIdentityPreview({
  displayName,
  inviteEmail,
}: BotIdentityPreviewProps) {
  return (
    <div className="rounded-2xl border border-border bg-card p-4">
      <p className="text-[11px] uppercase tracking-[0.2em] text-muted-foreground">
        Identity preview
      </p>
      <div className="mt-3 space-y-2">
        <p className="text-sm font-medium text-foreground">{displayName}</p>
        <p className="text-sm text-muted-foreground">
          Invite address: {inviteEmail}
        </p>
      </div>
    </div>
  )
}
