import { cn } from '@kodi/ui'
import { initials } from './chat-helpers'

export function ChatAvatar({
  role,
  name,
}: {
  role: 'user' | 'assistant'
  name?: string | null
}) {
  return (
    <div
      className={cn(
        'flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-[11px] font-semibold',
        role === 'assistant'
          ? 'bg-accent text-foreground'
          : 'bg-brand-info-soft text-brand-info'
      )}
    >
      {role === 'assistant' ? 'K' : initials(name ?? 'You')}
    </div>
  )
}
