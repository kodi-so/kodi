'use client'

import { Send } from 'lucide-react'
import { Button, Textarea } from '@kodi/ui'

export function ChatComposer({
  value,
  onChange,
  onSubmit,
  placeholder,
  disabled,
  ariaLabel,
}: {
  value: string
  onChange: (value: string) => void
  onSubmit: () => void
  placeholder: string
  disabled: boolean
  ariaLabel: string
}) {
  return (
    <div className="shrink-0 border-t border-border bg-background px-4 pb-4 pt-3 sm:px-6">
      <div className="rounded-xl border border-border bg-card focus-within:border-ring focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-0">
        <Textarea
          value={value}
          onChange={(event) => onChange(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && !event.shiftKey) {
              event.preventDefault()
              onSubmit()
            }
          }}
          placeholder={placeholder}
          rows={1}
          className="min-h-0 resize-none border-0 bg-transparent px-3 pt-3 text-[15px] shadow-none focus-visible:ring-0 focus-visible:ring-offset-0"
        />

        <div className="flex items-center justify-end px-2 pb-2">
          <Button
            size="icon"
            className="h-8 w-8 rounded-md"
            disabled={disabled}
            onClick={onSubmit}
            aria-label={ariaLabel}
          >
            <Send size={14} />
          </Button>
        </div>
      </div>
    </div>
  )
}
