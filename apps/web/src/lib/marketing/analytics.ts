'use client'

export type MarketingEvent =
  | { name: 'hero_cta_click'; label: 'primary' | 'secondary' }
  | { name: 'chapter_cta_click'; chapter: string }
  | { name: 'closing_cta_click'; label: string }
  | { name: 'demo_form_submit' }
  | { name: 'nav_cta_click' }
  | { name: 'section_visible'; section: string }

export function trackEvent(event: MarketingEvent): void {
  if (typeof window === 'undefined') return
  if (
    typeof (window as unknown as { gtag?: unknown }).gtag === 'function'
  ) {
    ;(
      window as unknown as {
        gtag: (cmd: string, name: string, params: Record<string, unknown>) => void
      }
    ).gtag('event', event.name, event)
  }
}
