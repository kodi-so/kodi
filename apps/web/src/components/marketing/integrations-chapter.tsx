import { SectionShell } from './section-shell'
import { SectionEyebrow } from './section-eyebrow'
import { Button } from '@kodi/ui/components/button'
import { ArrowRight } from 'lucide-react'
import { RevealOnScroll } from './reveal-on-scroll'
import { integrationCategories } from '@/content/marketing/integrations'

export function IntegrationsChapter() {
  return (
    <SectionShell className="bg-brand-warm-sand/40">
      <RevealOnScroll>
        <div className="reveal text-center">
          <SectionEyebrow className="mb-3">Integrations</SectionEyebrow>
          <h2 className="mx-auto max-w-2xl text-4xl tracking-[-0.05em] sm:text-5xl">
            Works inside the stack<br className="hidden sm:block" /> your team already uses.
          </h2>
          <p className="mx-auto mt-5 max-w-xl text-base leading-8 text-muted-foreground">
            Kodi connects to your video platform, chat, docs, ticketing, CRM, and calendar.
            Follow-through happens in the tools people already have open — not a new one they
            have to check.
          </p>
        </div>
      </RevealOnScroll>

      <RevealOnScroll stagger className="mt-14 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {integrationCategories.map((category) => (
          <div
            key={category.id}
            className="reveal kodi-panel-surface rounded-2xl border border-brand-line p-5 shadow-soft"
          >
            <p className="mb-1 text-xs uppercase tracking-[0.18em] text-muted-foreground">
              {category.label}
            </p>
            <p className="mb-4 text-sm leading-6 text-muted-foreground">
              {category.description}
            </p>
            <div className="flex flex-wrap gap-2">
              {category.integrations.map((integration) => (
                <span
                  key={`${category.id}-${integration.name}`}
                  className="rounded-full border border-brand-line bg-brand-elevated px-3 py-1 text-sm text-foreground"
                >
                  {integration.name}
                </span>
              ))}
            </div>
          </div>
        ))}
      </RevealOnScroll>

      <div className="mt-10 flex justify-center">
        <Button asChild variant="outline" className="gap-2 border-border/80 bg-card/65">
          <a href="/integrations">
            See all integrations
            <ArrowRight size={15} />
          </a>
        </Button>
      </div>
    </SectionShell>
  )
}
