import type { Metadata } from 'next'
import { SectionShell } from '@/components/marketing/section-shell'
import { SectionEyebrow } from '@/components/marketing/section-eyebrow'
import { CTACluster } from '@/components/marketing/cta-cluster'
import { integrationCategories } from '@/content/marketing/integrations'
import { ctaConfig } from '@/content/marketing/site-config'

export const metadata: Metadata = {
  title: 'Integrations',
  description:
    'Kodi connects across video meetings, chat, docs, ticketing, CRM, and calendar — delivering follow-through inside the tools your team already uses.',
}

const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? '/app'

export default function IntegrationsPage() {
  return (
    <main>
      {/* Hero */}
      <SectionShell className="pt-32 pb-12 sm:pt-36 sm:pb-16">
        <div className="text-center">
          <SectionEyebrow className="mb-4">Integrations</SectionEyebrow>
          <h1 className="mx-auto max-w-2xl text-5xl tracking-[-0.055em] sm:text-6xl">
            Works inside your existing stack.
          </h1>
          <p className="mx-auto mt-6 max-w-lg text-base leading-8 text-muted-foreground">
            Kodi connects to the tools your team already has open. Follow-through happens
            where decisions actually need to land — not in a new inbox your team has to
            remember to check.
          </p>
          <div className="mt-8 flex justify-center">
            <CTACluster
              primary={{ label: ctaConfig.primary.label, href: appUrl }}
              secondary={{ label: 'See how it works', href: '/#how-it-works' }}
            />
          </div>
        </div>
      </SectionShell>

      {/* Category grid */}
      <SectionShell className="py-12 sm:py-16 lg:py-20">
        <div className="grid gap-8 sm:grid-cols-2 lg:grid-cols-3">
          {integrationCategories.map((category) => (
            <section
              key={category.id}
              aria-labelledby={`cat-${category.id}`}
              className="kodi-panel-surface rounded-2xl border border-brand-line p-7 shadow-soft"
            >
              <h2
                id={`cat-${category.id}`}
                className="mb-2 text-base tracking-[-0.03em]"
              >
                {category.label}
              </h2>
              <p className="mb-5 text-sm leading-7 text-muted-foreground">
                {category.description}
              </p>
              <ul className="flex flex-wrap gap-2" aria-label={`${category.label} integrations`}>
                {category.integrations.map((integration) => (
                  <li
                    key={`${category.id}-${integration.name}`}
                    className="rounded-full border border-brand-line bg-brand-elevated px-3.5 py-1.5 text-sm text-foreground"
                  >
                    {integration.name}
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      </SectionShell>

      {/* Footer CTA */}
      <SectionShell className="bg-brand-warm-sand/40 py-16 text-center sm:py-20">
        <SectionEyebrow className="mb-4">Ready to connect?</SectionEyebrow>
        <h2 className="mx-auto max-w-xl text-4xl tracking-[-0.05em]">
          Your tools are already there.
          <br />
          Kodi will meet them.
        </h2>
        <p className="mx-auto mt-5 max-w-md text-base leading-8 text-muted-foreground">
          Authorize once, and Kodi is ready to deliver follow-through in every tool
          you connect — without any manual routing.
        </p>
        <div className="mt-8 flex justify-center">
          <CTACluster
            primary={{ label: ctaConfig.primary.label, href: appUrl }}
          />
        </div>
      </SectionShell>
    </main>
  )
}
