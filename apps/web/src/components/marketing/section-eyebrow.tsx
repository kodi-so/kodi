'use client'

import * as React from 'react'
import { cn } from '@kodi/ui/lib/utils'

type SectionEyebrowProps = {
  children: React.ReactNode
  className?: string
  variant?: 'default' | 'light' | 'accent'
}

export function SectionEyebrow({
  children,
  className,
  variant = 'default',
}: SectionEyebrowProps) {
  return (
    <p
      className={cn(
        'text-xs font-normal uppercase tracking-[0.2em]',
        variant === 'default' && 'text-muted-foreground',
        variant === 'light' && 'text-brand-room-dark-muted',
        variant === 'accent' && 'text-brand-accent',
        className
      )}
    >
      {children}
    </p>
  )
}
