import { SectionShell } from './section-shell'
import { CTACluster } from './cta-cluster'
import { RevealOnScroll } from './reveal-on-scroll'
import { ctaConfig } from '@/content/marketing/site-config'

export function ClosingCta() {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? '/app'

  return (
    <SectionShell id="demo" className="bg-brand-room-dark py-20 sm:py-24 lg:py-32">
      <RevealOnScroll>
        <div className="reveal mx-auto max-w-2xl text-center">
          <p className="mb-4 text-xs uppercase tracking-[0.2em] text-brand-room-dark-muted">
            Get started
          </p>
          <h2 className="text-4xl tracking-[-0.055em] text-brand-room-dark-text sm:text-5xl">
            Put Kodi in your<br className="hidden sm:block" /> next meeting.
          </h2>
          <p className="mx-auto mt-5 max-w-lg text-base leading-8 text-brand-room-dark-muted">
            Connect your video platform, authorize your tools, and Kodi is ready for
            your next conversation. No IT project, no seat-based pricing, no lock-in.
          </p>

          <div className="mt-10 flex flex-col items-center gap-3">
            <CTACluster
              primary={{ label: ctaConfig.closing.label, href: appUrl }}
              secondary={{
                label: ctaConfig.closingSecondary.label,
                href: ctaConfig.closingSecondary.href,
              }}
              dark
            />
            <p className="mt-2 text-xs text-brand-room-dark-muted">
              Free to start &middot; No credit card required
            </p>
          </div>
        </div>
      </RevealOnScroll>
    </SectionShell>
  )
}
