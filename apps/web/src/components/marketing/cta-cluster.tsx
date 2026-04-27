'use client'

import * as React from 'react'
import { ArrowRight } from 'lucide-react'
import { cn } from '@kodi/ui/lib/utils'
import { Button } from '@kodi/ui/components/button'

type CTAItem = {
  label: string
  href: string
}

type CTAClusterProps = {
  primary: CTAItem
  secondary?: CTAItem
  className?: string
  stacked?: boolean
  size?: 'default' | 'lg'
  dark?: boolean
}

export function CTACluster({
  primary,
  secondary,
  className,
  stacked = false,
  size = 'lg',
  dark = false,
}: CTAClusterProps) {
  return (
    <div
      className={cn(
        'flex gap-3',
        stacked ? 'flex-col' : 'flex-col sm:flex-row',
        className
      )}
    >
      <Button asChild size={size} className="gap-2">
        <a href={primary.href}>
          {primary.label}
          <ArrowRight size={16} />
        </a>
      </Button>
      {secondary && (
        <Button
          asChild
          size={size}
          variant="outline"
          className={cn(
            dark
              ? 'border-brand-room-dark-border bg-transparent text-brand-room-dark-text hover:bg-white/10 hover:text-brand-room-dark-text'
              : 'border-border/80 bg-card/65'
          )}
        >
          <a href={secondary.href}>{secondary.label}</a>
        </Button>
      )}
    </div>
  )
}
