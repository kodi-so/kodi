'use client'

import { useEffect, useRef } from 'react'
import { cn } from '@kodi/ui/lib/utils'

type RevealOnScrollProps = {
  children: React.ReactNode
  className?: string
  /** Apply .stagger class so child .reveal elements delay sequentially */
  stagger?: boolean
}

export function RevealOnScroll({
  children,
  className,
  stagger = false,
}: RevealOnScrollProps) {
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const el = ref.current
    if (!el) return

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            el.querySelectorAll('.reveal').forEach((child) => {
              child.classList.add('is-visible')
            })
            observer.unobserve(el)
          }
        })
      },
      { threshold: 0.12 }
    )

    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  return (
    <div ref={ref} className={cn(stagger && 'stagger', className)}>
      {children}
    </div>
  )
}
