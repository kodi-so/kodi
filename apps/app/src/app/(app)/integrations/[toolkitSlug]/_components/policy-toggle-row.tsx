import { Button, cn } from '@kodi/ui'
import { quietTextClass } from '@/lib/brand-styles'

export function PolicyToggleRow({
  title,
  description,
  value,
  onToggle,
  trueLabel,
  falseLabel,
  disabled,
}: {
  title: string
  description: string
  value: boolean
  onToggle: () => void
  trueLabel: string
  falseLabel: string
  disabled?: boolean
}) {
  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="space-y-1">
          <p className="text-sm font-medium text-foreground">{title}</p>
          <p className={`text-sm leading-6 ${quietTextClass}`}>{description}</p>
        </div>

        <Button
          type="button"
          variant="ghost"
          className={cn(
            'w-full justify-center border sm:w-auto',
            value
              ? 'border-brand-success/20 bg-brand-success-soft text-brand-success hover:bg-brand-success-soft hover:text-brand-success'
              : 'border-border bg-background text-muted-foreground hover:bg-secondary hover:text-foreground'
          )}
          disabled={disabled}
          onClick={onToggle}
        >
          {value ? trueLabel : falseLabel}
        </Button>
      </div>
    </div>
  )
}
