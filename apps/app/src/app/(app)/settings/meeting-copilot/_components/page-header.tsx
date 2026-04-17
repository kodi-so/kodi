import { Bot } from 'lucide-react'

export function PageHeader() {
  return (
    <div>
      <div className="mb-2 flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-2xl border border-border bg-accent text-primary shadow-sm">
          <Bot size={18} />
        </div>
        <h1 className="text-2xl font-medium tracking-tight text-foreground">
          Meeting copilot
        </h1>
      </div>
      <p className="ml-[3.25rem] text-sm leading-7 text-muted-foreground">
        Configure Kodi&apos;s identity and participation behavior for meetings.
      </p>
    </div>
  )
}
