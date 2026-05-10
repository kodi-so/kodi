'use client'

import * as React from 'react'
import { Loader2 } from 'lucide-react'
import { cn } from '@kodi/ui/lib/utils'

const sizeMap = {
  xs: 'size-3',
  sm: 'size-4',
  md: 'size-5',
  lg: 'size-6',
  xl: 'size-8',
} as const

export type SpinnerSize = keyof typeof sizeMap

export interface SpinnerProps extends React.SVGProps<SVGSVGElement> {
  size?: SpinnerSize
}

export function Spinner({
  size = 'sm',
  className,
  ...props
}: SpinnerProps) {
  return (
    <Loader2
      aria-hidden="true"
      className={cn('animate-spin text-current', sizeMap[size], className)}
      {...props}
    />
  )
}

/**
 * Subtle indicator shown while content is refreshing on top of existing data.
 * Stays out of the layout so it never causes a reflow.
 */
export function RefreshingIndicator({
  active,
  label = 'Refreshing',
  className,
}: {
  active: boolean
  label?: string
  className?: string
}) {
  return (
    <div
      aria-live="polite"
      aria-hidden={!active}
      className={cn(
        'pointer-events-none flex items-center gap-2 text-xs text-muted-foreground transition-opacity duration-150',
        active ? 'opacity-100' : 'opacity-0',
        className
      )}
    >
      <Spinner size="xs" />
      <span>{label}</span>
    </div>
  )
}

/**
 * Full-region loader for initial loads. Centers a spinner; pair with a fixed
 * min-height on the parent so swapping to content doesn't jump.
 */
export function PageLoader({
  label,
  className,
}: {
  label?: string
  className?: string
}) {
  return (
    <div
      role="status"
      aria-live="polite"
      className={cn(
        'flex min-h-[40vh] flex-col items-center justify-center gap-3 text-muted-foreground',
        className
      )}
    >
      <Spinner size="lg" />
      {label ? <p className="text-sm">{label}</p> : null}
    </div>
  )
}

/**
 * Inline content loader: card-shaped, centered spinner. Use inside a fixed
 * region (e.g., a card body) instead of full-page.
 */
export function InlineLoader({
  label,
  className,
}: {
  label?: string
  className?: string
}) {
  return (
    <div
      role="status"
      aria-live="polite"
      className={cn(
        'flex items-center justify-center gap-2 py-8 text-sm text-muted-foreground',
        className
      )}
    >
      <Spinner size="sm" />
      {label ? <span>{label}</span> : null}
    </div>
  )
}
