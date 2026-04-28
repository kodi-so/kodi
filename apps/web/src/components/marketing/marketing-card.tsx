'use client'

import * as React from 'react'
import { cn } from '@kodi/ui/lib/utils'

type MarketingCardProps = {
  children: React.ReactNode
  className?: string
  variant?: 'elevated' | 'muted' | 'dark'
}

export function MarketingCard({
  children,
  className,
  variant = 'elevated',
}: MarketingCardProps) {
  return (
    <div
      className={cn(
        'rounded-2xl border p-6',
        variant === 'elevated' &&
          'kodi-panel-surface border-brand-line shadow-soft',
        variant === 'muted' && 'kodi-panel-muted-surface border-brand-line',
        variant === 'dark' &&
          'border-brand-room-dark-border bg-brand-room-dark',
        className
      )}
    >
      {children}
    </div>
  )
}
