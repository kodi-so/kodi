interface GuardrailCheckboxProps {
  checked: boolean
  disabled: boolean
  onChange: (checked: boolean) => void
  title: string
  description: string
}

export function GuardrailCheckbox({
  checked,
  disabled,
  onChange,
  title,
  description,
}: GuardrailCheckboxProps) {
  return (
    <label className="flex items-start gap-3 rounded-2xl border border-border bg-card p-4">
      <input
        type="checkbox"
        className="mt-1 h-4 w-4 rounded border-border"
        checked={checked}
        disabled={disabled}
        onChange={(event) => onChange(event.target.checked)}
      />
      <div className="space-y-1">
        <p className="text-sm font-medium text-foreground">{title}</p>
        <p className="text-xs leading-5 text-muted-foreground">{description}</p>
      </div>
    </label>
  )
}
