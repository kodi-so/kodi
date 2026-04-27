import { SectionShell } from './section-shell'
import { SectionEyebrow } from './section-eyebrow'
import { RevealOnScroll } from './reveal-on-scroll'
import { audienceModules } from '@/content/marketing/homepage'

export function AudienceChapter() {
  return (
    <SectionShell>
      <RevealOnScroll>
        <div className="reveal text-center">
          <SectionEyebrow className="mb-3">Who it&apos;s for</SectionEyebrow>
          <h2 className="mx-auto max-w-2xl text-4xl tracking-[-0.05em] sm:text-5xl">
            Built for lean, fast-moving teams.
          </h2>
          <p className="mx-auto mt-5 max-w-xl text-base leading-8 text-muted-foreground">
            Kodi is designed for startups and growing SMBs where important conversations
            drive the work — and where coordination drag is expensive.
          </p>
        </div>
      </RevealOnScroll>

      <RevealOnScroll stagger className="mt-14 grid gap-5 sm:grid-cols-3">
        {audienceModules.map((module) => (
          <div
            key={module.role}
            className="reveal kodi-panel-surface rounded-2xl border border-brand-line p-7 shadow-soft"
          >
            <p className="mb-4 text-xs uppercase tracking-[0.18em] text-brand-accent">
              {module.role}
            </p>
            <div className="mb-5 rounded-xl border border-border/60 bg-muted/50 px-4 py-3">
              <p className="text-sm leading-6 text-muted-foreground italic">
                &ldquo;{module.pain}&rdquo;
              </p>
            </div>
            <p className="text-sm leading-7 text-foreground">{module.value}</p>
          </div>
        ))}
      </RevealOnScroll>
    </SectionShell>
  )
}
