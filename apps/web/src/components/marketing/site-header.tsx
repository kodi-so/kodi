'use client'

import { useState, useEffect } from 'react'
import { Menu, X } from 'lucide-react'
import { BrandLogo } from '@kodi/ui/components/brand-logo'
import { Button } from '@kodi/ui/components/button'
import { cn } from '@kodi/ui/lib/utils'
import { primaryNav, ctaConfig } from '@/content/marketing/site-config'

export function SiteHeader() {
  const [scrolled, setScrolled] = useState(false)
  const [mobileOpen, setMobileOpen] = useState(false)

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 12)
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  useEffect(() => {
    if (mobileOpen) {
      document.body.style.overflow = 'hidden'
    } else {
      document.body.style.overflow = ''
    }
    return () => { document.body.style.overflow = '' }
  }, [mobileOpen])

  return (
    <>
      <header
        className={cn(
          'fixed inset-x-0 top-0 z-50 transition-all duration-300',
          scrolled
            ? 'border-b border-border/60 bg-background/90 shadow-[0_1px_8px_0_hsl(var(--kodi-shadow)/0.06)] backdrop-blur-md'
            : 'bg-transparent'
        )}
      >
        <div className="mx-auto flex h-16 w-full max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
          <a href="/" aria-label="Kodi home">
            <BrandLogo size={32} />
          </a>

          {/* Desktop nav */}
          <nav className="hidden items-center gap-7 md:flex" aria-label="Primary">
            {primaryNav.map((item) => (
              <a
                key={item.label}
                href={item.href}
                className="text-sm text-muted-foreground transition-colors hover:text-foreground"
              >
                {item.label}
              </a>
            ))}
          </nav>

          {/* Desktop CTA */}
          <div className="hidden items-center gap-3 md:flex">
            <Button asChild variant="ghost" size="sm" className="text-sm">
              <a href={ctaConfig.secondary.href}>
                {ctaConfig.secondary.label}
              </a>
            </Button>
            <Button asChild size="sm" className="gap-1.5">
              <a href={ctaConfig.primary.href}>{ctaConfig.primary.label}</a>
            </Button>
          </div>

          {/* Mobile menu toggle */}
          <button
            className="flex h-9 w-9 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:text-foreground md:hidden"
            aria-label={mobileOpen ? 'Close menu' : 'Open menu'}
            aria-expanded={mobileOpen}
            onClick={() => setMobileOpen((v) => !v)}
          >
            {mobileOpen ? <X size={20} /> : <Menu size={20} />}
          </button>
        </div>
      </header>

      {/* Mobile drawer */}
      {mobileOpen && (
        <div
          className="fixed inset-0 z-40 flex flex-col bg-background pt-16"
          role="dialog"
          aria-modal="true"
          aria-label="Navigation menu"
        >
          <nav
            className="flex flex-1 flex-col gap-1 px-4 py-6"
            aria-label="Mobile primary"
          >
            {primaryNav.map((item) => (
              <a
                key={item.label}
                href={item.href}
                className="rounded-xl px-4 py-3 text-base text-foreground hover:bg-muted"
                onClick={() => setMobileOpen(false)}
              >
                {item.label}
              </a>
            ))}
          </nav>

          <div className="flex flex-col gap-3 border-t border-border/60 px-4 py-6">
            <Button asChild variant="outline" size="lg" className="w-full border-border/80">
              <a
                href={ctaConfig.secondary.href}
                onClick={() => setMobileOpen(false)}
              >
                {ctaConfig.secondary.label}
              </a>
            </Button>
            <Button asChild size="lg" className="w-full gap-2">
              <a
                href={ctaConfig.primary.href}
                onClick={() => setMobileOpen(false)}
              >
                {ctaConfig.primary.label}
              </a>
            </Button>
          </div>
        </div>
      )}
    </>
  )
}
