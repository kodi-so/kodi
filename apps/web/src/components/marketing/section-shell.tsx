'use client'

import * as React from 'react'
import { cn } from '@kodi/ui/lib/utils'

type SectionShellProps = {
  children: React.ReactNode
  className?: string
  container?: boolean
  id?: string
  as?: 'section' | 'div' | 'aside'
}

export function SectionShell({
  children,
  className,
  container = true,
  id,
  as: Tag = 'section',
}: SectionShellProps) {
  return (
    <Tag id={id} className={cn('py-16 sm:py-20 lg:py-24', className)}>
      {container ? (
        <div className="mx-auto w-full max-w-7xl px-4 sm:px-6 lg:px-8">
          {children}
        </div>
      ) : (
        children
      )}
    </Tag>
  )
}
