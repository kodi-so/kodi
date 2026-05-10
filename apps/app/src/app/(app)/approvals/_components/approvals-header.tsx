export function ApprovalsHeader() {
  return (
    <div className="sticky top-0 z-10 -mx-4 space-y-1 border-b border-border bg-background px-4 pb-4 pt-8">
      <h1 className="text-2xl font-semibold tracking-tight text-foreground">
        Approvals
      </h1>
      <p className="text-sm text-muted-foreground">
        Review external actions before Kodi runs them.
      </p>
    </div>
  )
}
