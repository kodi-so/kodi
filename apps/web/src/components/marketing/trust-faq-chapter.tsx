import { SectionShell } from './section-shell'
import { SectionEyebrow } from './section-eyebrow'
import { RevealOnScroll } from './reveal-on-scroll'
import { faqItems } from '@/content/marketing/homepage'
import { trustProofPoints } from '@/content/marketing/proof'

export function TrustFaqChapter() {
  return (
    <SectionShell className="bg-brand-warm-sand/40">
      <RevealOnScroll>
        {/* Trust proof points */}
        <div className="reveal mb-16 text-center">
          <SectionEyebrow className="mb-3">How Kodi earns trust</SectionEyebrow>
          <h2 className="mx-auto max-w-xl text-4xl tracking-[-0.05em]">
            Designed for teams that need AI to be reliable, not just impressive.
          </h2>
        </div>
      </RevealOnScroll>

      <RevealOnScroll stagger className="mb-20 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
        {trustProofPoints.map((point) => (
          <div
            key={point.id}
            className="reveal kodi-panel-surface rounded-2xl border border-brand-line p-6 shadow-soft"
          >
            <p className="mb-2 text-base tracking-[-0.03em] text-foreground">
              {point.headline}
            </p>
            <p className="text-sm leading-7 text-muted-foreground">{point.body}</p>
          </div>
        ))}
      </RevealOnScroll>

      {/* FAQ */}
      <RevealOnScroll>
        <div className="reveal text-center mb-10">
          <SectionEyebrow className="mb-3">Common questions</SectionEyebrow>
        </div>
        <dl className="reveal mx-auto max-w-3xl divide-y divide-border/60">
          {faqItems.map((item) => (
            <div key={item.question} className="py-6">
              <dt className="text-base text-foreground">{item.question}</dt>
              <dd className="mt-3 text-sm leading-7 text-muted-foreground">
                {item.answer}
              </dd>
            </div>
          ))}
        </dl>
      </RevealOnScroll>
    </SectionShell>
  )
}
