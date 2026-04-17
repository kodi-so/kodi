'use client'

import { cn } from '../lib/utils'

type BrandLogoProps = {
  className?: string
  labelClassName?: string
  markClassName?: string
  showWordmark?: boolean
  size?: number
  src?: string
}

export function BrandLogo({
  className,
  labelClassName,
  markClassName,
  showWordmark = true,
  size = 36,
  src = '/brand/kodi-logo.png',
}: BrandLogoProps) {
  return (
    <div className={cn('inline-flex items-center gap-3', className)}>
      <img
        src={src}
        alt="Kodi logo"
        width={size}
        height={size}
        className={cn('rounded-full object-contain', markClassName)}
      />
      {showWordmark ? (
        <span
          className={cn(
            'text-lg font-normal tracking-[-0.03em] text-foreground',
            labelClassName
          )}
        >
          Kodi
        </span>
      ) : null}
    </div>
  )
}
