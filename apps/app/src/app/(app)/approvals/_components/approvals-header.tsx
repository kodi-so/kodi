export function ApprovalsHeader() {
  return (
    <div className="space-y-2">
      <p className="text-sm uppercase tracking-[0.18em] text-muted-foreground">
        Approvals
      </p>
      <h1 className="text-3xl font-semibold tracking-tight text-foreground">
        Review external actions before they run
      </h1>
      <p className="max-w-3xl text-sm leading-7 text-muted-foreground">
        Kodi routes policy-gated writes and administrative actions here so
        someone can review the exact payload before execution.
      </p>
    </div>
  )
}
