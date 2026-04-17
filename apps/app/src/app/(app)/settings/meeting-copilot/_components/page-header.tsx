import { Bot } from 'lucide-react'

export function PageHeader() {
  return (
    <div>
      <div className="mb-2 flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-2xl border border-brand-line bg-brand-accent-soft text-brand-accent-strong shadow-brand-panel">
          <Bot size={18} />
        </div>
        <h1 className="text-2xl font-medium tracking-tight text-foreground">
          Meeting copilot
        </h1>
      </div>
      <p className="ml-[3.25rem] text-sm leading-7 text-brand-quiet">
        Configure Kodi&apos;s identity and participation behavior for meetings.
      </p>
    </div>
  )
}
