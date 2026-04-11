'use client'

import { useState } from 'react'
import { cn } from '@kodi/ui'
import { getToolkitMonogram } from '../_lib/tool-access-ui'

export function ToolkitLogo({
  name,
  logoUrl,
  className,
  imageClassName,
  fallbackClassName,
}: {
  name: string
  logoUrl?: string | null
  className?: string
  imageClassName?: string
  fallbackClassName?: string
}) {
  const [imageFailed, setImageFailed] = useState(false)
  const showImage = Boolean(logoUrl) && !imageFailed

  return (
    <div
      className={cn(
        'flex items-center justify-center overflow-hidden rounded-[1.2rem] border border-border bg-secondary',
        className
      )}
    >
      {showImage ? (
        <img
          src={logoUrl ?? undefined}
          alt={`${name} logo`}
          className={cn('h-full w-full object-contain p-2.5', imageClassName)}
          loading="lazy"
          decoding="async"
          onError={() => setImageFailed(true)}
        />
      ) : (
        <span
          className={cn(
            'text-sm font-semibold uppercase tracking-[0.18em] text-foreground',
            fallbackClassName
          )}
        >
          {getToolkitMonogram(name)}
        </span>
      )}
    </div>
  )
}
